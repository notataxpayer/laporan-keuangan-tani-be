// src/controllers/finance_controller.js
import { randomUUID } from 'crypto';
import supabase from '../config/supabase.js';
import {
  getProdukById,
  insertLaporan,
  insertDetailBarang,
  getLaporanHeader,
  getLaporanDetails,
  listLaporan,
  deleteLaporan,
  sumProfitLoss,
  listAruskas,
  listForNeracaByItems,
  listForNeracaExpanded
} from '../models/finance_model.js';
import { getAkunKasById, incSaldoAkunKas } from '../models/akun_kas_model.js';
import { buildNeracaNested } from '../config/neraca_builder.js';
function isAdmin(role) { return role === 'admin' || role === 'superadmin'; }
function normalizeJenis(value) { return String(value || '').trim().toLowerCase(); }

/**
 * POST /api/keuangan/laporan
 * - jenis 'pemasukan' => debit > 0, kredit = 0
 * - jenis 'pengeluaran' => kredit > 0, debit = 0
 * - tidak ada kategori_id
 * - items: [{ produk_id, jumlah, harga_satuan? | subtotal? }]
 *   * total items harus sama dg debit/kredit sesuai jenis
 * - akun_id opsional; jika ada => saldo_akhir += (debit - kredit)
 */
export async function createLaporan(req, res) {
  try {
    const { jenis, deskripsi, debit, kredit, items, akun_id } = req.body || {};

    const vJenis = normalizeJenis(jenis);
    if (!['pengeluaran', 'pemasukan'].includes(vJenis)) {
      return res.status(400).json({ message: 'jenis harus "pengeluaran" atau "pemasukan"' });
    }

    const d = Number(debit || 0);
    const k = Number(kredit || 0);
    if (d < 0 || k < 0) return res.status(400).json({ message: 'debit/kredit tidak boleh negatif' });
    if (vJenis === 'pemasukan' && !(d > 0 && k === 0)) {
      return res.status(400).json({ message: 'untuk pemasukan: isi debit > 0 dan kredit = 0' });
    }
    if (vJenis === 'pengeluaran' && !(k > 0 && d === 0)) {
      return res.status(400).json({ message: 'untuk pengeluaran: isi kredit > 0 dan debit = 0' });
    }

    // Validasi akun (opsional)
    let akun = null;
    if (akun_id !== undefined && akun_id !== null) {
      const { data: ak, error: aerr } = await getAkunKasById(akun_id);
      if (aerr || !ak) return res.status(400).json({ message: 'akun_id tidak ditemukan' });
      const { data: u } = await supabase.from('User').select('klaster_id').eq('user_id', req.user.user_id).single();
      const isOwner = ak.user_id && ak.user_id === req.user.user_id;
      const sameCluster = ak.klaster_id && u?.klaster_id && ak.klaster_id === u.klaster_id;
      if (!isAdmin(req.user.role) && !isOwner && !sameCluster) {
        return res.status(403).json({ message: 'Forbidden: akun kas bukan milikmu/klastermu' });
      }
      akun = ak;
    }

    // Validasi & normalisasi items
    let normalizedItems = [];
    if (Array.isArray(items) && items.length) {
      for (const it of items) {
        const pid = Number(it?.produk_id);
        const jumlah = Number(it?.jumlah);
        const hargaSatuan = it?.harga_satuan !== undefined ? Number(it.harga_satuan) : undefined;
        const subtotalIn = it?.subtotal !== undefined ? Number(it.subtotal) : undefined;

        if (Number.isNaN(pid) || pid <= 0) return res.status(400).json({ message: 'produk_id harus valid' });
        if (Number.isNaN(jumlah) || jumlah <= 0) return res.status(400).json({ message: 'jumlah harus angka > 0' });

        const { data: prod, error: pErr } = await getProdukById(pid);
        if (pErr || !prod) return res.status(400).json({ message: `produk_id ${pid} tidak ditemukan` });

        let subtotal;
        if (hargaSatuan !== undefined) {
          if (Number.isNaN(hargaSatuan) || hargaSatuan <= 0) return res.status(400).json({ message: 'harga_satuan harus angka > 0' });
          subtotal = hargaSatuan * jumlah;
        } else if (subtotalIn !== undefined) {
          if (Number.isNaN(subtotalIn) || subtotalIn <= 0) return res.status(400).json({ message: 'subtotal harus angka > 0' });
          subtotal = subtotalIn;
        } else {
          return res.status(400).json({ message: 'setiap item wajib punya harga_satuan atau subtotal' });
        }

        normalizedItems.push({ produk_id: pid, jumlah, subtotal });
      }

      const totalItems = normalizedItems.reduce((a, b) => a + b.subtotal, 0);
      if (vJenis === 'pemasukan' && totalItems !== d) {
        return res.status(400).json({ message: `total subtotal items (${totalItems}) harus sama dengan debit (${d})` });
      }
      if (vJenis === 'pengeluaran' && totalItems !== k) {
        return res.status(400).json({ message: `total subtotal items (${totalItems}) harus sama dengan kredit (${k})` });
      }
    }

    // Insert header
    const id_laporan = randomUUID();
    const { data: header, error: hErr } = await insertLaporan({
      id_laporan,
      id_user: req.user.user_id,
      akun_id: akun ? akun.akun_id : null,
      jenis: vJenis,
      deskripsi,
      debit: d,
      kredit: k,
    });
    if (hErr) return res.status(500).json({ message: 'Gagal membuat laporan', detail: hErr.message });

    // Insert detail
    if (normalizedItems.length) {
      const det = await insertDetailBarang(id_laporan, normalizedItems);
      if (det.error) {
        await deleteLaporan(id_laporan);
        return res.status(500).json({ message: 'Gagal menyimpan detail barang', detail: det.error.message });
      }
    }

    // Update saldo_akhir akun (jika ada)
    if (akun?.akun_id) {
      const delta = d - k; // debit +, kredit -
      const up = await incSaldoAkunKas(akun.akun_id, delta);
      if (up.error) {
        await deleteLaporan(id_laporan); // rollback agar konsisten
        return res.status(500).json({ message: 'Gagal update saldo akun', detail: up.error.message });
      }
    }

    return res.status(201).json({ message: 'Laporan dibuat', data: header });
  } catch (e) {
    return res.status(500).json({ message: 'Internal error', detail: e.message });
  }
}

