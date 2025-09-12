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
  listForNeracaExpanded,
  updateLaporan,
  replaceDetailBarang,
  deleteDetailsByLaporan,
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
    const { jenis, deskripsi, debit, kredit, items, akun_id, tanggal, share_to_klaster, klaster_id } = req.body || {};

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

    // Ambil info user (klaster) sekali
    const { data: me } = await supabase.from('User').select('klaster_id').eq('user_id', req.user.user_id).single();

    // Tentukan klaster yang akan disimpan
    let klasterIdToSet = null;
    if (Object.prototype.hasOwnProperty.call(req.body, 'share_to_klaster')) {
      if (share_to_klaster) {
        if (!me?.klaster_id) return res.status(400).json({ message: 'User tidak memiliki klaster' });
        klasterIdToSet = me.klaster_id;
      } else {
        klasterIdToSet = null;
      }
    } else if (Object.prototype.hasOwnProperty.call(req.body, 'klaster_id')) {
      const candidate = req.body.klaster_id === null ? null : Number(req.body.klaster_id);
      if (candidate !== null && Number.isNaN(candidate)) {
        return res.status(400).json({ message: 'klaster_id harus angka atau null' });
      }
      if (!isAdmin(req.user.role)) {
        if (!me?.klaster_id || candidate !== me.klaster_id) {
          return res.status(403).json({ message: 'Forbidden: klaster_id bukan milik klastermu' });
        }
      }
      klasterIdToSet = candidate;
    }
    // Kalau tidak ada field share_to_klaster/klaster_id, default = null (tidak dishare)

    // Validasi akun (opsional)
    let akun = null;
    if (akun_id !== undefined && akun_id !== null) {
      const { data: ak, error: aerr } = await getAkunKasById(akun_id);
      if (aerr || !ak) return res.status(400).json({ message: 'akun_id tidak ditemukan' });

      const isOwner = ak.user_id && ak.user_id === req.user.user_id;
      const sameCluster = ak.klaster_id && me?.klaster_id && ak.klaster_id === me.klaster_id;
      if (!isAdmin(req.user.role) && !isOwner && !sameCluster) {
        return res.status(403).json({ message: 'Forbidden: akun kas bukan milikmu/klastermu' });
      }

      // Konsistensi klaster laporan vs akun (jika keduanya punya klaster)
      if (klasterIdToSet != null && ak.klaster_id != null && ak.klaster_id !== klasterIdToSet) {
        return res.status(400).json({ message: 'klaster_id laporan harus sama dengan klaster akun_kas' });
      }
      // Jika user share ke klaster tapi akun punya klaster, boleh turunkan dari akun
      if (klasterIdToSet == null && ak.klaster_id != null) {
        klasterIdToSet = ak.klaster_id; // opsional: otomatis ikut akun
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
      tanggal: tanggal !== undefined ? String(tanggal) : null,
      klaster_id: klasterIdToSet, // NEW
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
  const end   = req.query.end   ? new Date(req.query.end).toISOString()   : undefined;
  const tanggal = req.query.tanggal ? String(req.query.tanggal) : undefined;
  const scope = String(req.query.scope || 'mine'); // 'mine' | 'cluster'

  let id_user = undefined;
  let klaster_id = undefined;

  if (isAdmin(req.user.role)) {
    id_user = req.query.id_user ?? undefined;
    klaster_id = req.query.klaster_id ? Number(req.query.klaster_id) : undefined;
  } else {
    if (scope === 'cluster') {
      const { data: me } = await supabase.from('User').select('klaster_id').eq('user_id', req.user.user_id).single();
      klaster_id = me?.klaster_id ?? undefined;
      if (!klaster_id) return res.status(400).json({ message: 'Kamu tidak punya klaster' });
    } else {
      id_user = req.user.user_id;
    }
  }

  const { data, error, count } = await listLaporan({
    id_user, klaster_id, start, end, jenis, akun_id, page, limit, tanggal
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
  if (!isAdmin(req.user.role)) {
    if (header.id_user !== req.user.user_id) {
      // cek klaster jika laporan di-share
      const { data: me } = await supabase.from('User').select('klaster_id').eq('user_id', req.user.user_id).single();
      const sameCluster = header.klaster_id && me?.klaster_id && header.klaster_id === me.klaster_id;
      if (!sameCluster) return res.status(403).json({ message: 'Forbidden' });
    }
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
  kew_lancar:   { min: 4000, max: 4499 },
  kew_jangka:   { min: 4500, max: 4999 },
};

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


export async function updateLaporanController(req, res) {
  try {
    const id_laporan = String(req.params.id);
    const body = req.body || {};

    // 1) Ambil header & detail lama
    const oldHeaderRes = await getLaporanHeader(id_laporan);
    if (oldHeaderRes.error || !oldHeaderRes.data) {
      return res.status(404).json({ message: 'Laporan tidak ditemukan' });
    }
    const oldHeader = oldHeaderRes.data;

    // Otorisasi: hanya admin atau pemilik yang boleh edit
    if (!isAdmin(req.user.role) && oldHeader.id_user !== req.user.user_id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const oldDetailsRes = await getLaporanDetails(id_laporan);
    if (oldDetailsRes.error) {
      return res.status(500).json({ message: 'Gagal ambil detail lama', detail: oldDetailsRes.error.message });
    }
    const oldDetails = oldDetailsRes.data ?? [];

    // Ambil info user (untuk cek klaster)
    const { data: me } = await supabase
      .from('User')
      .select('klaster_id')
      .eq('user_id', req.user.user_id)
      .single();

    // 2) Siapkan nilai baru (default ke nilai lama jika tidak dikirim)
    const newJenis = body.jenis ? normalizeJenis(body.jenis) : oldHeader.jenis;
    if (!['pemasukan', 'pengeluaran'].includes(newJenis)) {
      return res.status(400).json({ message: 'jenis harus "pengeluaran" atau "pemasukan"' });
    }

    // Jika user ingin eksplisit mengosongkan akun → kirim akun_id = null
    const akunFieldSupplied = Object.prototype.hasOwnProperty.call(body, 'akun_id');
    const candidateAkunId = akunFieldSupplied ? (body.akun_id ?? null) : oldHeader.akun_id;

    const d = body.debit  !== undefined ? Number(body.debit)  : Number(oldHeader.debit || 0);
    const k = body.kredit !== undefined ? Number(body.kredit) : Number(oldHeader.kredit || 0);
    if (d < 0 || k < 0) return res.status(400).json({ message: 'debit/kredit tidak boleh negatif' });
    if (newJenis === 'pemasukan' && !(d > 0 && k === 0)) {
      return res.status(400).json({ message: 'untuk pemasukan: isi debit > 0 dan kredit = 0' });
    }
    if (newJenis === 'pengeluaran' && !(k > 0 && d === 0)) {
      return res.status(400).json({ message: 'untuk pengeluaran: isi kredit > 0 dan debit = 0' });
    }

    // 3) Validasi akun baru (jika diubah / diisi)
    let newAkun = null;
    if (candidateAkunId !== null && candidateAkunId !== undefined) {
      const { data: ak, error: aerr } = await getAkunKasById(Number(candidateAkunId));
      if (aerr || !ak) return res.status(400).json({ message: 'akun_id tidak ditemukan' });

      const admin = isAdmin(req.user.role);
      const owner = ak.user_id && ak.user_id === req.user.user_id;
      const sameCluster = ak.klaster_id && me?.klaster_id && ak.klaster_id === me.klaster_id;
      if (!admin && !owner && !sameCluster) {
        return res.status(403).json({ message: 'Forbidden: akun kas bukan milikmu/klastermu' });
      }
      newAkun = ak;
    }

    // 4) Tentukan klaster (share / unshare)
    let newKlasterId = (Object.prototype.hasOwnProperty.call(oldHeader, 'klaster_id') ? oldHeader.klaster_id : null);
    if (Object.prototype.hasOwnProperty.call(body, 'share_to_klaster')) {
      if (body.share_to_klaster) {
        if (!me?.klaster_id) return res.status(400).json({ message: 'User tidak memiliki klaster' });
        newKlasterId = me.klaster_id;
      } else {
        newKlasterId = null;
      }
    } else if (Object.prototype.hasOwnProperty.call(body, 'klaster_id')) {
      const candidate = body.klaster_id === null ? null : Number(body.klaster_id);
      if (candidate !== null && Number.isNaN(candidate)) {
        return res.status(400).json({ message: 'klaster_id harus angka atau null' });
      }
      if (!isAdmin(req.user.role)) {
        if (!me?.klaster_id || candidate !== me.klaster_id) {
          return res.status(403).json({ message: 'Forbidden: klaster_id bukan milik klastermu' });
        }
      }
      newKlasterId = candidate;
    }

    // Konsistensi klaster laporan vs akun_kas (jika dua-duanya punya klaster)
    if (newAkun && newAkun.klaster_id != null && newKlasterId != null && newAkun.klaster_id !== newKlasterId) {
      return res.status(400).json({ message: 'klaster_id laporan harus sama dengan klaster akun_kas' });
    }

    // 5) Validasi & normalisasi items (jika dikirim) atau cek konsistensi detail lama
    let normalizedItems = null; // null = tidak mengganti detail
    if (Array.isArray(body.items)) {
      normalizedItems = [];
      if (body.items.length === 0) {
        return res.status(400).json({ message: 'items tidak boleh kosong; hapus laporan saja jika ingin menghapus semua item' });
      }

      for (const it of body.items) {
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
      if (newJenis === 'pemasukan' && totalItems !== d) {
        return res.status(400).json({ message: `total subtotal items (${totalItems}) harus sama dengan debit (${d})` });
      }
      if (newJenis === 'pengeluaran' && totalItems !== k) {
        return res.status(400).json({ message: `total subtotal items (${totalItems}) harus sama dengan kredit (${k})` });
      }
    } else {
      const totalOldItems = (oldDetails ?? []).reduce((acc, it) => acc + Number(it.subtotal || 0), 0);
      if (newJenis === 'pemasukan' && totalOldItems !== d) {
        return res.status(400).json({ message: `items tidak dikirim, namun total detail lama (${totalOldItems}) tidak sama dengan debit baru (${d}). Sertakan items untuk menyesuaikan.` });
      }
      if (newJenis === 'pengeluaran' && totalOldItems !== k) {
        return res.status(400).json({ message: `items tidak dikirim, namun total detail lama (${totalOldItems}) tidak sama dengan kredit baru (${k}). Sertakan items untuk menyesuaikan.` });
      }
    }

    // 6) Hitung delta saldo lama vs baru
    const oldDelta = Number(oldHeader.debit || 0) - Number(oldHeader.kredit || 0);
    const newDelta = d - k;
    const oldAkunId = oldHeader.akun_id ?? null;
    const newAkunId = (candidateAkunId === undefined) ? oldAkunId : (candidateAkunId ?? null);

    // 7) Update header dulu
    const patch = {
      jenis: newJenis,
      deskripsi: body.deskripsi !== undefined ? (body.deskripsi ?? null) : oldHeader.deskripsi,
      debit: d,
      kredit: k,
      akun_id: newAkunId,
      tanggal: body.tanggal !== undefined ? (body.tanggal === null ? null : String(body.tanggal)) : oldHeader.tanggal,
      klaster_id: newKlasterId, // ← NEW
    };
    const updRes = await updateLaporan({ id_laporan, patch });
    if (updRes.error) {
      return res.status(500).json({ message: 'Gagal update header', detail: updRes.error.message });
    }

    // 8) Replace detail bila items dikirim
    if (normalizedItems) {
      const rep = await replaceDetailBarang(id_laporan, normalizedItems);
      if (rep.error) {
        // Rollback header ke nilai lama
        await updateLaporan({
          id_laporan,
          patch: {
            jenis: oldHeader.jenis,
            deskripsi: oldHeader.deskripsi,
            debit: oldHeader.debit,
            kredit: oldHeader.kredit,
            akun_id: oldHeader.akun_id,
            tanggal: oldHeader.tanggal ?? null,
            klaster_id: (Object.prototype.hasOwnProperty.call(oldHeader, 'klaster_id') ? oldHeader.klaster_id : null),
          }
        });
        return res.status(500).json({ message: 'Gagal update detail', detail: rep.error.message });
      }
    }

    // 9) Sinkron saldo_akhir akun kas
    async function applySaldoChanges() {
      if (oldAkunId === newAkunId) {
        if (newAkunId) {
          const diff = newDelta - oldDelta;
          if (diff !== 0) {
            const r = await incSaldoAkunKas(newAkunId, diff);
            if (r.error) throw new Error(r.error.message);
          }
        }
      } else {
        if (oldAkunId) {
          const r1 = await incSaldoAkunKas(oldAkunId, -oldDelta); // reversal
          if (r1.error) throw new Error(r1.error.message);
        }
        if (newAkunId) {
          const r2 = await incSaldoAkunKas(newAkunId, newDelta);
          if (r2.error) throw new Error(r2.error.message);
        }
      }
    }

    try {
      await applySaldoChanges();
    } catch (saldoErr) {
      // Rollback minimal: kembalikan header & detail lama
      await updateLaporan({
        id_laporan,
        patch: {
          jenis: oldHeader.jenis,
          deskripsi: oldHeader.deskripsi,
          debit: oldHeader.debit,
          kredit: oldHeader.kredit,
          akun_id: oldHeader.akun_id,
          tanggal: oldHeader.tanggal ?? null,
          klaster_id: (Object.prototype.hasOwnProperty.call(oldHeader, 'klaster_id') ? oldHeader.klaster_id : null),
        }
      });
      if (normalizedItems) {
        const oldItems = (oldDetails ?? []).map(it => ({
          produk_id: it.produk_id,
          jumlah: it.jumlah,
          subtotal: it.subtotal,
        }));
        await replaceDetailBarang(id_laporan, oldItems);
      }
      return res.status(500).json({ message: 'Gagal sinkron saldo akun', detail: String(saldoErr?.message || saldoErr) });
    }

    // 10) Ambil data terkini untuk response
    const newHeaderRes = await getLaporanHeader(id_laporan);
    const newDetailsRes = await getLaporanDetails(id_laporan);
    const header = newHeaderRes.data;
    const details = (newDetailsRes.data ?? []).map(it => ({
      ...it,
      harga_satuan: it.jumlah ? Math.floor(it.subtotal / it.jumlah) : null,
    }));

    return res.json({ message: 'Laporan diperbarui', header, details });
  } catch (e) {
    return res.status(500).json({ message: 'Internal error', detail: e.message });
  }
}

