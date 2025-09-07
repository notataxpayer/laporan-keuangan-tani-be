// src/models/product_model.js
import supabase from '../config/supabase.js';

const TABLE = 'produk';

export async function createProduct({ nama, kategori_id, created_by }) {
  return supabase
    .from(TABLE)
    .insert([{ nama, kategori_id, created_by }])
    .select('produk_id, nama, kategori_id, created_by')
    .single();
}

export async function listProducts({ page = 1, limit = 10, search = '' }) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let q = supabase
    .from(TABLE)
    .select('produk_id, nama, kategori_id, created_by', { count: 'exact' })
    .order('produk_id', { ascending: true });

  if (search) q = q.ilike('nama', `%${search}%`);

  return q.range(from, to);
}

export async function getProductById(id) {
  return supabase
    .from(TABLE)
    .select('produk_id, nama, kategori_id, created_by')
    .eq('produk_id', id)
    .single();
}

export async function updateProductById(id, payload) {
  return supabase
    .from(TABLE)
    .update(payload)
    .eq('produk_id', id)
    .select('produk_id, nama, kategori_id, created_by')
    .single();
}

export async function deleteProductById(id) {
  return supabase.from(TABLE).delete().eq('produk_id', id);
}
