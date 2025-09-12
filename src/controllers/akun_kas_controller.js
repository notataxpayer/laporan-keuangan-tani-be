import supabase from '../config/supabase.js';
import {
  createAkunKas,
  listAkunKasVisible,
  getAkunKasById,
  deleteAkunKasById,
  updateAkunKasById
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

  const { nama, deskripsi, saldo_awal = 0, saldo_akhir, share_to_klaster } = req.body;

  const owner_user_id = req.user.user_id;
  const myCluster = await getUserKlasterId(owner_user_id);

  const owner_klaster_id = share_to_klaster ? (myCluster ?? null) : null; // ⬅️ bedanya di sini

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

// Update

export async function update(req, res) {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: 'Param id tidak valid' });

  // Ambil akun yang mau diupdate
  const { data: exist, error: selErr } = await getAkunKasById(id);
  if (selErr || !exist) return res.status(404).json({ message: 'Akun kas tidak ditemukan' });

  // Otorisasi: admin / pemilik / satu klaster
  const viewer_user_id = req.user.user_id;
  const viewer_klaster_id = await getUserKlasterId(viewer_user_id);
  const allowed =
    isAdmin(req.user.role) ||
    (exist.user_id && exist.user_id === viewer_user_id) ||
    (exist.klaster_id && viewer_klaster_id && exist.klaster_id === viewer_klaster_id);

  if (!allowed) {
    return res.status(403).json({ message: 'Forbidden: bukan pemilik akun ini' });
  }

  // Validasi & susun payload
  const b = req.body || {};
  const payload = {};

  if (Object.prototype.hasOwnProperty.call(b, 'nama')) {
    if (!b.nama || String(b.nama).trim() === '') {
      return res.status(400).json({ message: 'nama wajib diisi' });
    }
    payload.nama = String(b.nama);
  }

  if (Object.prototype.hasOwnProperty.call(b, 'deskripsi')) {
    payload.deskripsi = b.deskripsi == null ? null : String(b.deskripsi);
  }

  if (Object.prototype.hasOwnProperty.call(b, 'saldo_awal')) {
    if (Number.isNaN(Number(b.saldo_awal))) {
      return res.status(400).json({ message: 'saldo_awal harus berupa angka' });
    }
    payload.saldo_awal = Number(b.saldo_awal);
  }

  if (Object.prototype.hasOwnProperty.call(b, 'saldo_akhir')) {
    if (Number.isNaN(Number(b.saldo_akhir))) {
      return res.status(400).json({ message: 'saldo_akhir harus berupa angka' });
    }
    payload.saldo_akhir = Number(b.saldo_akhir);
  }

  // Share/unshare ke klaster (opsional)
  // Prioritas: share_to_klaster > klaster_id (kalau dua-duanya dikirim, share_to_klaster yang dipakai)
  if (Object.prototype.hasOwnProperty.call(b, 'share_to_klaster')) {
    if (b.share_to_klaster) {
      const myCluster = await getUserKlasterId(viewer_user_id);
      if (!myCluster) return res.status(400).json({ message: 'User tidak memiliki klaster' });
      payload.klaster_id = myCluster;
    } else {
      payload.klaster_id = null;
    }
  } else if (Object.prototype.hasOwnProperty.call(b, 'klaster_id')) {
    const cand = b.klaster_id === null ? null : String(b.klaster_id);
    if (!isAdmin(req.user.role)) {
      const myCluster = viewer_klaster_id;
      // Non-admin hanya boleh set ke klaster miliknya atau null
      if (cand !== null && (!myCluster || cand !== String(myCluster))) {
        return res.status(403).json({ message: 'Forbidden: klaster_id bukan milik klastermu' });
      }
    }
    payload.klaster_id = cand;
  }

  if (Object.keys(payload).length === 0) {
    return res.status(400).json({ message: 'Tidak ada field yang diupdate' });
  }

  // Eksekusi update
  const { data, error } = await updateAkunKasById(id, payload);
  if (error) return res.status(500).json({ message: 'Gagal update akun kas', detail: error.message });

  return res.json({ message: 'Akun kas diupdate', data });
}