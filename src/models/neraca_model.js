// src/models/neraca_model.js
import supabase from '../config/supabase.js';

// Ambil baris detail+header+produk+kategori (2–3 langkah biar aman dari join quirks)
export async function fetchNeracaExpanded({ id_user, start, end }) {
  // 1) detail + header (jenis, created_at) + produk_id
  let q1 = supabase
    .from('detaillaporanbarang')
    .select('subtotal, laporan:laporan_id(id_user, created_at, jenis), produk_id');

  if (start) q1 = q1.gte('laporan.created_at', start);
  if (end)   q1 = q1.lt('laporan.created_at', end);

  const d1 = await q1;
  if (d1.error) return d1;

  const rows = (id_user ? (d1.data ?? []).filter(r => r.laporan?.id_user === id_user) : (d1.data ?? []));
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

  // 3) map kategori (ambil sub_kelompok + neraca_identifier sebagai fallback)
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
        sub_kelompok: k.sub_kelompok,             // 'aset_lancar' | 'aset_tetap' | 'kewajiban_lancar' | 'kewajiban_jangka_panjang'
        neraca_identifier: k.neraca_identifier,   // fallback
      };
    }
  }

  // 4) flatten final
  const expanded = rows.map(r => {
    const pinfo = pmap[r.produk_id] ?? { nama: null, kategori_id: null };
    const kinfo = pinfo.kategori_id != null ? (kmap[pinfo.kategori_id] ?? {}) : {};
    return {
      jenis: r.laporan?.jenis ?? null,            // 'pemasukan' | 'pengeluaran'
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
