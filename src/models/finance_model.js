// src/models/finance.model.js
import supabase from '../config/supabase.js';

// --- KATEGORI & PRODUK ---

export async function getKategoriById(kategori_id) {
  return supabase
    .from('kategorial') // NOTE: nama tabel jadi lowercase di Postgres
    .select('kategori_id, nama, jenis')
    .eq('kategori_id', Number(kategori_id))
    .single();
}

export async function getProdukById(produk_id) {
  return supabase
    .from('produk')
    .select('produk_id, harga, nama, kategori_id')
    .eq('produk_id', Number(produk_id))
    .single();
}

// --- LAPORAN ---

export async function insertLaporan({
  id_laporan, id_user, jenis, kategori_id, deskripsi, debit, kredit,
}) {
  return supabase
    .from('lapkeuangan')
    .insert([{
      id_laporan,
      id_user,
      jenis, // 'pengeluaran' | 'pemasukan'
      kategori_id,
      deskripsi: deskripsi ?? null,
      debit: Number(debit || 0),
      kredit: Number(kredit || 0),
    }])
    .select('id_laporan, id_user, created_at, jenis, kategori_id, deskripsi, debit, kredit')
    .single();
}

export async function insertDetailBarang(laporan_id, items) {
  // items: [{ produk_id, jumlah, subtotal }]
  return supabase
    .from('detaillaporanbarang')
    .insert(items.map(it => ({
      laporan_id,
      produk_id: Number(it.produk_id),
      jumlah: Number(it.jumlah),
      subtotal: Number(it.subtotal),
    })));
}

export async function getLaporanHeader(id_laporan) {
  return supabase
    .from('lapkeuangan')
    .select('id_laporan, id_user, created_at, jenis, kategori_id, deskripsi, debit, kredit')
    .eq('id_laporan', id_laporan)
    .single();
}

export async function getLaporanDetails(id_laporan) {
  return supabase
    .from('detaillaporanbarang')
    .select('id_detail, produk_id, jumlah, subtotal, produk:produk_id(nama, harga)')
    .eq('laporan_id', id_laporan);
}

export async function listLaporan({
  id_user, start, end, jenis, kategori_id, page = 1, limit = 10,
}) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let q = supabase
    .from('lapkeuangan')
    .select('id_laporan, id_user, created_at, jenis, kategori_id, deskripsi, debit, kredit', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (id_user) q = q.eq('id_user', id_user);
  if (jenis) q = q.eq('jenis', jenis);
  if (kategori_id) q = q.eq('kategori_id', Number(kategori_id));
  if (start) q = q.gte('created_at', start);
  if (end) q = q.lt('created_at', end);

  return q.range(from, to);
}

export async function deleteLaporan(id_laporan) {
  // Hapus detail dulu (skema tidak pakai ON DELETE CASCADE)
  const delDetail = await supabase
    .from('detaillaporanbarang')
    .delete()
    .eq('laporan_id', id_laporan);
  if (delDetail.error) return delDetail;

  return supabase
    .from('lapkeuangan')
    .delete()
    .eq('id_laporan', id_laporan);
}

// Untuk perhitungan laba-rugi
export async function sumProfitLoss({ id_user, start, end }) {
  let q = supabase
    .from('lapkeuangan')
    .select('debit, kredit, jenis, kategori_id, created_at');

  if (id_user) q = q.eq('id_user', id_user);
  if (start) q = q.gte('created_at', start);
  if (end) q = q.lt('created_at', end);

  return q;
}
