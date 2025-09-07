import supabase from '../config/supabase.js';
import {
  createAkunKas,
  listAkunKasVisible,
  getAkunKasById,
  deleteAkunKasById,
} from '../models/akun_kas_model.js';

function isAdmin(role) { return role === 'admin' || role === 'superadmin'; }

function validate(body) {
  const errors = [];
  if (!body?.nama || String(body.nama).trim() === '') errors.push('nama wajib diisi');
  if (body?.saldo_awal !== undefined && Number.isNaN(Number(body.saldo_awal))) {
    errors.push('saldo_awal harus berupa angka');
  }
  if (body?.saldo_akhir !== undefined && Number.isNaN(Number(body.saldo_akhir))) {
    errors.push('saldo_akhir harus berupa angka');
  }
  return errors;
}

async function getUserKlasterId(user_id) {
  const { data } = await supabase.from('User').select('klaster_id').eq('user_id', user_id).single();
  return data?.klaster_id ?? null;
}

// POST /api/akun-kas
export async function create(req, res) {
  const errors = validate(req.body);
  if (errors.length) return res.status(400).json({ message: 'Validasi gagal', errors });

  const { nama, deskripsi, saldo_awal = 0, saldo_akhir } = req.body;
  const owner_user_id = req.user.user_id;
  const owner_klaster_id = await getUserKlasterId(owner_user_id);

  const { data, error } = await createAkunKas({
    nama: String(nama),
    deskripsi: deskripsi ?? null,
    saldo_awal: Number(saldo_awal || 0),
    saldo_akhir: saldo_akhir === undefined ? undefined : Number(saldo_akhir),
    owner_user_id,
    owner_klaster_id,
  });
  if (error) return res.status(500).json({ message: 'Gagal membuat akun kas', detail: error.message });

  return res.status(201).json({ message: 'Akun kas dibuat', data });
}

// GET /api/akun-kas
export async function list(req, res) {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const search = String(req.query.search ?? '').trim();

  const viewer_user_id = req.user.user_id;
  const viewer_klaster_id = await getUserKlasterId(viewer_user_id);

  const { data, error, count } = await listAkunKasVisible({
    search, page, limit, viewer_user_id, viewer_klaster_id,
  });
  if (error) return res.status(500).json({ message: 'Gagal mengambil akun kas', detail: error.message });

  // Tidak ada perhitungan periode di sini — tampilkan apa adanya dari tabel
  return res.json({ page, limit, total: count ?? data?.length ?? 0, data });
}

// DELETE /api/akun-kas/:id  (pemilik/klaster/admin)
export async function remove(req, res) {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: 'Param id tidak valid' });

  const { data: exist, error } = await getAkunKasById(id);
  if (error || !exist) return res.status(404).json({ message: 'Akun kas tidak ditemukan' });

  const viewer_user_id = req.user.user_id;
  const viewer_klaster_id = await getUserKlasterId(viewer_user_id);
  const allowed =
    isAdmin(req.user.role) ||
    (exist.user_id && exist.user_id === viewer_user_id) ||
    (exist.klaster_id && viewer_klaster_id && exist.klaster_id === viewer_klaster_id);

  if (!allowed) return res.status(403).json({ message: 'Forbidden: bukan pemilik akun ini' });

  const del = await deleteAkunKasById(id);
  if (del.error) return res.status(500).json({ message: 'Gagal hapus akun kas', detail: del.error.message });

  return res.json({ message: 'Akun kas dihapus' });
}
