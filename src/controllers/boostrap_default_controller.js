// src/controllers/bootstrap_defaults.controller.js
import supabase from '../config/supabase.js';
import { createBatchDefaultsForUser } from '../models/bootstrap_defaults_model.js';

// helper ambil klaster_id user (jaga2 kalau token belum bawa)
async function getUserKlasterId(user_id) {
  const { data, error } = await supabase
    .from('User')
    .select('klaster_id')
    .eq('user_id', user_id)
    .single();
  if (error) return null;
  return data?.klaster_id ?? null;
}

// POST /api/bootstrap/defaults
// User biasa: bootstrap miliknya sendiri.
export async function bootstrapDefaultsForMe(req, res) {
  try {
    const me = req.user; // pastikan auth middleware sudah mengisi req.user
    const shareToKlaster = Boolean(req.body?.share_to_klaster); // default false
    const owner_user_id = me.user_id;

    const owner_klaster_id = shareToKlaster ? await getUserKlasterId(owner_user_id) : null;

    const out = await createBatchDefaultsForUser({
      owner_user_id,
      owner_klaster_id,
      shareToKlaster,
    });

    if (!out?.ok) {
      return res.status(500).json({ message: 'Gagal bootstrap defaults', detail: out?.error?.message || out?.error });
    }

    return res.status(201).json({
      message: 'Bootstrap defaults berhasil',
      scope: shareToKlaster ? 'klaster' : 'pribadi',
    });
  } catch (e) {
    return res.status(500).json({ message: 'Gagal bootstrap defaults', detail: e?.message || e });
  }
}

// POST /api/admin/bootstrap/defaults/:user_id
// Admin: boleh bootstrap untuk user lain
export async function adminBootstrapDefaultsForUser(req, res) {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    if (!['admin', 'superadmin'].includes(role)) {
      return res.status(403).json({ message: 'Forbidden: admin only' });
    }

    const owner_user_id = req.params.user_id;
    if (!owner_user_id) return res.status(400).json({ message: 'user_id wajib di path' });

    const shareToKlaster = Boolean(req.body?.share_to_klaster);
    const owner_klaster_id = shareToKlaster ? await getUserKlasterId(owner_user_id) : null;

    const out = await createBatchDefaultsForUser({
      owner_user_id,
      owner_klaster_id,
      shareToKlaster,
    });

    if (!out?.ok) {
      return res.status(500).json({ message: 'Gagal bootstrap defaults', detail: out?.error?.message || out?.error });
    }

    return res.status(201).json({
      message: 'Bootstrap defaults (admin) berhasil',
      target_user_id: owner_user_id,
      scope: shareToKlaster ? 'klaster' : 'pribadi',
    });
  } catch (e) {
    return res.status(500).json({ message: 'Gagal bootstrap defaults (admin)', detail: e?.message || e });
  }
}
