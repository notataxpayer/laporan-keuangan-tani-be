// src/controllers/kategori.controller.js
import supabase from '../config/supabase.js';
import {
  createKategoriAuto,
  listKategoriVisible,
  getKategoriById,
  deleteKategoriById,
  countProdukByKategori,
  countLapkeuanganByKategori,
} from '../models/kategori_model.js';

const ALLOWED = ['pengeluaran', 'pemasukan', 'produk', 'pasar'];

function isAdmin(role) {
  return role === 'admin' || role === 'superadmin';
}

function validate(body) {
  const errors = [];
  if (!body?.nama || String(body.nama).trim() === '') errors.push('nama wajib diisi');
  const j = String(body?.jenis ?? '').trim().toLowerCase();
  if (!ALLOWED.includes(j)) errors.push(`jenis wajib salah satu dari: ${ALLOWED.join(', ')}`);
  return errors;
}

// helper ambil klaster_id user fresh dari DB (kalau token belum bawa klaster_id)
async function getUserKlasterId(user_id) {
  const { data, error } = await supabase
    .from('User')
    .select('klaster_id')
    .eq('user_id', user_id)
    .single();
  if (error) return null;
  return data?.klaster_id ?? null;
}

// POST /api/kategori
export async function create(req, res) {
  const errors = validate(req.body);
  if (errors.length) return res.status(400).json({ message: 'Validasi gagal', errors });

  const nama = String(req.body.nama).trim();
  const jenis = String(req.body.jenis).trim().toLowerCase();
  const owner_user_id = req.user.user_id;
  const owner_klaster_id = await getUserKlasterId(owner_user_id); // bisa null

  const { data, error } = await createKategoriAuto({
    nama,
    jenis,
    owner_user_id,
    owner_klaster_id,
  });

  if (error) {
    return res.status(500).json({ message: 'Gagal membuat kategori', detail: error.message });
  }
  return res.status(201).json({ message: 'Kategori dibuat', data });
}

// GET /api/kategori
export async function list(req, res) {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const search = String(req.query.search ?? '').trim();
  const jenis  = req.query.jenis ? String(req.query.jenis).toLowerCase() : undefined;

  const viewer_user_id = req.user.user_id;
  const viewer_klaster_id = await getUserKlasterId(viewer_user_id);

  const { data, error, count } = await listKategoriVisible({
    jenis, search, page, limit, viewer_user_id, viewer_klaster_id,
  });
  if (error) return res.status(500).json({ message: 'Gagal mengambil kategori', detail: error.message });

  return res.json({ page, limit, total: count ?? data?.length ?? 0, data });
}

// DELETE /api/kategori/:id
export async function remove(req, res) {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: 'Param id tidak valid' });

  const { data: exist, error: selErr } = await getKategoriById(id);
  if (selErr || !exist) return res.status(404).json({ message: 'Kategori tidak ditemukan' });

  const viewer_user_id = req.user.user_id;
  const viewer_klaster_id = await getUserKlasterId(viewer_user_id);

  const allowed =
    isAdmin(req.user.role) ||
    (exist.user_id && exist.user_id === viewer_user_id) ||
    (exist.klaster_id && viewer_klaster_id && exist.klaster_id === viewer_klaster_id);

  if (!allowed) return res.status(403).json({ message: 'Forbidden: bukan pemilik kategori' });

  const { count: prodCount, error: prodErr } = await countProdukByKategori(id);
  if (prodErr) return res.status(500).json({ message: 'Gagal cek referensi produk', detail: prodErr.message });
  if ((prodCount ?? 0) > 0) {
    return res.status(409).json({ message: 'Kategori dipakai oleh produk—tidak bisa dihapus' });
  }

  const { count: lapCount, error: lapErr } = await countLapkeuanganByKategori(id);
  if (lapErr) return res.status(500).json({ message: 'Gagal cek referensi laporan', detail: lapErr.message });
  if ((lapCount ?? 0) > 0) {
    return res.status(409).json({ message: 'Kategori dipakai di laporan keuangan—tidak bisa dihapus' });
  }

  const { error: delErr } = await deleteKategoriById(id);
  if (delErr) return res.status(500).json({ message: 'Gagal hapus kategori', detail: delErr.message });

  return res.json({ message: 'Kategori dihapus' });
}
