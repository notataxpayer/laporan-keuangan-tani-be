import supabase from '../config/supabase.js';

const RANGE_BY_JENIS = {
  aset_lancar:               { min: 0,    max: 1499 },
  aset_tetap:                { min: 1500, max: 3599 },
  kewajiban_lancar:          { min: 4000, max: 4499 },
  kewajiban_jangka_panjang:  { min: 4500, max: 4999 },
};
// Fallback
const FALLBACK_KEYWORDS = [
  { target: 'aset_lancar',  kws: ['panen','stok','persediaan','hasil','piutang'] },
  { target: 'aset_tetap',   kws: ['lahan','sawah','tanah','bangunan','alat','mesin'] },
];

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

// CREATE: kategori_id auto (SERIAL), neraca_identifier auto per-scope utk pemasukan/pengeluaran
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

  if (RANGE_BY_JENIS[j]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { next, error: idErr } = await nextScopedNeraca({
        ...RANGE_BY_JENIS[j],
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
  return supabase.from('kategorial').delete().eq('kategori_id', Number(kategori_id));
}

// referensi
export async function countProdukByKategori(kategori_id) {
  return supabase
    .from('produk')
    .select('produk_id', { count: 'exact', head: true })
    .eq('kategori_id', Number(kategori_id));
}
export async function countLapkeuanganByKategori(kategori_id) {
  return supabase
    .from('lapkeuangan')
    .select('id_laporan', { count: 'exact', head: true })
    .eq('kategori_id', Number(kategori_id));
}


// infersub kelompok: berdasarkan nama kategori & produk, rules per-user/klaster/global, fallback keywords

// V1
// async function inferSubKelompok({ kategori_nama, produk_nama, owner_user_id, owner_klaster_id }) {
//   const text = [kategori_nama, produk_nama].filter(Boolean).join(' ').toLowerCase();

//   // 1) Coba rules dari DB (prioritas user/klaster > global)
//   const { data: rules, error } = await supabase
//     .from('kategori_auto_rules')
//     .select('pattern, target_sub_kelompok, priority, user_id, klaster_id')
//     .or(`user_id.eq.${owner_user_id},klaster_id.eq.${owner_klaster_id},and(is.null.user_id,is.null.klaster_id)`)
//     .order('priority', { ascending: true });

//   if (!error) {
//     for (const r of rules || []) {
//       const pat = String(r.pattern || '').replace(/%/g, '').toLowerCase();
//       if (!pat) continue;
//       if (text.includes(pat)) return r.target_sub_kelompok;
//     }
//   }

//   // 2) Fallback keywords
//   for (const group of FALLBACK_KEYWORDS) {
//     for (const kw of group.kws) {
//       if (text.includes(kw)) return group.target;
//     }
//   }

//   // 3) Default aman: aset_lancar (bisa kamu ubah sesuai kebijakan)
//   return 'aset_lancar';
// }

// V2
async function inferSubKelompok({ kategori_nama, produk_nama, owner_user_id, owner_klaster_id }) {
  const text = [kategori_nama, produk_nama].filter(Boolean).join(' ').toLowerCase();

  const { data: rules, error } = await fetchRules({ owner_user_id, owner_klaster_id });
  if (!error && rules?.length) {
    // pakai pola simple: '%keyword%' → cek includes(keyword)
    for (const r of rules) {
      const kw = String(r.pattern || '').replace(/%/g,'').trim().toLowerCase();
      if (!kw) continue;
      if (text.includes(kw)) return r.target_sub_kelompok;
    }
  }
  return guessByFallback(text);
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


// create kategori auto
export async function createKategoriAutoSmart({
  nama,                 // nama kategori
  produk_nama,          // opsional: kalau kategori dibikin saat bikin produk pertama
  owner_user_id,
  owner_klaster_id,
}) {
  const sub = await inferSubKelompok({ kategori_nama: nama, produk_nama, owner_user_id, owner_klaster_id });
  const range = RANGE_BY_JENIS[sub];

  let neraca_identifier = null;
  if (range) {
    const { next, error } = await nextScopedNeracaInRange({ ...range, owner_user_id, owner_klaster_id });
    if (error) return { data: null, error };
    neraca_identifier = next;
  }

  return supabase
    .from('kategorial')
    .insert([{
      nama,
      jenis: 'produk',                  // tetap boleh 'produk' supaya backward compatible
      user_id: owner_user_id ?? null,
      klaster_id: owner_klaster_id ?? null,
      sub_kelompok: sub,                // <— inilah kuncinya
      neraca_identifier,                // ditaruh sesuai subgroup range
    }])
    .select('kategori_id, nama, jenis, klaster_id, user_id, sub_kelompok, neraca_identifier')
    .single();
}

// cari kategori by name, scope user/klaster

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


// ambil rule untuk infer subkelompok
async function fetchRules({ owner_user_id, owner_klaster_id }) {
  // prioritas: per user/klaster dulu, lalu global (null scope), urut priority ASC
  return supabase
    .from('kategori_auto_rules')
    .select('pattern, target_sub_kelompok, priority, user_id, klaster_id')
    .or(`user_id.eq.${owner_user_id},klaster_id.eq.${owner_klaster_id},and(is.null.user_id,is.null.klaster_id)`)
    .order('priority', { ascending: true });
}

function guessByFallback(text) {
  const t = text.toLowerCase();
  const FALLBACK = [
    { sub: 'aset_lancar', kws: ['panen','stok','persediaan','hasil','piutang','kas','bank','uang','pupuk','bibit','benih','obat'] },
    { sub: 'aset_tetap',  kws: ['lahan','sawah','tanah','bangunan','kendaraan','traktor','mesin','peralatan besar','gudang','kandang','sumur','irigasi'] },
    { sub: 'kewajiban_lancar', kws: ['utang dagang','hutang dagang','pinjaman','kredit bank','biaya','gaji','listrik','air','pajak'] },
    { sub: 'kewajiban_jangka_panjang', kws: ['utang bank','hutang bank','utang investasi','hutang modal','sewa jangka panjang','leasing','cicilan'] },
  ];
  for (const g of FALLBACK) {
    if (g.kws.some(kw => t.includes(kw))) return g.sub;
  }
  return 'aset_lancar';
}
