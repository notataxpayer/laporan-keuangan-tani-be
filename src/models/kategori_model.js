import supabase from '../config/supabase.js';

const RANGE_BY_JENIS = {
  pemasukan:  { min: 0,    max: 3599 },
  pengeluaran:{ min: 4000, max: 4999 },
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
