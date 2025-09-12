// buat CRUD klaster (gada hubungannya sama cluster n invitation ya)

// src/models/klaster_model.js
import supabase from '../config/supabase.js';

const TABLE = 'klaster';

// ----- KLASTER -----
export async function createCluster({ nama_klaster }) {
  return supabase
    .from(TABLE)
    .insert([{ nama_klaster }])
    .select('klaster_id, nama_klaster')
    .single();
}

export async function getClusterById(klaster_id) {
  return supabase
    .from(TABLE)
    .select('klaster_id, nama_klaster')
    .eq('klaster_id', Number(klaster_id))
    .maybeSingle();
}

export async function listClusters({ search = '', page = 1, limit = 20 }) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let q = supabase
    .from(TABLE)
    .select('klaster_id, nama_klaster', { count: 'exact' })
    .order('klaster_id', { ascending: true });

  if (search) q = q.ilike('nama_klaster', `%${search}%`);

  return q.range(from, to);
}

export async function updateCluster(klaster_id, payload) {
  return supabase
    .from(TABLE)
    .update(payload)
    .eq('klaster_id', Number(klaster_id))
    .select('klaster_id, nama_klaster')
    .single();
}

export async function deleteCluster(klaster_id) {
  return supabase
    .from(TABLE)
    .delete()
    .eq('klaster_id', Number(klaster_id));
}

// ----- USER <-> KLASTER -----
export async function setUserCluster(user_id, klaster_id) {
  return supabase
    .from('User')
    .update({ klaster_id: klaster_id == null ? null : Number(klaster_id) })
    .eq('user_id', user_id);
}

export async function getUsersInCluster(klaster_id) {
  return supabase
    .from('User')
    .select('user_id, nama, email, nomor_telepon, role, klaster_id')
    .eq('klaster_id', Number(klaster_id))
    .order('created_at', { ascending: true });
}

export async function kickUserFromCluster({ klaster_id, user_id }) {
  return supabase
    .from('User')
    .update({ klaster_id: null })
    .eq('user_id', user_id)
    .eq('klaster_id', Number(klaster_id))
    .select('user_id')      // agar tahu apakah ada row yang berubah
    .single();              // akan error bila 0 row terubah (bukan anggota klaster tsb)
}