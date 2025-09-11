// src/models/cluster_model.js
import supabase from '../config/supabase.js';

export async function findUserByEmailOrPhone({ email = null, phone = null }) {
  let q = supabase.from('User').select('user_id, email, nomor_telepon, role, klaster_id').limit(1);
  if (email && phone) {
    q = q.or(`email.eq.${email},nomor_telepon.eq.${phone}`);
  } else if (email) {
    q = q.eq('email', email);
  } else if (phone) {
    q = q.eq('nomor_telepon', phone);
  } else {
    return { data: null, error: null };
  }
  const { data, error } = await q.maybeSingle();
  if (error) return { data: null, error };
  return { data, error: null };
}

export async function getUserById(user_id) {
  return supabase
    .from('User')
    .select('user_id, email, nomor_telepon, role, klaster_id')
    .eq('user_id', user_id)
    .single();
}

export async function getClusterById(klaster_id) {
  return supabase
    .from('klaster')
    .select('klaster_id, nama_klaster')
    .eq('klaster_id', klaster_id)
    .single();
}

// === util sesuai skema 1-user-1-klaster ===
export function isGlobalAdmin(role) {
  return role === 'admin' || role === 'superadmin';
}

export function isAdminOfCluster({ userRole, userClusterId, targetClusterId }) {
  if (userRole === 'superadmin') return true;
  return userRole === 'admin' && userClusterId && Number(userClusterId) === Number(targetClusterId);
}

export async function userHasCluster(user_id) {
  const { data, error } = await getUserById(user_id);
  if (error) return { ok: false, error };
  return { ok: true, has: !!data?.klaster_id, klaster_id: data?.klaster_id ?? null, role: data?.role ?? 'user' };
}

export async function setUserCluster(user_id, klaster_id) {
  return supabase
    .from('User')
    .update({ klaster_id: Number(klaster_id) })
    .eq('user_id', user_id)
    .select('user_id, klaster_id')
    .single();
}
