// src/models/kategori_model.js
import supabase from '../config/supabase.js';

const RANGE_BY_SUB = {
  aset_lancar:               { min: 0,    max: 2599 },
  aset_tetap:                { min: 2600, max: 3599 },
  kewajiban_lancar:          { min: 4000, max: 4499 },
  kewajiban_jangka_panjang:  { min: 4500, max: 4999 },
};

async function nextScopedNeraca({ min, max, owner_klaster_id, owner_user_id }) {
  let q = supabase
    .from('kategorial')
    .select('neraca_identifier')
    .gte('neraca_identifier', min)
    .lte('neraca_identifier', max)
    .order('neraca_identifier', { ascending: false })
    .limit(1);

  if (owner_klaster_id) {
    q = q.eq('klaster_id', owner_klaster_id);
  } else {
    q = q.is('klaster_id', null).eq('user_id', owner_user_id);
  }

  const { data, error } = await q;
  if (error) return { error };
  const currentMax = data?.[0]?.neraca_identifier ?? null;
  const next = currentMax === null ? min : currentMax + 1;
  if (next > max) return { error: { message: `Range ${min}-${max} penuh untuk scope ini` } };
  return { next };
}

// === CREATE klasik (masih dipakai kalau perlu manual by jenis) ===
export async function createKategoriAuto({
  nama,
  jenis,
  owner_user_id,
  owner_klaster_id,
}) {
  const j = String(jenis).trim().toLowerCase();

  const payload = {
    nama,
    jenis: j,
    user_id: owner_user_id ?? null,
    klaster_id: owner_klaster_id ?? null,
    neraca_identifier: null,
  };

  if (RANGE_BY_SUB[j]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { next, error: idErr } = await nextScopedNeraca({
        ...RANGE_BY_SUB[j],
        owner_klaster_id,
        owner_user_id,
      });
      if (idErr) return { data: null, error: idErr };

      const insertRes = await supabase
        .from('kategorial')
        .insert([{ ...payload, neraca_identifier: next }]) // kategori_id SERIAL
        .select('kategori_id, nama, jenis, klaster_id, user_id, neraca_identifier')
        .single();

      if (!insertRes.error) return insertRes;
      if (String(insertRes.error.message || '').toLowerCase().includes('duplicate')) continue;
      return insertRes;
    }
    return { data: null, error: { message: 'Gagal menetapkan neraca_identifier (race)' } };
  }

  // produk/pasar: neraca_identifier NULL
  return supabase
    .from('kategorial')
    .insert([payload])
    .select('kategori_id, nama, jenis, klaster_id, user_id, neraca_identifier')
    .single();
}

// LIST visible untuk viewer (klaster OR user)
export async function listKategoriVisible({
  jenis, search, page = 1, limit = 20, viewer_user_id, viewer_klaster_id,
}) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let q = supabase
    .from('kategorial')
    .select('kategori_id, nama, jenis, klaster_id, user_id, neraca_identifier', { count: 'exact' })
    .order('kategori_id', { ascending: true });

  if (jenis)  q = q.eq('jenis', jenis);
  if (search) q = q.ilike('nama', `%${search}%`);

  if (viewer_klaster_id) {
    q = q.or(`klaster_id.eq.${viewer_klaster_id},user_id.eq.${viewer_user_id}`);
  } else {
    q = q.eq('user_id', viewer_user_id);
  }

  return q.range(from, to);
}

export async function getKategoriById(kategori_id) {
  return supabase
    .from('kategorial')
    .select('kategori_id, nama, jenis, klaster_id, user_id, neraca_identifier')
    .eq('kategori_id', Number(kategori_id))
    .maybeSingle();
}

export async function deleteKategoriById(kategori_id) {
  return supabase
    .from('kategorial')
    .delete()
    .eq('kategori_id', Number(kategori_id));
}

