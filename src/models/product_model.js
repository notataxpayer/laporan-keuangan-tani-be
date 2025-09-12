// src/models/product_model.js
import supabase from '../config/supabase.js';

const TABLE = 'produk';

export async function createProduct({ nama, kategori_id, created_by, klaster_id = null }) {
  return supabase
    .from('produk')
    .insert([{ nama, kategori_id, created_by, klaster_id }])
    .select(`
      produk_id, nama, kategori_id, created_by, klaster_id,
      kategori:kategori_id ( kategori_id, nama, jenis, sub_kelompok, neraca_identifier )
    `)
    .single();
}
/**
 * List umum (admin bisa pakai ini tanpa filter).
 * Bisa juga dipakai dengan filter fleksibel: created_by, klaster_id, mine_or_cluster.
 */
export async function listProducts({ page = 1, limit = 10, search = '', created_by, klaster_id, mine_or_cluster }) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let q = supabase
    .from('produk')
    .select(`
      produk_id, nama, kategori_id, created_by, klaster_id,
      kategori:kategori_id ( kategori_id, nama, jenis, sub_kelompok, neraca_identifier )
    `, { count: 'exact' })
    .order('produk_id', { ascending: true });

  if (search) q = q.ilike('nama', `%${search}%`);
  if (created_by) q = q.eq('created_by', created_by);
  if (klaster_id) q = q.eq('klaster_id', klaster_id);

  if (mine_or_cluster?.user_id || mine_or_cluster?.klaster_id) {
    const orParts = [];
    if (mine_or_cluster.user_id)  orParts.push(`created_by.eq.${mine_or_cluster.user_id}`);
    if (mine_or_cluster.klaster_id) orParts.push(`klaster_id.eq.${mine_or_cluster.klaster_id}`);
    if (orParts.length) q = q.or(orParts.join(','));
  }

  return q.range(from, to);
}

// LIST by user
export async function listProductsByUser({ user_id, page = 1, limit = 10, search = '' }) {
  if (!user_id) return { data: null, error: new Error('user_id wajib diisi'), count: 0 };

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let q = supabase
    .from('produk')
    .select(`
      produk_id, nama, kategori_id, created_by, klaster_id,
      kategori:kategori_id ( kategori_id, nama, jenis, sub_kelompok, neraca_identifier )
    `, { count: 'exact' })
    .eq('created_by', user_id)
    .order('produk_id', { ascending: true });

  if (search) q = q.ilike('nama', `%${search}%`);
  return q.range(from, to);
}


/** Baru: list by klaster */
export async function listProductsByCluster({ klaster_id, page = 1, limit = 10, search = '' }) {
  if (!klaster_id) return { data: null, error: new Error('klaster_id wajib diisi'), count: 0 };

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let q = supabase
    .from('produk')
    .select(`
      produk_id, nama, kategori_id, created_by, klaster_id,
      kategori:kategori_id ( kategori_id, nama, jenis, sub_kelompok, neraca_identifier )
    `, { count: 'exact' })
    .eq('klaster_id', klaster_id)
    .order('produk_id', { ascending: true });

  if (search) q = q.ilike('nama', `%${search}%`);
  return q.range(from, to);
}
export async function getProductById(id) {
  return supabase
    .from('produk')
    .select(`
      produk_id, nama, kategori_id, created_by, klaster_id,
      kategori:kategori_id ( kategori_id, nama, jenis, sub_kelompok, neraca_identifier )
    `)
    .eq('produk_id', id)
    .single();
}


export async function updateProductById(id, payload) {
  return supabase
    .from('produk')
    .update(payload)
    .eq('produk_id', id)
    .select(`
      produk_id, nama, kategori_id, created_by, klaster_id,
      kategori:kategori_id ( kategori_id, nama, jenis, sub_kelompok, neraca_identifier )
    `)
    .single();
}

export async function deleteProductById(id) {
  return supabase.from(TABLE).delete().eq('produk_id', id);
}
