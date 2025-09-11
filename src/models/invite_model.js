// src/models/invite_model.js
import supabase from '../config/supabase.js';

const TABLE = 'klaster_invite';

// ====== CREATE / READ ======

export async function createInvite({
  klaster_id,
  target_email = null,
  target_phone = null,
  target_user_id = null,
  role = 'member',
  token,
  max_uses = 1,
  expires_at = null,
  created_by,
}) {
  return supabase
    .from(TABLE)
    .insert([{
      klaster_id,
      target_email,
      target_phone,
      target_user_id,
      role,
      token,
      max_uses,
      expires_at,
      created_by,
    }])
    .select('invite_id, klaster_id, target_email, target_phone, target_user_id, role, status, token, max_uses, used_count, expires_at, created_by, created_at')
    .single();
}

export async function getInviteById(invite_id) {
  return supabase
    .from(TABLE)
    .select('*, klaster:klaster_id(klaster_id, nama_klaster)')
    .eq('invite_id', invite_id)
    .single();
}

export async function getInviteByToken(token) {
  return supabase
    .from(TABLE)
    .select('*, klaster:klaster_id(klaster_id, nama_klaster)')
    .eq('token', token)
    .single();
}

export async function listInvitesForUser({ user_id, email = null, phone = null, include_non_pending = true }) {
  // Ambil undangan untuk user_id langsung
  const res1 = await supabase
    .from(TABLE)
    .select('*, klaster:klaster_id(klaster_id, nama_klaster)')
    .eq('target_user_id', user_id);

  if (res1.error) return res1;

  // Ambil undangan yang ditujukan ke email/phone
  let conds = [];
  if (email) conds.push(`target_email.eq.${email}`);
  if (phone) conds.push(`target_phone.eq.${phone}`);
  let res2 = { data: [] };
  if (conds.length) {
    res2 = await supabase
      .from(TABLE)
      .select('*, klaster:klaster_id(klaster_id, nama_klaster)')
      .or(conds.join(','));
    if (res2.error) return res2;
  }

  // Merge unik by invite_id
  const map = new Map();
  for (const row of (res1.data ?? [])) map.set(row.invite_id, row);
  for (const row of (res2.data ?? [])) map.set(row.invite_id, row);

  let items = Array.from(map.values());
  if (!include_non_pending) items = items.filter(r => r.status === 'pending');

  return { data: items, error: null };
}

// ====== UPDATE STATUS / LINK TARGET ======

export async function linkInviteTargetUser(invite_id, user_id) {
  return supabase
    .from(TABLE)
    .update({ target_user_id: user_id })
    .eq('invite_id', invite_id)
    .select('invite_id, target_user_id')
    .single();
}

export async function markInviteAccepted(invite_id) {
  return supabase
    .from(TABLE)
    .update({ status: 'accepted', used_count: supabase.rpc ? undefined : undefined, responded_at: new Date().toISOString() })
    .eq('invite_id', invite_id)
    .select('invite_id, status, used_count, responded_at')
    .single();
}

export async function markInviteRejected(invite_id) {
  return supabase
    .from(TABLE)
    .update({ status: 'rejected', responded_at: new Date().toISOString() })
    .eq('invite_id', invite_id)
    .select('invite_id, status, responded_at')
    .single();
}

export async function markInviteRevoked(invite_id) {
  return supabase
    .from(TABLE)
    .update({ status: 'revoked', responded_at: new Date().toISOString() })
    .eq('invite_id', invite_id)
    .select('invite_id, status, responded_at')
    .single();
}

export async function incrementInviteUsed(invite_id) {
  // Supabase belum punya atomic inc di update biasa → pakai RPC atau ambil & update manual
  const cur = await supabase.from(TABLE).select('used_count').eq('invite_id', invite_id).single();
  if (cur.error) return cur;
  const next = Number(cur.data?.used_count || 0) + 1;
  return supabase
    .from(TABLE)
    .update({ used_count: next })
    .eq('invite_id', invite_id)
    .select('invite_id, used_count')
    .single();
}

// ====== UTIL LAIN ======

export async function listInvitesForCluster(klaster_id) {
  return supabase
    .from(TABLE)
    .select('invite_id, target_email, target_phone, target_user_id, role, status, max_uses, used_count, expires_at, created_by, created_at')
    .eq('klaster_id', klaster_id)
    .order('created_at', { ascending: false });
}
