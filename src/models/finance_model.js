// src/models/finance_model.js
import supabase from '../config/supabase.js';

// --- PRODUK ---

export async function getProdukById(produk_id) {
  return supabase
    .from('produk')
    .select('produk_id, nama, kategori_id') // harga sudah dihapus dari skema produk
    .eq('produk_id', Number(produk_id))
    .single();
}

// --- LAPORAN ---

export async function insertLaporan({
  id_laporan, id_user, akun_id, jenis, deskripsi, debit, kredit, tanggal, klaster_id // NEW
}) {
  return supabase
    .from('lapkeuangan')
    .insert([{
      id_laporan,
      id_user,
      akun_id: akun_id ?? null,
      jenis,
      deskripsi: deskripsi ?? null,
      debit: Number(debit || 0),
      kredit: Number(kredit || 0),
      tanggal: tanggal ?? null,
      klaster_id: klaster_id ?? null, // NEW
    }])
    .select('id_laporan, id_user, akun_id, created_at, jenis, deskripsi, debit, kredit, tanggal, klaster_id') // NEW
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
    .select('id_laporan, id_user, akun_id, created_at, jenis, deskripsi, debit, kredit, tanggal, klaster_id') // NEW
    .eq('id_laporan', id_laporan)
    .single();
}

export async function getLaporanDetails(id_laporan) {
  return supabase
    .from('detaillaporanbarang')
    .select('id_detail, produk_id, jumlah, subtotal, produk:produk_id(nama, kategori_id)')
    .eq('laporan_id', id_laporan);
}

export async function listLaporan({
  id_user, klaster_id, start, end, jenis, akun_id, page = 1, limit = 10, tanggal,
}) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let q = supabase
    .from('lapkeuangan')
    .select('id_laporan, id_user, akun_id, created_at, jenis, deskripsi, debit, kredit, tanggal, klaster_id', { count: 'exact' }) // NEW
    .order('created_at', { ascending: false });

  if (id_user)     q = q.eq('id_user', id_user);
  if (klaster_id)  q = q.eq('klaster_id', Number(klaster_id)); // NEW
  if (jenis)       q = q.eq('jenis', jenis);
  if (akun_id)     q = q.eq('akun_id', Number(akun_id));
  if (start)       q = q.gte('created_at', start);
  if (end)         q = q.lt('created_at', end);
  if (tanggal)     q = q.eq('tanggal', tanggal);

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

// Laba-rugi (agregasi header)
export async function sumProfitLoss({ id_user, start, end }) {
  let q = supabase
    .from('lapkeuangan')
    .select('debit, kredit, jenis, created_at, tanggal');

  if (id_user) q = q.eq('id_user', id_user);
  if (start) q = q.gte('created_at', start);
  if (end) q = q.lt('created_at', end);

  return q;
}

// Arus kas (list) + filter akun
export async function listAruskas({
  id_user, start, end, arah, akun_id,
  page = 1, limit = 10,
  share = 'all',           // 'all' | 'own' | 'cluster'
  klaster_id_filter = null // nomor klaster spesifik (untuk share=cluster)
}) {
  const from = (page - 1) * limit;
  const to   = from + limit - 1;

  let q = supabase
    .from('lapkeuangan')
    .select(
      // TAMBAH klaster_id di sini
      'id_laporan, id_user, akun_id, klaster_id, created_at, jenis, deskripsi, debit, kredit, tanggal',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false });

  if (id_user) q = q.eq('id_user', id_user);
  if (akun_id) q = q.eq('akun_id', Number(akun_id));
  if (start)   q = q.gte('created_at', start);
  if (end)     q = q.lt('created_at', end); // end eksklusif

  // arah
  if (arah === 'masuk') {
    q = q.eq('jenis', 'pemasukan').gt('debit', 0);
  } else if (arah === 'keluar') {
    q = q.eq('jenis', 'pengeluaran').gt('kredit', 0);
  }

  // === FILTER SHARE DI LEVEL DB ===
  if (share === 'own') {
    q = q.is('klaster_id', null);
  } else if (share === 'cluster') {
    q = q.not('klaster_id', 'is', null);
    if (klaster_id_filter != null) {
      q = q.eq('klaster_id', Number(klaster_id_filter));
    }
  }
  // share === 'all' -> tanpa tambahan

  return q.range(from, to);
}

/**
 * Neraca: agregasi via DETAIL (detail → produk → kategorial.neraca_identifier)
 * Karena kategori_id di header laporan sudah di-drop.
 */