// ======= (DULU) referensi ke produk/laporan =======
// Kita tidak lagi cek lapkeuangan.kategori_id karena kolom tsb sudah dihapus
export async function countProdukByKategori(kategori_id) {
  return supabase
    .from('produk')
    .select('produk_id', { count: 'exact', head: true })
    .eq('kategori_id', Number(kategori_id));
}

// ============== RULES (STRICT) ==============
async function inferSubKelompokStrict({ kategori_nama, produk_nama, owner_user_id, owner_klaster_id }) {
  const text = [kategori_nama, produk_nama].filter(Boolean).join(' ').toLowerCase();
  const { data: rules, error } = await fetchRulesStrict({ owner_user_id, owner_klaster_id });
  if (error) return { sub: null, err: error };

  for (const r of rules) {
    if (likeMatch(text, r.pattern)) {
      return { sub: r.target_sub_kelompok || null, err: null };
    }
  }
  return { sub: null, err: null }; // tidak ada yang match
}

// nextscoped in ranges utk inferSubKelompok
async function nextScopedNeracaInRange({ min, max, owner_user_id, owner_klaster_id }) {
  let q = supabase
    .from('kategorial')
    .select('neraca_identifier')
    .gte('neraca_identifier', min)
    .lte('neraca_identifier', max)
    .order('neraca_identifier', { ascending: false })
    .limit(1);

  if (owner_klaster_id) q = q.eq('klaster_id', owner_klaster_id);
  else q = q.is('klaster_id', null).eq('user_id', owner_user_id);

  const { data, error } = await q;
  if (error) return { error };
  const currentMax = data?.[0]?.neraca_identifier ?? null;
  const next = currentMax == null ? min : currentMax + 1;
  if (next > max) return { error: { message: `Range ${min}-${max} penuh untuk scope ini` } };
  return { next };
}

// create kategori auto (STRICT rules only)
export async function createKategoriAutoSmart({
  nama,
  produk_nama,
  owner_user_id,
  owner_klaster_id,
}) {
  const { sub: inferred_sub, err } = await inferSubKelompokStrict({
    kategori_nama: nama,
    produk_nama,
    owner_user_id,
    owner_klaster_id,
  });
  if (err) return { data: null, error: err };

  // wajib ada rule yang match
  if (!inferred_sub) {
    return { data: null, error: { message: 'Tidak ada rule kategori yang cocok di kategori_auto_rules' } };
  }

  const payload = {
    nama,
    jenis: inferred_sub.startsWith('kewajiban') ? 'pengeluaran' : 'pemasukan',
    sub_kelompok: inferred_sub,
    user_id: owner_user_id ?? null,
    klaster_id: owner_klaster_id ?? null,
    neraca_identifier: null,
  };

  const RANGE_BY_SUB = {
    aset_lancar: { min: 0, max: 2599 },
    aset_tetap: { min: 2600, max: 3599 },
    kewajiban_lancar: { min: 4000, max: 4499 },
    kewajiban_jangka_panjang: { min: 4500, max: 4999 },
  };
  const range = RANGE_BY_SUB[inferred_sub];

  // assign neraca_identifier dalam scope (user/klaster)
  for (let attempt = 0; attempt < 2; attempt++) {
    const { next, error } = await nextScopedNeracaByRange({
      ...range,
      owner_klaster_id,
      owner_user_id,
    });
    if (error) return { data: null, error };

    const ins = await supabase
      .from('kategorial')
      .insert([{ ...payload, neraca_identifier: next }])
      .select('kategori_id, nama, jenis, sub_kelompok, klaster_id, user_id, neraca_identifier')
      .single();

    if (!ins.error) return ins;
    if ((ins.error.message || '').toLowerCase().includes('duplicate')) continue;
    return ins;
  }

  return { data: null, error: { message: 'Gagal menetapkan neraca_identifier (race)' } };
}