/** GET /api/keuangan/laporan */
export async function listLaporanController(req, res) {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 10)));
  const jenis = req.query.jenis ? normalizeJenis(req.query.jenis) : undefined;
  const akun_id = req.query.akun_id ? Number(req.query.akun_id) : undefined;
  const start = req.query.start ? new Date(req.query.start).toISOString() : undefined;
  const end = req.query.end ? new Date(req.query.end).toISOString() : undefined;

  const ownerOnly = !isAdmin(req.user.role);
  const id_user = ownerOnly ? req.user.user_id : (req.query.id_user ?? undefined);

  const { data, error, count } = await listLaporan({
    id_user, start, end, jenis, akun_id, page, limit,
  });

  if (error) return res.status(500).json({ message: 'Gagal mengambil laporan', detail: error.message });
  return res.json({ page, limit, total: count ?? data?.length ?? 0, data });
}

/** GET /api/keuangan/laporan/:id */
export async function getLaporanDetail(req, res) {
  const id_laporan = String(req.params.id);

  const headerRes = await getLaporanHeader(id_laporan);
  if (headerRes.error || !headerRes.data) return res.status(404).json({ message: 'Laporan tidak ditemukan' });

  const header = headerRes.data;
  if (!isAdmin(req.user.role) && header.id_user !== req.user.user_id) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const detailsRes = await getLaporanDetails(id_laporan);
  if (detailsRes.error) return res.status(500).json({ message: 'Gagal ambil detail', detail: detailsRes.error.message });

  const details = (detailsRes.data ?? []).map(it => ({
    ...it,
    harga_satuan: it.jumlah ? Math.floor(it.subtotal / it.jumlah) : null,
  }));

  return res.json({ header, details });
}

