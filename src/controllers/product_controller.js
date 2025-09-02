// src/controllers/product.controller.js
import supabase from '../config/supabase.js';
import {
  createProduct,
  listProducts,
  getProductById,
  updateProductById,
  deleteProductById,
} from '../models/product_model.js';

function validatePayload(body, { partial = false } = {}) {
  const errors = [];

  if (!partial) {
    if (!body?.nama || String(body.nama).trim() === '') errors.push('nama wajib diisi');
    if (body?.harga === undefined || body?.harga === null || Number.isNaN(Number(body.harga))) {
      errors.push('harga wajib berupa angka');
    }
  }

  if (partial && body?.harga !== undefined && Number.isNaN(Number(body.harga))) {
    errors.push('harga harus berupa angka');
  }

  if (body?.kategori_id !== undefined && body.kategori_id !== null && Number.isNaN(Number(body.kategori_id))) {
    errors.push('kategori_id harus berupa angka');
  }

  return errors;
}

export async function create(req, res) {
  const errors = validatePayload(req.body);
  if (errors.length) return res.status(400).json({ message: 'Validasi gagal', errors });

  const { nama, harga, kategori_id = null } = req.body;
  const created_by = req.user.user_id;

  const { data, error } = await createProduct({
    nama: String(nama),
    harga: Number(harga),
    kategori_id: kategori_id ? Number(kategori_id) : null,
    created_by,
  });

  if (error) return res.status(500).json({ message: 'Gagal membuat produk', detail: error.message });
  return res.status(201).json({ message: 'Produk dibuat', data });
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

  const payload = {};
  if (req.body.nama !== undefined) payload.nama = String(req.body.nama);
  if (req.body.harga !== undefined) payload.harga = Number(req.body.harga);
  if (req.body.kategori_id !== undefined) {
    payload.kategori_id = req.body.kategori_id === null ? null : Number(req.body.kategori_id);
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