async function fetchRulesStrict({ owner_user_id, owner_klaster_id }) {
  const ors = [
    owner_user_id    ? `user_id.eq.${owner_user_id}`       : 'false',
    owner_klaster_id ? `klaster_id.eq.${owner_klaster_id}` : 'false',
    'and(user_id.is.null,klaster_id.is.null)'
  ].join(',');

  const { data, error } = await supabase
    .from('kategori_auto_rules')
    .select('pattern, target_sub_kelompok, priority, user_id, klaster_id')
    .or(ors);

  if (error) return { data: [], error };

  const rank = (r) => (
    r.user_id === owner_user_id ? 0 :
    r.klaster_id === owner_klaster_id ? 1 : 2
  );

  const sorted = (data ?? []).slice().sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    return (a.priority ?? 9999) - (b.priority ?? 9999);
  });

  return { data: sorted, error: null };
}

// Like match utility (untuk rules matching)
function likeMatch(haystack, likePattern) {
  const esc = String(likePattern || '')
    .replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');     // escape regex
  const reStr = '^' + esc.replace(/%/g, '.*').replace(/_/g, '.') + '$';
  return new RegExp(reStr, 'i').test(haystack);
}

// === Cari kategori by name, scope user/klaster
export async function findKategoriByNameScoped({ nama, owner_user_id, owner_klaster_id }) {
  let q = supabase
    .from('kategorial')
    .select('kategori_id, nama, jenis, user_id, klaster_id, sub_kelompok, neraca_identifier')
    .ilike('nama', nama)   // case-insensitive exact match (ILIKE)
    .limit(1);

  if (owner_klaster_id) {
    q = q.eq('klaster_id', owner_klaster_id);
  } else {
    q = q.is('klaster_id', null).eq('user_id', owner_user_id);
  }

  const { data, error } = await q;
  if (error) return { data: null, error };
  return { data: data?.[0] ?? null, error: null };
}

// === List by scope (user_id dan/atau klaster_id)
export async function listKategoriByScope({
  owner_user_id, owner_klaster_id, jenis, search, page = 1, limit = 20,
}) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let q = supabase
    .from('kategorial')
    .select('kategori_id, nama, jenis, sub_kelompok, klaster_id, user_id, neraca_identifier', { count: 'exact' })
    .order('kategori_id', { ascending: true });

  if (jenis)  q = q.eq('jenis', jenis);
  if (search) q = q.ilike('nama', `%${search}%`);

  // Filter scope:
  if (owner_klaster_id && owner_user_id) {
    // union: milik klaster ATAU milik user (pribadi)
    q = q.or(`klaster_id.eq.${owner_klaster_id},and(klaster_id.is.null,user_id.eq.${owner_user_id})`);
  } else if (owner_klaster_id) {
    q = q.eq('klaster_id', owner_klaster_id);
  } else if (owner_user_id) {
    q = q.is('klaster_id', null).eq('user_id', owner_user_id);
  } else {
    return { data: [], error: null, count: 0 };
  }

  return q.range(from, to);
}

// === Nullify produk.kategori_id untuk kategori tertentu
export async function nullifyProdukKategori(kategori_id) {
  return supabase
    .from('produk')
    .update({ kategori_id: null })
    .eq('kategori_id', Number(kategori_id))
    // pakai select agar kita tahu berapa baris yang terpengaruh
    .select('produk_id');
}

// ====== util lain yang dipakai di createKategoriAutoSmart ======
async function nextScopedNeracaByRange({ min, max, owner_klaster_id, owner_user_id }) {
  let q = supabase
    .from('kategorial')
    .select('neraca_identifier')
    .gte('neraca_identifier', min)
    .lte('neraca_identifier', max)
    .order('neraca_identifier', { ascending: false })
    .limit(1);

  if (owner_klaster_id) q = q.eq('klaster_id', owner_klaster_id);
  else                  q = q.is('klaster_id', null).eq('user_id', owner_user_id);

  const { data, error } = await q;
  if (error) return { error };
  const currentMax = data?.[0]?.neraca_identifier ?? null;
  const next = currentMax == null ? min : currentMax + 1;
  if (next > max) return { error: { message: `Range ${min}-${max} penuh untuk scope ini` } };
  return { next };
}
