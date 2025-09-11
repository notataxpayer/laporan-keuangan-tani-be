// src/controllers/klaster_controller.js
import supabase from '../config/supabase.js';
import {
  createCluster,
  getClusterById,
  listClusters,
  updateCluster,
  deleteCluster,
  setUserCluster,
  getUsersInCluster,
} from '../models/klaster_model.js';

function isAdmin(role) {
  return role === 'admin' || role === 'superadmin';
}

// POST /api/klaster  (admin/superadmin only)
export async function create(req, res) {
  if (!isAdmin(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden: hanya admin/superadmin' });
  }

  const nama_klaster = String(req.body?.nama_klaster || '').trim();
  if (!nama_klaster) {
    return res.status(400).json({ message: 'nama_klaster wajib diisi' });
  }

  // Opsional: 1 user cuma boleh 1 klaster → jika admin sudah punya klaster, tolak
  if (req.user.klaster_id) {
    return res.status(409).json({ message: 'Kamu sudah tergabung di klaster lain' });
  }

  const { data: kl, error } = await createCluster({ nama_klaster });
  if (error) return res.status(500).json({ message: 'Gagal membuat klaster', detail: error.message });

  // jadikan pembuat sebagai anggota klaster (owner/admin—di skema ini kita set klaster_id user)
  const up = await setUserCluster(req.user.user_id, kl.klaster_id);
  if (up.error) {
    // rollback jika perlu
    return res.status(500).json({ message: 'Gagal mengaitkan user dengan klaster', detail: up.error.message });
  }

  return res.status(201).json({ message: 'Klaster dibuat', data: kl });
}

// GET /api/klaster (admin/superadmin bisa lihat semua; user biasa boleh lihat punyaknya sendiri via /me)
export async function list(req, res) {
  if (!isAdmin(req.user.role)) {
    // untuk user biasa, kembalikan hanya klasternya (atau kosong jika belum punya)
    if (!req.user.klaster_id) return res.json({ page: 1, limit: 1, total: 0, data: [] });
    const one = await getClusterById(req.user.klaster_id);
    if (one.error || !one.data) return res.json({ page: 1, limit: 1, total: 0, data: [] });
    return res.json({ page: 1, limit: 1, total: 1, data: [one.data] });
  }

  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const search = String(req.query.search ?? '').trim();

  const { data, error, count } = await listClusters({ page, limit, search });
  if (error) return res.status(500).json({ message: 'Gagal mengambil klaster', detail: error.message });

  return res.json({ page, limit, total: count ?? data?.length ?? 0, data });
}

// GET /api/klaster/me  → info klaster saya + members
export async function myCluster(req, res) {
  if (!req.user.klaster_id) return res.status(404).json({ message: 'Kamu belum tergabung di klaster' });

  const { data: kl, error } = await getClusterById(req.user.klaster_id);
  if (error || !kl) return res.status(404).json({ message: 'Klaster tidak ditemukan' });

  const members = await getUsersInCluster(req.user.klaster_id);
  if (members.error) return res.status(500).json({ message: 'Gagal mengambil anggota', detail: members.error.message });

  return res.json({ klaster: kl, members: members.data ?? [] });
}

// GET /api/klaster/:id (admin/superadmin; user biasa hanya jika id == klaster-nya)
export async function detail(req, res) {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: 'Param id tidak valid' });

  if (!isAdmin(req.user.role) && Number(req.user.klaster_id) !== id) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { data, error } = await getClusterById(id);
  if (error || !data) return res.status(404).json({ message: 'Klaster tidak ditemukan' });

  const members = await getUsersInCluster(id);
  if (members.error) return res.status(500).json({ message: 'Gagal mengambil anggota', detail: members.error.message });

  return res.json({ klaster: data, members: members.data ?? [] });
}

// PATCH /api/klaster/:id (admin/superadmin)
export async function update(req, res) {
  if (!isAdmin(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: 'Param id tidak valid' });

  const payload = {};
  if (req.body?.nama_klaster !== undefined) {
    const nama = String(req.body.nama_klaster).trim();
    if (!nama) return res.status(400).json({ message: 'nama_klaster tidak boleh kosong' });
    payload.nama_klaster = nama;
  }
  if (!Object.keys(payload).length) {
    return res.status(400).json({ message: 'Tidak ada field yang diupdate' });
  }

  const { data, error } = await updateCluster(id, payload);
  if (error) return res.status(500).json({ message: 'Gagal update klaster', detail: error.message });

  return res.json({ message: 'Klaster diupdate', data });
}

// DELETE /api/klaster/:id (admin/superadmin)
// Catatan: karena 1 user hanya boleh 1 klaster, sebelum hapus, kosongkan klaster_id user yang terkait.
export async function remove(req, res) {
  if (!isAdmin(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: 'Param id tidak valid' });

  // kosongkan klaster user
  const reset = await setUserCluster(null, null) // dummy supaya TS senang; kita update via eq klaster_id
  // lakukan dengan query eksplisit:
  const resetAll = await supabase
    .from('User')
    .update({ klaster_id: null })
    .eq('klaster_id', id);
  if (resetAll.error) return res.status(500).json({ message: 'Gagal reset anggota klaster', detail: resetAll.error.message });

  const del = await deleteCluster(id);
  if (del.error) return res.status(500).json({ message: 'Gagal hapus klaster', detail: del.error.message });

  return res.json({ message: 'Klaster dihapus' });
}
