// src/controllers/finance.controller.js
import { randomUUID } from 'crypto';
import {
  getKategoriById,
  getProdukById,
  insertLaporan,
  insertDetailBarang,
  getLaporanHeader,
  getLaporanDetails,
  listLaporan,
  deleteLaporan,
  sumProfitLoss,
  listAruskas,
} from '../models/finance_model.js';

function isAdmin(role) {
  return role === 'admin' || role === 'superadmin';
}

function normalizeJenis(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * POST /api/keuangan/laporan
 * Aturan: debit = pemasukan, kredit = pengeluaran
 * - jenis 'pemasukan'  => debit > 0, kredit = 0
 * - jenis 'pengeluaran'=> kredit > 0, debit = 0
 * - kategori_id harus exist & sesuai jenis
 * - jika items ada, total subtotal items harus = nilai debit/kredit sesuai jenis
 */
export async function createLaporan(req, res) {
  try {
    const { jenis, kategori_id, deskripsi, debit, kredit, items } = req.body || {};

    const vJenis = normalizeJenis(jenis);
    if (!['pengeluaran', 'pemasukan'].includes(vJenis)) {
      return res.status(400).json({ message: 'jenis harus "pengeluaran" atau "pemasukan"' });
    }

    const d = Number(debit || 0);
    const k = Number(kredit || 0);
    if (d < 0 || k < 0) return res.status(400).json({ message: 'debit/kredit tidak boleh negatif' });

    // ✅ aturan khusus
    if (vJenis === 'pemasukan' && !(d > 0 && k === 0)) {
      return res.status(400).json({ message: 'untuk pemasukan: isi debit > 0 dan kredit = 0' });
    }
    if (vJenis === 'pengeluaran' && !(k > 0 && d === 0)) {
      return res.status(400).json({ message: 'untuk pengeluaran: isi kredit > 0 dan debit = 0' });
    }

    // Validasi kategori
    if (!kategori_id) return res.status(400).json({ message: 'kategori_id wajib diisi' });
    const { data: kat, error: katErr } = await getKategoriById(kategori_id);
    if (katErr || !kat) return res.status(400).json({ message: 'kategori_id tidak ditemukan' });
    if (!['pengeluaran', 'pemasukan'].includes(kat.jenis) || kat.jenis !== vJenis) {
      return res.status(400).json({ message: `kategori_id harus berjenis "${vJenis}"` });
    }

    // Validasi & normalisasi items
    let normalizedItems = [];
    if (Array.isArray(items) && items.length) {
      for (const it of items) {
        if (!it?.produk_id || !it?.jumlah) {
          return res.status(400).json({ message: 'setiap item harus punya produk_id & jumlah' });
        }
        const { data: prod, error: pErr } = await getProdukById(it.produk_id);
        if (pErr || !prod) return res.status(400).json({ message: `produk_id ${it.produk_id} tidak ditemukan` });

        const jumlah = Number(it.jumlah);
        if (Number.isNaN(jumlah) || jumlah <= 0) {
          return res.status(400).json({ message: 'jumlah harus angka > 0' });
        }

        const computed = prod.harga * jumlah;
        const subtotal = it.subtotal !== undefined ? Number(it.subtotal) : computed;
        if (Number.isNaN(subtotal) || subtotal <= 0) {
          return res.status(400).json({ message: 'subtotal harus angka > 0' });
        }

        normalizedItems.push({
          produk_id: prod.produk_id,
          jumlah,
          subtotal,
        });
      }

      // Total items harus sama dengan nilai debit/kredit
      const totalItems = normalizedItems.reduce((a, b) => a + b.subtotal, 0);
      if (vJenis === 'pemasukan' && totalItems !== d) {
        return res.status(400).json({
          message: `total subtotal items (${totalItems}) harus sama dengan debit (${d})`,
        });
      }
      if (vJenis === 'pengeluaran' && totalItems !== k) {
        return res.status(400).json({
          message: `total subtotal items (${totalItems}) harus sama dengan kredit (${k})`,
        });
      }
    }

    // Insert header
    const id_laporan = randomUUID();
    const { data: header, error: hErr } = await insertLaporan({
      id_laporan,
      id_user: req.user.user_id,
      jenis: vJenis,
      kategori_id,
      deskripsi,
      debit: d,
      kredit: k,
    });
    if (hErr) return res.status(500).json({ message: 'Gagal membuat laporan', detail: hErr.message });

    // Insert detail
    if (normalizedItems.length) {
      const det = await insertDetailBarang(id_laporan, normalizedItems);
      if (det.error) {
        // rollback header bila detail gagal
        await deleteLaporan(id_laporan);
        return res.status(500).json({ message: 'Gagal menyimpan detail barang', detail: det.error.message });
      }
    }

    return res.status(201).json({ message: 'Laporan dibuat', data: header });
  } catch (e) {
    return res.status(500).json({ message: 'Internal error', detail: e.message });
  }
}

/**
 * GET /api/keuangan/laporan
 * User biasa: hanya miliknya; Admin/Superadmin: bisa filter ?id_user=<uuid>
 */
export async function listLaporanController(req, res) {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 10)));
  const jenis = req.query.jenis ? normalizeJenis(req.query.jenis) : undefined;
  const kategori_id = req.query.kategori_id ? Number(req.query.kategori_id) : undefined;
  const start = req.query.start ? new Date(req.query.start).toISOString() : undefined;
  const end = req.query.end ? new Date(req.query.end).toISOString() : undefined;

  const ownerOnly = !isAdmin(req.user.role);
  const id_user = ownerOnly ? req.user.user_id : (req.query.id_user ?? undefined);

  const { data, error, count } = await listLaporan({
    id_user, start, end, jenis, kategori_id, page, limit,
  });

  if (error) return res.status(500).json({ message: 'Gagal mengambil laporan', detail: error.message });
  return res.json({ page, limit, total: count ?? data?.length ?? 0, data });
}

