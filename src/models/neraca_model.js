// src/models/neraca_model.js
import supabase from '../config/supabase.js';

export async function fetchNeracaExpanded({ id_user, klaster_id, start, end }) {
  // --- Tentukan set user yang jadi target ---
  let userIds = [];

  if (klaster_id) {
    // Ambil semua user di klaster
    const ur = await supabase
      .from('User')
      .select('user_id')
      .eq('klaster_id', klaster_id);
    if (ur.error) return ur;
    userIds = (ur.data ?? []).map(u => u.user_id);
    if (!userIds.length) return { data: [], error: null };
  } else if (id_user) {
    userIds = [id_user];
  } else {
    // Fallback aman: tidak ada target → kosong
    return { data: [], error: null };
  }

  // 0) Ambil header laporan milik user-user target + periode
  let hq = supabase
    .from('lapkeuangan')
    .select('id_laporan, id_user, jenis, created_at')
    .in('id_user', userIds);

  if (start) hq = hq.gte('created_at', start);
  if (end)   hq = hq.lt('created_at', end);

  const hdr = await hq;
  if (hdr.error) return hdr;

  const headers = hdr.data ?? [];
  if (!headers.length) return { data: [], error: null };

  const headerMap = new Map(headers.map(h => [h.id_laporan, { jenis: h.jenis, created_at: h.created_at }]));
  const laporanIds = headers.map(h => h.id_laporan);

  // 1) detail untuk id laporan itu saja
  const d1 = await supabase
    .from('detaillaporanbarang')
    .select('laporan_id, subtotal, produk_id')
    .in('laporan_id', laporanIds);
  if (d1.error) return d1;

  const rows = d1.data ?? [];
  if (!rows.length) return { data: [], error: null };

  // 2) map produk
  const produkIds = [...new Set(rows.map(r => r.produk_id).filter(Boolean))];
  const pr = await supabase
    .from('produk')
    .select('produk_id, nama, kategori_id')
    .in('produk_id', produkIds);
  if (pr.error) return pr;

  const pmap = {};
  for (const p of pr.data ?? []) pmap[p.produk_id] = { nama: p.nama, kategori_id: p.kategori_id };

  // 3) map kategori
  const kategoriIds = [...new Set(Object.values(pmap).map(v => v?.kategori_id).filter(v => v != null))];
  let kmap = {};
  if (kategoriIds.length) {
    const kr = await supabase
      .from('kategorial')
      .select('kategori_id, nama, sub_kelompok, neraca_identifier')
      .in('kategori_id', kategoriIds);
    if (kr.error) return kr;
    for (const k of kr.data ?? []) {
      kmap[k.kategori_id] = {
        nama: k.nama,
        sub_kelompok: k.sub_kelompok,
        neraca_identifier: k.neraca_identifier,
      };
    }
  }

  // 4) flatten final
  const expanded = rows.map(r => {
    const hdrInfo = headerMap.get(r.laporan_id) || {};
    const pinfo = pmap[r.produk_id] ?? { nama: null, kategori_id: null };
    const kinfo = pinfo.kategori_id != null ? (kmap[pinfo.kategori_id] ?? {}) : {};
    return {
      jenis: hdrInfo.jenis ?? null,
      subtotal: Number(r.subtotal || 0),
      produk_id: r.produk_id ?? null,
      produk_nama: pinfo.nama ?? null,
      kategori_id: pinfo.kategori_id ?? null,
      kategori_nama: kinfo.nama ?? null,
      sub_kelompok: kinfo.sub_kelompok ?? null,
      neraca_identifier: kinfo.neraca_identifier ?? null,
    };
  });

  return { data: expanded, error: null };
}