export async function listForNeracaByItems({ id_user, start, end }) {
  // Ambil detail + header jenis + produk.kategori_id + kategori.neraca_identifier
  let q = supabase
    .from('detaillaporanbarang')
    .select(`
      subtotal,
      laporan:laporan_id ( id_user, created_at, jenis ),
      produk:produk_id ( kategori_id ),
      kategori:produk_id!inner ( kategori_id )  -- dummy to force join? (lihat di bawah catatan)
    `);

  // === Langkah 1: tarik detail + header + produk_id
  let q1 = supabase
    .from('detaillaporanbarang')
    .select('subtotal, laporan:laporan_id(id_user, created_at, jenis), produk_id');

  if (start) q1 = q1.gte('laporan.created_at', start);
  if (end)   q1 = q1.lt('laporan.created_at', end);

  const d1 = await q1;
  if (d1.error) return d1;
  const rows = d1.data ?? [];

  // Filter milik user (kalau ada)
  const filtered = id_user ? rows.filter(r => r.laporan?.id_user === id_user) : rows;

  // Kumpulkan produk_id unik
  const produkIds = [...new Set(filtered.map(r => r.produk_id).filter(Boolean))];

  // === Langkah 2: ambil kategori_id per produk
  let pmap = {};
  if (produkIds.length) {
    const pr = await supabase
      .from('produk')
      .select('produk_id, kategori_id')
      .in('produk_id', produkIds);
    if (pr.error) return pr;
    for (const p of pr.data ?? []) pmap[p.produk_id] = p.kategori_id;
  }

  // === Langkah 3: ambil neraca_identifier per kategori
  const kategoriIds = [...new Set(Object.values(pmap).filter(v => v !== null && v !== undefined))];
  let kmap = {};
  if (kategoriIds.length) {
    const kr = await supabase
      .from('kategorial')
      .select('kategori_id, neraca_identifier')
      .in('kategori_id', kategoriIds);
    if (kr.error) return kr;
    for (const k of kr.data ?? []) kmap[k.kategori_id] = k.neraca_identifier;
  }

  // Build hasil: [{ jenis, subtotal, neraca_identifier }]
  const mapped = filtered.map(r => ({
    jenis: r.laporan?.jenis,
    subtotal: Number(r.subtotal || 0),
    neraca_identifier: kmap[pmap[r.produk_id]] ?? null
  }));

  return { data: mapped, error: null };
}

export async function listForNeracaExpanded({ id_user, start, end }) {
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

  // 2) ambil map produk: { produk_id -> { nama, kategori_id } }
  const produkIds = [...new Set(rows.map(r => r.produk_id).filter(Boolean))];
  const pr = await supabase
    .from('produk')
    .select('produk_id, nama, kategori_id')
    .in('produk_id', produkIds);
  if (pr.error) return pr;
  const pmap = {};
  for (const p of pr.data ?? []) pmap[p.produk_id] = { nama: p.nama, kategori_id: p.kategori_id };

  // 3) ambil map kategori: { kategori_id -> { neraca_identifier, nama } }
  const kategoriIds = [...new Set(Object.values(pmap).map(v => v?.kategori_id).filter(v => v != null))];
  let kmap = {};
  if (kategoriIds.length) {
    const kr = await supabase
      .from('kategorial')
      .select('kategori_id, neraca_identifier, nama, sub_kelompok')
      .in('kategori_id', kategoriIds);
    if (kr.error) return kr;
    for (const k of kr.data ?? []) kmap[k.kategori_id] = {
      neraca_identifier: k.neraca_identifier,
      nama: k.nama,
      sub_kelompok: k.sub_kelompok
    };
  }

  const expanded = rows.map(r => {
    const pinfo = pmap[r.produk_id] ?? { nama: null, kategori_id: null };
    const kinfo = pinfo.kategori_id != null ? kmap[pinfo.kategori_id] : { neraca_identifier: null, nama: null, sub_kelompok: null };
    return {
      jenis: r.laporan?.jenis ?? null,
      subtotal: Number(r.subtotal || 0),
      produk_id: r.produk_id ?? null,
      produk_nama: pinfo.nama,
      kategori_id: pinfo.kategori_id,
      neraca_identifier: kinfo.neraca_identifier ?? null,
      kategori_nama: kinfo.nama ?? null,
      sub_kelompok: kinfo.sub_kelompok ?? null,
    };
  });

  return { data: expanded, error: null };
}


export async function updateLaporan({ id_laporan, patch }) {
  return supabase
    .from('lapkeuangan')
    .update({
      jenis: patch.jenis,
      deskripsi: patch.deskripsi ?? null,
      debit: Number(patch.debit || 0),
      kredit: Number(patch.kredit || 0),
      akun_id: patch.akun_id ?? null,
      tanggal: patch.tanggal ?? null,
      klaster_id: patch.klaster_id ?? null, // NEW
    })
    .eq('id_laporan', id_laporan)
    .select('id_laporan, id_user, akun_id, created_at, jenis, deskripsi, debit, kredit, tanggal, klaster_id') // NEW
    .single();
}

// NEW: hapus semua detail by laporan
export async function deleteDetailsByLaporan(laporan_id) {
  return supabase
    .from('detaillaporanbarang')
    .delete()
    .eq('laporan_id', laporan_id);
}

// NEW: replace (delete + insert) detail barang
export async function replaceDetailBarang(laporan_id, items) {
  const del = await deleteDetailsByLaporan(laporan_id);
  if (del.error) return del;
  if (!items || !items.length) return { data: [], error: null };
  return insertDetailBarang(laporan_id, items);
}