/** DELETE /api/keuangan/laporan/:id */
export async function deleteLaporanController(req, res) {
  const id_laporan = String(req.params.id);

  const headerRes = await getLaporanHeader(id_laporan);
  if (headerRes.error || !headerRes.data) return res.status(404).json({ message: 'Laporan tidak ditemukan' });

  const header = headerRes.data;
  if (!isAdmin(req.user.role) && header.id_user !== req.user.user_id) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  // Reversal saldo akun (jika ada)
  if (header.akun_id) {
    const delta = -(Number(header.debit || 0) - Number(header.kredit || 0));
    const up = await incSaldoAkunKas(header.akun_id, delta);
    if (up.error) {
      return res.status(500).json({ message: 'Gagal update saldo akun (reversal)', detail: up.error.message });
    }
  }

  const del = await deleteLaporan(id_laporan);
  if (del.error) return res.status(500).json({ message: 'Gagal hapus', detail: del.error.message });

  return res.json({ message: 'Laporan dihapus' });
}

/** GET /api/keuangan/laba-rugi?start=&end=&id_user= */
export async function getLabaRugi(req, res) {
  const start = req.query.start ? new Date(req.query.start).toISOString() : undefined;
  const end = req.query.end ? new Date(req.query.end).toISOString() : undefined;

  const ownerOnly = !isAdmin(req.user.role);
  const id_user = ownerOnly ? req.user.user_id : (req.query.id_user ?? undefined);

  const { data, error } = await sumProfitLoss({ id_user, start, end });
  if (error) return res.status(500).json({ message: 'Gagal mengambil data', detail: error.message });

  let totalPemasukan = 0;   // DEBIT
  let totalPengeluaran = 0; // KREDIT

  for (const row of data ?? []) {
    if (row.jenis === 'pemasukan') totalPemasukan += Number(row.debit || 0);
    if (row.jenis === 'pengeluaran') totalPengeluaran += Number(row.kredit || 0);
  }

  const labaRugi = totalPemasukan - totalPengeluaran;

  return res.json({
    periode: { start: start ?? null, end: end ?? null },
    total_pemasukan: totalPemasukan,
    total_pengeluaran: totalPengeluaran,
    laba_rugi: labaRugi
  });
}

/** GET /api/keuangan/arus-kas?arah=masuk|keluar&akun_id=&start=&end=&page=&limit= */
export async function getArusKas(req, res) {
  const arah = String(req.query.arah || '').toLowerCase();
  if (!['masuk', 'keluar'].includes(arah)) {
    return res.status(400).json({ message: 'param arah harus "masuk" atau "keluar"' });
  }
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 10)));
  const akun_id = req.query.akun_id ? Number(req.query.akun_id) : undefined;

  const start = req.query.start ? new Date(req.query.start).toISOString() : undefined;
  const end   = req.query.end   ? new Date(req.query.end).toISOString()   : undefined;

  const isAdm = isAdmin(req.user.role);
  const id_user = isAdm ? (req.query.id_user ?? undefined) : req.user.user_id;

  const { data, error, count } = await listAruskas({
    id_user, start, end, arah, akun_id, page, limit,
  });
  if (error) return res.status(500).json({ message: 'Gagal mengambil arus kas', detail: error.message });

  const total_nilai = (data ?? []).reduce((acc, row) => {
    return acc + (arah === 'masuk' ? Number(row.debit || 0) : Number(row.kredit || 0));
  }, 0);

  return res.json({
    meta: { arah, page, limit, total_rows: count ?? (data?.length ?? 0), total_nilai },
    data
  });
}

// ---- NERACA via detail items + neraca_identifier
const RANGES = {
  aset_lancar:  { min: 0,    max: 2599 },
  aset_tetap:   { min: 2600, max: 3599 },
  kewajiban:    { min: 4000, max: 4999 },
};

