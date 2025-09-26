// src/models/neraca_model.js
import supabase from '../config/supabase.js';

export async function fetchNeracaExpanded({ id_user, klaster_id, start, end }) {
  // 0) Bangun query header sesuai scope
  let hq = supabase
    .from('lapkeuangan')
    .select('id_laporan, id_user, jenis, created_at, tanggal, klaster_id');

  if (klaster_id != null) {
    // SCOPE: CLUSTER  → semua laporan dengan klaster_id = X
    hq = hq.eq('klaster_id', klaster_id);
  } else if (id_user) {
    // SCOPE: USER (milik pribadi) → user match & klaster_id IS NULL
    hq = hq.eq('id_user', id_user).is('klaster_id', null);
  } else {
    // Tanpa target jelas → kosong aman
    return { data: [], error: null };
  }

  if (start) hq = hq.gte('created_at', start);
  if (end)   hq = hq.lt('created_at', end);

  const hdr = await hq;
  if (hdr.error) return hdr;

  const headers = hdr.data ?? [];
  if (!headers.length) return { data: [], error: null };

  const headerMap = new Map(
    headers.map(h => [h.id_laporan, {
      jenis: h.jenis,
      created_at: h.created_at,
      tanggal: h.tanggal,
      id_user: h.id_user,
      klaster_id: h.klaster_id,
    }])
  );
  const laporanIds = headers.map(h => h.id_laporan);

  // 1) Ambil detail utk laporannya saja
  const d1 = await supabase
    .from('detaillaporanbarang')
    .select('laporan_id, subtotal, produk_id, jumlah')
    .in('laporan_id', laporanIds);
  if (d1.error) return d1;

  const rows = d1.data ?? [];
  if (!rows.length) return { data: [], error: null };

  // 2) Map produk
  const produkIds = [...new Set(rows.map(r => r.produk_id).filter(Boolean))];
  let pmap = {};
  if (produkIds.length) {
    const pr = await supabase
      .from('produk')
      .select('produk_id, nama, kategori_id')
      .in('produk_id', produkIds);
    if (pr.error) return pr;
    for (const p of pr.data ?? []) {
      pmap[p.produk_id] = { nama: p.nama, kategori_id: p.kategori_id };
    }
  }

  // 3) Map kategori
  const kategoriIds = [...new Set(Object.values(pmap).map(v => v?.kategori_id).filter(v => v != null))];
  let kmap = {};
  if (kategoriIds.length) {
    const kr = await supabase
      .from('kategorial')
      .select('kategori_id, nama, sub_kelompok, neraca_identifier')
      .in('kategori_id', kategoriIds);
    if (kr.error) return kr;
    for (const k of (kr.data ?? [])) {
      kmap[k.kategori_id] = {
        nama: k.nama,
        sub_kelompok: k.sub_kelompok,
        neraca_identifier: k.neraca_identifier,
      };
    }
  }

  // 4) Flatten final (bawa klaster_id & id_user dari header)
  const expanded = rows.map(r => {
    const hdrInfo = headerMap.get(r.laporan_id) || {};
    const pinfo = pmap[r.produk_id] ?? { nama: null, kategori_id: null };
    const kinfo = pinfo.kategori_id != null ? (kmap[pinfo.kategori_id] ?? {}) : {};
    return {
      jenis: hdrInfo.jenis ?? null,
      created_at: hdrInfo.created_at ?? null,
      tanggal: hdrInfo.tanggal ?? null,
      id_user: hdrInfo.id_user ?? null,
      klaster_id: hdrInfo.klaster_id ?? null,

      subtotal: Number(r.subtotal || 0),
      jumlah: Number(r.jumlah || 0),

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
