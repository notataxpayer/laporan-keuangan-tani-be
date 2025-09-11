// src/controllers/invite.controller.js
import crypto from 'crypto';
import {
  createInvite,
  getInviteById,
  getInviteByToken,
  listInvitesForUser,
  listInvitesForCluster,
  linkInviteTargetUser,
  markInviteAccepted,
  markInviteRejected,
  markInviteRevoked,
  incrementInviteUsed,
} from '../models/invite_model.js';

import {
  findUserByEmailOrPhone,
  getUserById,
  getClusterById,
  isAdminOfCluster,
  userHasCluster,
  setUserCluster,
} from '../models/cluster_model.js';


function isOwnerOrAdmin(role) {
  return role === 'owner' || role === 'admin';
}

async function getMyEmailPhone(user_id) {
  const { data, error } = await getUserById(user_id);
  if (error || !data) return { email: null, phone: null };
  return { email: data.email ?? null, phone: data.nomor_telepon ?? null };
}

// ====== Admin/Owner: buat undangan ======
export async function createClusterInvite(req, res) {
  try {
    const klaster_id = Number(req.params.klasterId);
    if (Number.isNaN(klaster_id)) return res.status(400).json({ message: 'klasterId tidak valid' });

    const { email = null, phone = null, role = 'member', expires_at = null } = req.body || {};
    if (!email && !phone) return res.status(400).json({ message: 'Wajib isi email atau phone' });

    // cek hak admin berdasarkan User.role + User.klaster_id
    const { data: me, error: meErr } = await getUserById(req.user.user_id);
    if (meErr || !me) return res.status(401).json({ message: 'Unauthorized' });
    if (!isAdminOfCluster({ userRole: me.role, userClusterId: me.klaster_id, targetClusterId: klaster_id })) {
      return res.status(403).json({ message: 'Forbidden: bukan admin/superadmin klaster ini' });
    }
    // const { email = null, phone = null, role = 'member', expires_at } = req.body || {};

    const expiresAtFinal = expires_at ?? new Date(Date.now() + 7*24*60*60*1000).toISOString();

    // target user (jika sudah terdaftar)
    const { data: targetUser } = await findUserByEmailOrPhone({ email, phone });
    const target_user_id = targetUser?.user_id ?? null;

    const token = crypto.randomBytes(24).toString('base64url');
    const { data, error } = await createInvite({
      klaster_id,
      target_email: email,
      target_phone: phone,
      target_user_id,
      role,               // HANYA label; tidak mengubah User.role global
      token,
      expires_at: expiresAtFinal,
      created_by: req.user.user_id,
    });
    if (error) return res.status(500).json({ message: 'Gagal membuat undangan', detail: error.message });

    return res.status(201).json({ message: 'Undangan dibuat', invite: data });
  } catch (e) {
    return res.status(500).json({ message: 'Internal error', detail: e.message });
  }
}

// ====== Admin/Owner: list undangan klaster ======
export async function listClusterInvites(req, res) {
  const klaster_id = Number(req.params.klasterId);
  if (Number.isNaN(klaster_id)) return res.status(400).json({ message: 'klasterId tidak valid' });

  const { data: me } = await getUserById(req.user.user_id);
  if (!isAdminOfCluster({ userRole: me.role, userClusterId: me.klaster_id, targetClusterId: klaster_id })) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { data, error } = await listInvitesForCluster(klaster_id);
  if (error) return res.status(500).json({ message: 'Gagal ambil undangan', detail: error.message });
  return res.json({ data });
}

// ====== User: daftar undangan untuk saya ======
export async function listMyInvites(req, res) {
  const { email, phone } = await getMyEmailPhone(req.user.user_id);
  const { data, error } = await listInvitesForUser({
    user_id: req.user.user_id,
    email,
    phone,
    include_non_pending: true,
  });
  if (error) return res.status(500).json({ message: 'Gagal ambil undangan', detail: error.message });
  return res.json({ data });
}

// ====== Public/Logged: preview via token ======
export async function previewInvite(req, res) {
  const token = String(req.query.token || '');
  if (!token) return res.status(400).json({ message: 'token wajib' });

  const { data, error } = await getInviteByToken(token);
  if (error || !data) return res.status(404).json({ message: 'Undangan tidak ditemukan' });

  const expired = data.expires_at && new Date(data.expires_at) < new Date();

  return res.json({
    invite: {
      invite_id: data.invite_id,
      klaster: data.klaster,
      role: data.role,
      status: expired ? 'expired' : data.status,
      expires_at: data.expires_at,
    },
  });
}