export async function getNeraca(req, res) {
  const start = req.query.start ? new Date(req.query.start).toISOString() : undefined;
  const end   = req.query.end   ? new Date(req.query.end).toISOString()   : undefined;

  const ownerOnly = !isAdmin(req.user.role);
  const id_user = ownerOnly ? req.user.user_id : (req.query.id_user ?? undefined);

  const resp = await listForNeracaByItems({ id_user, start, end });
  if (resp.error) return res.status(500).json({ message: 'Gagal mengambil data neraca', detail: resp.error.message });

  const sumByRange = (min, max) => {
    let debit = 0, kredit = 0;
    for (const r of resp.data ?? []) {
      const ni = r.neraca_identifier;
      if (ni === null || ni === undefined) continue;
      if (ni >= min && ni <= max) {
        if (r.jenis === 'pemasukan') debit += r.subtotal;
        else if (r.jenis === 'pengeluaran') kredit += r.subtotal;
      }
    }
    return { debit, kredit, saldo: debit - kredit };
  };

  const asetLancar = sumByRange(RANGES.aset_lancar.min, RANGES.aset_lancar.max);
  const asetTetap  = sumByRange(RANGES.aset_tetap.min,  RANGES.aset_tetap.max);
  const kewajiban  = sumByRange(RANGES.kewajiban.min,   RANGES.kewajiban.max);

  return res.json({
    periode: { start: start ?? null, end: end ?? null },
    aset_lancar: asetLancar,
    aset_tetap: asetTetap,
    kewajiban: kewajiban,
    total_aset: asetLancar.saldo + asetTetap.saldo,
    total_kewajiban: kewajiban.saldo,
    seimbang: (asetLancar.saldo + asetTetap.saldo) === kewajiban.saldo
  });
}

export async function getArusKasByAkun(req, res) {
  const akun_id = Number(req.query.akun_id);
  if (Number.isNaN(akun_id)) {
    return res.status(400).json({ message: 'akun_id wajib angka' });
  }

  // validasi kepemilikan akun kas
  const { data: akun, error: akunErr } = await getAkunKasById(akun_id);
  if (akunErr || !akun) return res.status(404).json({ message: 'Akun kas tidak ditemukan' });

  const { data: me } = await supabase
    .from('User')
    .select('klaster_id')
    .eq('user_id', req.user.user_id)
    .single();

  const admin = req.user.role === 'admin' || req.user.role === 'superadmin';
  const owner = akun.user_id && akun.user_id === req.user.user_id;
  const sameCluster = akun.klaster_id && me?.klaster_id && akun.klaster_id === me.klaster_id;
  if (!admin && !owner && !sameCluster) {
    return res.status(403).json({ message: 'Forbidden: akun kas bukan milikmu/klastermu' });
  }

  const page  = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 10)));
  const start = req.query.start ? new Date(req.query.start).toISOString() : undefined;
  const end   = req.query.end   ? new Date(req.query.end).toISOString()   : undefined;

  // bila admin, boleh lihat transaksi user lain di akun ini via ?id_user=; kalau tidak diisi, ambil semua di akun tsb
  const id_user = admin ? (req.query.id_user ?? undefined) : req.user.user_id;

  // ambil dua arah sekaligus
  const [masukRes, keluarRes] = await Promise.all([
    listAruskas({ id_user, start, end, arah: 'masuk',  akun_id, page, limit }),
    listAruskas({ id_user, start, end, arah: 'keluar', akun_id, page, limit }),
  ]);

  if (masukRes.error)  return res.status(500).json({ message: 'Gagal ambil arus kas masuk',  detail: masukRes.error.message });
  if (keluarRes.error) return res.status(500).json({ message: 'Gagal ambil arus kas keluar', detail: keluarRes.error.message });

  const totalMasuk  = (masukRes.data  ?? []).reduce((a, r) => a + Number(r.debit  || 0), 0);
  const totalKeluar = (keluarRes.data ?? []).reduce((a, r) => a + Number(r.kredit || 0), 0);

  return res.json({
    meta: {
      akun_id,
      periode: { start: start ?? null, end: end ?? null },
      page, limit,
      total_rows_masuk:  masukRes.count  ?? (masukRes.data?.length  ?? 0),
      total_rows_keluar: keluarRes.count ?? (keluarRes.data?.length ?? 0),
      total_masuk:  totalMasuk,
      total_keluar: totalKeluar,
      net: totalMasuk - totalKeluar
    },
    masuk:  masukRes.data  ?? [],
    keluar: keluarRes.data ?? []
  });
}