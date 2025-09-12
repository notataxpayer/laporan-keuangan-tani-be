// src/controllers/product.controller.js
import {
  createProduct,
  listProducts,
  listProductsByUser,
  listProductsByCluster,
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
  if (body?.kategori_nama !== undefined && String(body.kategori_nama).trim() === '') {
    errors.push('kategori_nama tidak boleh string kosong');
  }
  return errors;
}

/** POST /api/produk */
export async function create(req, res) {
  const errors = validatePayload(req.body);
  if (errors.length) return res.status(400).json({ message: 'Validasi gagal', errors });

  const created_by = req.user.user_id;
  const owner_user_id = req.user.user_id;
  const owner_klaster_id = req.user.klaster_id ?? null;

  const nama = String(req.body.nama);
  let kategori_id = req.body.kategori_id != null ? Number(req.body.kategori_id) : null;
  const kategori_nama_input = req.body.kategori_nama ? String(req.body.kategori_nama).trim() : null;

  // Tentukan klaster untuk produk (opsional)
  const isAdmin = ['admin', 'superadmin'].includes(String(req.user?.role || '').toLowerCase());
  let klaster_id_to_set = null;

  if (Object.prototype.hasOwnProperty.call(req.body, 'share_to_klaster')) {
    if (req.body.share_to_klaster) {
      if (!owner_klaster_id) return res.status(400).json({ message: 'User tidak memiliki klaster' });
      klaster_id_to_set = owner_klaster_id;
    } else {
      klaster_id_to_set = null;
    }
  } else if (Object.prototype.hasOwnProperty.call(req.body, 'klaster_id')) {
    const cand = req.body.klaster_id === null ? null : String(req.body.klaster_id);
    if (!isAdmin) {
      if (!owner_klaster_id || (cand !== null && cand !== String(owner_klaster_id))) {
        return res.status(403).json({ message: 'Forbidden: klaster_id bukan milik klastermu' });
      }
    }
    klaster_id_to_set = cand;
  }

  try {
    // Jika kategori_id tidak diberikan → cari/buat otomatis (scoped ke owner/klaster)
    if (!kategori_id) {
      const lookupName = kategori_nama_input || nama;

      const { data: existingKat, error: findErr } = await findKategoriByNameScoped({
        nama: lookupName,
        owner_user_id,
        owner_klaster_id,
      });
      if (findErr) return res.status(500).json({ message: 'Gagal mencari kategori', detail: findErr.message });

      if (existingKat) {
        kategori_id = existingKat.kategori_id;
      } else {
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

    const { data, error } = await createProduct({
      nama,
      kategori_id,
      created_by,
      klaster_id: klaster_id_to_set,
    });
    if (error) return res.status(500).json({ message: 'Gagal membuat produk', detail: error.message });

    return res.status(201).json({ message: 'Produk dibuat', data });
  } catch (e) {
    return res.status(500).json({ message: 'Terjadi kesalahan', detail: e.message });
  }
}

/**
 * GET /api/produk
 * Query:
 *   - scope=mine|cluster|mine_or_cluster (default: mine untuk non-admin, all untuk admin)
 *   - search, page, limit
 *   - (admin optional) user_id, klaster_id
 */
export async function list(req, res) {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 10)));
  const search = String(req.query.search ?? '').trim();

  const role = String(req.user?.role || '').toLowerCase();
  const isAdmin = ['admin', 'superadmin'].includes(role);
  const scope = String(req.query.scope ?? (isAdmin ? 'all' : 'mine')).toLowerCase();

  try {
    if (isAdmin) {
      // Admin boleh filter manual:
      const user_id = req.query.user_id || undefined;
      const klaster_id = req.query.klaster_id || undefined;

      if (scope === 'mine_or_cluster' && (req.query.user_id || req.query.klaster_id)) {
        const { data, error, count } = await listProducts({
          page, limit, search,
          mine_or_cluster: { user_id, klaster_id },
        });
        if (error) return res.status(500).json({ message: 'Gagal mengambil produk', detail: error.message });
        return res.json({ page, limit, total: count ?? data?.length ?? 0, data });
      }

      const { data, error, count } = await listProducts({
        page, limit, search,
        created_by: scope === 'mine' ? req.user.user_id : user_id,
        klaster_id: scope === 'cluster' ? (klaster_id ?? req.user.klaster_id ?? undefined) : klaster_id,
      });
      if (error) return res.status(500).json({ message: 'Gagal mengambil produk', detail: error.message });
      return res.json({ page, limit, total: count ?? data?.length ?? 0, data });
    }

    // Non-admin
    if (scope === 'cluster') {
      const myCluster = req.user?.klaster_id ?? null;
      if (!myCluster) return res.status(400).json({ message: 'Kamu tidak memiliki klaster' });
      const { data, error, count } = await listProductsByCluster({ klaster_id: myCluster, page, limit, search });
      if (error) return res.status(500).json({ message: 'Gagal mengambil produk', detail: error.message });
      return res.json({ page, limit, total: count ?? data?.length ?? 0, data });
    }

    if (scope === 'mine_or_cluster') {
      const myCluster = req.user?.klaster_id ?? null;
      const { data, error, count } = await listProducts({
        page, limit, search,
        mine_or_cluster: { user_id: req.user.user_id, klaster_id: myCluster || undefined },
      });
      if (error) return res.status(500).json({ message: 'Gagal mengambil produk', detail: error.message });
      return res.json({ page, limit, total: count ?? data?.length ?? 0, data });
    }

    // default: mine
    const { data, error, count } = await listProductsByUser({
      user_id: req.user.user_id,
      page,
      limit,
      search,
    });
    if (error) return res.status(500).json({ message: 'Gagal mengambil produk', detail: error.message });
    return res.json({ page, limit, total: count ?? data?.length ?? 0, data });
  } catch (e) {
    return res.status(500).json({ message: 'Terjadi kesalahan', detail: e.message });
  }
}

