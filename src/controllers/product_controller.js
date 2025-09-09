// src/controllers/product.controller.js
import {
  createProduct,
  listProducts,
  getProductById,
  updateProductById,
  deleteProductById,
} from '../models/product_model.js';

import {
  findKategoriByNameScoped,
  createKategoriAutoSmart,
} from '../models/kategori_model.js';

function validatePayload(body, { partial = false } = {}) {
  const errors = [];

  if (!partial) {
    if (!body?.nama || String(body.nama).trim() === '') errors.push('nama wajib diisi');
  }

  if (body?.harga !== undefined) {
    errors.push('field "harga" tidak didukung lagi; harga diinput saat membuat laporan');
  }

  if (body?.kategori_id !== undefined && body.kategori_id !== null && Number.isNaN(Number(body.kategori_id))) {
    errors.push('kategori_id harus berupa angka');
  }

  // kategori_nama opsional; kalau ada, harus string non-empty
  if (body?.kategori_nama !== undefined && String(body.kategori_nama).trim() === '') {
    errors.push('kategori_nama tidak boleh string kosong');
  }

  return errors;
}


export async function create(req, res) {
  const errors = validatePayload(req.body);
  if (errors.length) return res.status(400).json({ message: 'Validasi gagal', errors });

  const created_by = req.user.user_id;
  const owner_user_id = req.user.user_id;
  const owner_klaster_id = req.user.klaster_id ?? null;

  const nama = String(req.body.nama);
  let kategori_id = req.body.kategori_id != null ? Number(req.body.kategori_id) : null;
  const kategori_nama_input = req.body.kategori_nama ? String(req.body.kategori_nama).trim() : null;

  try {
    // jika kategori_id tidak diberikan → cari/buat otomatis
    if (!kategori_id) {
      const lookupName = kategori_nama_input || nama; // pakai kategori_nama jika ada, fallback ke nama produk
      // 1) coba find existing kategori by name (scoped)
      const { data: existingKat, error: findErr } = await findKategoriByNameScoped({
        nama: lookupName,
        owner_user_id,
        owner_klaster_id,
      });
      if (findErr) return res.status(500).json({ message: 'Gagal mencari kategori', detail: findErr.message });

      if (existingKat) {
        kategori_id = existingKat.kategori_id;
      } else {
        // 2) buat kategori baru dengan inference rules
        const { data: newKat, error: createKErr } = await createKategoriAutoSmart({
          nama: lookupName,
          produk_nama: nama,
          owner_user_id,
          owner_klaster_id,
        });
        if (createKErr) return res.status(500).json({ message: 'Gagal membuat kategori otomatis', detail: createKErr.message });
        kategori_id = newKat.kategori_id;
      }
    }

    // buat produk
    const { data, error } = await createProduct({ nama, kategori_id, created_by });
    if (error) return res.status(500).json({ message: 'Gagal membuat produk', detail: error.message });

    return res.status(201).json({ message: 'Produk dibuat', data });
  } catch (e) {
    return res.status(500).json({ message: 'Terjadi kesalahan', detail: e.message });
  }
}


export async function list(req, res) {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 10)));
  const search = String(req.query.search ?? '').trim();

  const { data, error, count } = await listProducts({ page, limit, search });
  if (error) return res.status(500).json({ message: 'Gagal mengambil produk', detail: error.message });

  return res.json({ page, limit, total: count ?? data?.length ?? 0, data });
}

export async function detail(req, res) {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: 'Param id tidak valid' });

  const { data, error } = await getProductById(id);
  if (error || !data) return res.status(404).json({ message: 'Produk tidak ditemukan' });

  return res.json({ data });
}

export async function update(req, res) {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: 'Param id tidak valid' });

  const errors = validatePayload(req.body, { partial: true });
  if (errors.length) return res.status(400).json({ message: 'Validasi gagal', errors });

  const owner_user_id = req.user.user_id;
  const owner_klaster_id = req.user.klaster_id ?? null;

  const payload = {};
  if (req.body.nama !== undefined) payload.nama = String(req.body.nama);

  // bisa update kategori dengan:
  // - kategori_id langsung, atau
  // - kategori_nama (akan find/auto-create)
  if (req.body.kategori_id !== undefined) {
    payload.kategori_id = req.body.kategori_id === null ? null : Number(req.body.kategori_id);
  } else if (req.body.kategori_nama !== undefined) {
    const lookupName = String(req.body.kategori_nama).trim();
    if (lookupName) {
      const { data: existingKat, error: findErr } = await findKategoriByNameScoped({
        nama: lookupName,
        owner_user_id,
        owner_klaster_id,
      });
      if (findErr) return res.status(500).json({ message: 'Gagal mencari kategori', detail: findErr.message });

      if (existingKat) {
        payload.kategori_id = existingKat.kategori_id;
      } else {
        const produkNamaForInference = payload.nama || (await (await getProductById(id)).data?.nama) || lookupName;
        const { data: newKat, error: createKErr } = await createKategoriAutoSmart({
          nama: lookupName,
          produk_nama: produkNamaForInference,
          owner_user_id,
          owner_klaster_id,
        });
        if (createKErr) return res.status(500).json({ message: 'Gagal membuat kategori otomatis', detail: createKErr.message });
        payload.kategori_id = newKat.kategori_id;
      }
    } else {
      payload.kategori_id = null; // kosongkan jika kategori_nama dikirim empty string (meski validasi sudah cegah)
    }
  }

  if (Object.keys(payload).length === 0) {
    return res.status(400).json({ message: 'Tidak ada field yang diupdate' });
  }

  const { data, error } = await updateProductById(id, payload);
  if (error) return res.status(500).json({ message: 'Gagal update produk', detail: error.message });

  return res.json({ message: 'Produk diupdate', data });
}

export async function remove(req, res) {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: 'Param id tidak valid' });

  // cek exist
  const { data: exists, error: selErr } = await getProductById(id);
  if (selErr || !exists) return res.status(404).json({ message: 'Produk tidak ditemukan' });

  const { error } = await deleteProductById(id);
  if (error) return res.status(500).json({ message: 'Gagal hapus produk', detail: error.message });

  return res.json({ message: 'Produk dihapus' });
}