// ====== User: accept/reject undangan ======
async function resolveInviteByAny({ invite_id, token }) {
  if (invite_id) return getInviteById(invite_id);
  if (token)     return getInviteByToken(token);
  return { data: null, error: { message: 'Wajib invite_id atau token' } };
}

export async function acceptInvite(req, res) {
  const invite_id = req.body?.invite_id || null;
  const token = req.body?.token || null;

  const { data: inv, error } = await resolveInviteByAny({ invite_id, token });
  if (error || !inv) return res.status(404).json({ message: 'Undangan tidak ditemukan' });
  if (inv.status !== 'pending') return res.status(409).json({ message: `Undangan sudah ${inv.status}` });
  if (inv.expires_at && new Date(inv.expires_at) < new Date()) return res.status(410).json({ message: 'Undangan kedaluwarsa' });

  // verifikasi identitas penerima (user_id / email / phone)
  const { data: me } = await getUserById(req.user.user_id);
  const matchUserId = inv.target_user_id && inv.target_user_id === me.user_id;
  const matchEmail  = inv.target_email && me.email && inv.target_email === me.email;
  const matchPhone  = inv.target_phone && me.nomor_telepon && inv.target_phone === me.nomor_telepon;
  if (!(matchUserId || matchEmail || matchPhone)) {
    return res.status(403).json({ message: 'Undangan tidak cocok dengan akun ini' });
  }

  // Satu user ↔ satu klaster: cek dulu
  if (me.klaster_id && Number(me.klaster_id) !== Number(inv.klaster_id)) {
    return res.status(409).json({ message: 'User sudah tergabung di klaster lain' });
  }

  // link target user_id jika belum
  if (!inv.target_user_id) {
    const link = await linkInviteTargetUser(inv.invite_id, me.user_id);
    if (link.error) return res.status(500).json({ message: 'Gagal link undangan ke akun', detail: link.error.message });
  }

  // set User.klaster_id (jika belum sama)
  if (!me.klaster_id) {
    const setRes = await setUserCluster(me.user_id, inv.klaster_id);
    if (setRes.error) return res.status(500).json({ message: 'Gagal menetapkan klaster ke user', detail: setRes.error.message });
  }

  // mark accepted (+ used_count)
  const mark = await markInviteAccepted(inv.invite_id);
  if (mark.error) return res.status(500).json({ message: 'Gagal set status undangan', detail: mark.error.message });
  await incrementInviteUsed(inv.invite_id);

  return res.json({ message: 'Bergabung ke klaster berhasil', klaster_id: inv.klaster_id });
}

export async function rejectInvite(req, res) {
  const invite_id = req.body?.invite_id || null;
  const token = req.body?.token || null;

  const { data: inv, error } = await resolveInviteByAny({ invite_id, token });
  if (error || !inv) return res.status(404).json({ message: 'Undangan tidak ditemukan' });
  if (inv.status !== 'pending') return res.status(409).json({ message: `Undangan sudah ${inv.status}` });

  const mark = await markInviteRejected(inv.invite_id);
  if (mark.error) return res.status(500).json({ message: 'Gagal set status undangan', detail: mark.error.message });

  return res.json({ message: 'Undangan ditolak' });
}

// ====== Admin/Owner: revoke undangan ======
export async function revokeInvite(req, res) {
  const klaster_id = Number(req.params.klasterId);
  const invite_id = String(req.params.inviteId || '');

  if (Number.isNaN(klaster_id)) return res.status(400).json({ message: 'klasterId tidak valid' });
  if (!invite_id) return res.status(400).json({ message: 'inviteId wajib' });

  const { data: membership } = await getMembership(req.user.user_id, klaster_id);
  if (!membership || !isOwnerOrAdmin(membership.role)) {
    return res.status(403).json({ message: 'Forbidden: bukan owner/admin klaster' });
  }

  const { data: inv, error } = await getInviteById(invite_id);
  if (error || !inv || inv.klaster_id !== klaster_id) {
    return res.status(404).json({ message: 'Undangan tidak ditemukan di klaster ini' });
  }
  if (inv.status !== 'pending') return res.status(409).json({ message: `Tidak bisa revoke; status=${inv.status}` });

  const mark = await markInviteRevoked(invite_id);
  if (mark.error) return res.status(500).json({ message: 'Gagal revoke undangan', detail: mark.error.message });

  return res.json({ message: 'Undangan dibatalkan' });
}