/** GET /api/produk/saya → tetap: produk milik user yang login */
export async function listMyProducts(req, res) {
  const userId = req.user?.user_id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 10)));
  const search = String(req.query.search ?? '').trim();

  const { data, error, count } = await listProductsByUser({ user_id: userId, page, limit, search });
  if (error) return res.status(500).json({ message: 'Gagal mengambil produk', detail: error.message });

  return res.json({ page, limit, total: count ?? data?.length ?? 0, data });
}

/** GET /api/users/:userId/produk → tetap */
export async function listByUser(req, res) {
  const userId = String(req.params.userId || '').trim();
  if (!userId) return res.status(400).json({ message: 'Param userId wajib diisi' });

  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 10)));
  const search = String(req.query.search ?? '').trim();

  const { data, error, count } = await listProductsByUser({ user_id: userId, page, limit, search });
  if (error) return res.status(500).json({ message: 'Gagal mengambil produk', detail: error.message });

  return res.json({ page, limit, total: count ?? data?.length ?? 0, data });
}

/** GET /api/produk/:id */
export async function detail(req, res) {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: 'Param id tidak valid' });

  const { data, error } = await getProductById(id);
  if (error || !data) return res.status(404).json({ message: 'Produk tidak ditemukan' });

  const role = String(req.user?.role || '').toLowerCase();
  const isAdmin = ['admin', 'superadmin'].includes(role);

  if (!isAdmin) {
    const sameOwner = data.created_by === req.user.user_id;
    const sameCluster = data.klaster_id && req.user.klaster_id && String(data.klaster_id) === String(req.user.klaster_id);
    if (!sameOwner && !sameCluster) {
      return res.status(403).json({ message: 'Akses ditolak' });
    }
  }

  return res.json({ data });
}

/** PATCH /api/produk/:id */
export async function update(req, res) {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: 'Param id tidak valid' });

  const errors = validatePayload(req.body, { partial: true });
  if (errors.length) return res.status(400).json({ message: 'Validasi gagal', errors });

  const owner_user_id = req.user.user_id;
  const owner_klaster_id = req.user.klaster_id ?? null;

  const { data: existing, error: selErr } = await getProductById(id);
  if (selErr || !existing) return res.status(404).json({ message: 'Produk tidak ditemukan' });

  const role = String(req.user?.role || '').toLowerCase();
  const isAdmin = ['admin', 'superadmin'].includes(role);

  // Non-admin: hanya owner yang boleh update
  if (!isAdmin && existing.created_by !== req.user.user_id) {
    return res.status(403).json({ message: 'Akses ditolak' });
  }

  const payload = {};
  if (req.body.nama !== undefined) payload.nama = String(req.body.nama);

  // Update kategori_id langsung atau via kategori_nama
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
        const produkNamaForInference = payload.nama || existing?.nama || lookupName;
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
      payload.kategori_id = null;
    }
  }

  // Share/unshare ke klaster
  if (Object.prototype.hasOwnProperty.call(req.body, 'share_to_klaster')) {
    if (req.body.share_to_klaster) {
      if (!owner_klaster_id) return res.status(400).json({ message: 'User tidak memiliki klaster' });
      payload.klaster_id = owner_klaster_id;
    } else {
      payload.klaster_id = null;
    }
  } else if (Object.prototype.hasOwnProperty.call(req.body, 'klaster_id')) {
    const cand = req.body.klaster_id === null ? null : String(req.body.klaster_id);
    if (!isAdmin) {
      if (!owner_klaster_id || (cand !== null && cand !== String(owner_klaster_id))) {
        return res.status(403).json({ message: 'Forbidden: klaster_id bukan milik klastermu' });
      }
    }
    payload.klaster_id = cand;
  }

  if (Object.keys(payload).length === 0) {
    return res.status(400).json({ message: 'Tidak ada field yang diupdate' });
  }

  const { data, error } = await updateProductById(id, payload);
  if (error) return res.status(500).json({ message: 'Gagal update produk', detail: error.message });

  return res.json({ message: 'Produk diupdate', data });
}

/** DELETE /api/produk/:id */
export async function remove(req, res) {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: 'Param id tidak valid' });

  const { data: exists, error: selErr } = await getProductById(id);
  if (selErr || !exists) return res.status(404).json({ message: 'Produk tidak ditemukan' });

  const role = String(req.user?.role || '').toLowerCase();
  const isAdmin = ['admin', 'superadmin'].includes(role);

  // Non-admin: hanya owner yang boleh hapus (meski dishare ke klaster)
  if (!isAdmin && exists.created_by !== req.user.user_id) {
    return res.status(403).json({ message: 'Akses ditolak' });
  }

  const { error } = await deleteProductById(id);
  if (error) return res.status(500).json({ message: 'Gagal hapus produk', detail: error.message });

  return res.json({ message: 'Produk dihapus' });
}

export default {
  create,
  list,
  listMyProducts,
  listByUser,
  detail,
  update,
  remove,
};