/**
 * GET /api/keuangan/laporan/:id
 */
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

  return res.json({ header, details: detailsRes.data ?? [] });
}

/**
 * DELETE /api/keuangan/laporan/:id
 */
export async function deleteLaporanController(req, res) {
  const id_laporan = String(req.params.id);

  const headerRes = await getLaporanHeader(id_laporan);
  if (headerRes.error || !headerRes.data) return res.status(404).json({ message: 'Laporan tidak ditemukan' });

  const header = headerRes.data;
  if (!isAdmin(req.user.role) && header.id_user !== req.user.user_id) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const del = await deleteLaporan(id_laporan);
  if (del.error) return res.status(500).json({ message: 'Gagal hapus', detail: del.error.message });

  return res.json({ message: 'Laporan dihapus' });
}

/**
 * GET /api/keuangan/laba-rugi?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Aturan: debit = pemasukan, kredit = pengeluaran
 */
export async function getLabaRugi(req, res) {
  const start = req.query.start ? new Date(req.query.start).toISOString() : undefined;
  const end = req.query.end ? new Date(req.query.end).toISOString() : undefined;

  const ownerOnly = !isAdmin(req.user.role);
  const id_user = ownerOnly ? req.user.user_id : (req.query.id_user ?? undefined);

  const { data, error } = await sumProfitLoss({ id_user, start, end });
  if (error) return res.status(500).json({ message: 'Gagal mengambil data', detail: error.message });

  let totalPemasukan = 0;   // dari DEBIT
  let totalPengeluaran = 0; // dari KREDIT
  const perKategori = {};   // opsional: agregasi per kategori

  for (const row of data ?? []) {
    if (row.jenis === 'pemasukan') {
      const val = Number(row.debit || 0);
      totalPemasukan += val;
      if (row.kategori_id) {
        perKategori[row.kategori_id] = perKategori[row.kategori_id] || { pemasukan: 0, pengeluaran: 0 };
        perKategori[row.kategori_id].pemasukan += val;
      }
    }
    if (row.jenis === 'pengeluaran') {
      const val = Number(row.kredit || 0);
      totalPengeluaran += val;
      if (row.kategori_id) {
        perKategori[row.kategori_id] = perKategori[row.kategori_id] || { pemasukan: 0, pengeluaran: 0 };
        perKategori[row.kategori_id].pengeluaran += val;
      }
    }
  }

  const labaRugi = totalPemasukan - totalPengeluaran;

  return res.json({
    periode: { start: start ?? null, end: end ?? null },
    total_pemasukan: totalPemasukan,
    total_pengeluaran: totalPengeluaran,
    laba_rugi: labaRugi,
    per_kategori: perKategori,
  });

}

export async function getArusKas(req, res) {
    const arah = String(req.query.arah || '').toLowerCase();
    if (!['masuk', 'keluar'].includes(arah)) {
      return res.status(400).json({ message: 'param arah harus "masuk" atau "keluar"' });
    }
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 10)));
    const kategori_id = req.query.kategori_id ? Number(req.query.kategori_id) : undefined;

    // rentang tanggal
    const start = req.query.start ? new Date(req.query.start).toISOString() : undefined;
    const end = req.query.end ? new Date(req.query.end).toISOString() : undefined;
    // akses data: 
    const isAdmin = (req.user.role === 'admin' || req.user.role === 'superadmin');
    const id_user = isAdmin ? (req.query.id_user ?? undefined) : req.user.user_id;

    const { data, error, count } = await listAruskas({
      id_user, start, end, arah, kategori_id, page, limit,
    });

    if (error) return res.status(500).json({ message: 'Gagal mengambil arus kas', detail: error.message });

    // total nilai untuk arah yang diminta
    const total_nilai = (data ?? []).reduce((acc, row) => {
      if (arah === 'masuk') return acc + Number(row.debit || 0);
      return acc + Number(row.kredit || 0);
    }, 0);

    return res.json({
      meta:{
        arah, page, limit,
        total_rowsL: count ?? (data?.length ?? 0),
        total_nilai
      },
      data
    })
  }