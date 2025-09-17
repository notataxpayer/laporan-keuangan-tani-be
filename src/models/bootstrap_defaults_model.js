// src/models/bootstrap_defaults.model.js
import supabase from '../config/supabase.js';

// ---- util: cari kategori by nama + scope (user/klaster) ----
async function findKategoriByNameScoped({ nama, owner_user_id, owner_klaster_id }) {
  let q = supabase
    .from('kategorial')
    .select('kategori_id, nama, jenis, sub_kelompok, user_id, klaster_id, neraca_identifier')
    .ilike('nama', nama)   // match case-insensitive
    .limit(1);

  if (owner_klaster_id) q = q.eq('klaster_id', owner_klaster_id);
  else                  q = q.is('klaster_id', null).eq('user_id', owner_user_id);

  const { data, error } = await q;
  if (error) return { data: null, error };
  return { data: data?.[0] ?? null, error: null };
}

// ---- util: next neraca id per scope & range ----
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
  const current = data?.[0]?.neraca_identifier ?? null;
  const next = current == null ? min : current + 1;
  if (next > max) return { error: { message: `Range ${min}-${max} penuh untuk scope ini` } };
  return { next };
}

// ---- ensureKategori: buat kategori kalau belum ada (dengan sub_kelompok eksplisit) ----
async function ensureKategori({ nama, sub_kelompok, owner_user_id, owner_klaster_id }) {
  // 1) kalau sudah ada, return existing
  const exist = await findKategoriByNameScoped({ nama, owner_user_id, owner_klaster_id });
  if (exist.error) return { data: null, error: exist.error };
  if (exist.data)  return { data: exist.data,  error: null };

  // 2) turunkan jenis & range dari sub_kelompok
  const kind = String(sub_kelompok || '').startsWith('kewajiban') ? 'pengeluaran' : 'pemasukan';
  const RANGE_BY_SUB = {
    aset_lancar:               { min: 0,    max: 2599 },
    aset_tetap:                { min: 2600, max: 3599 },
    kewajiban_lancar:          { min: 4000, max: 4499 },
    kewajiban_jangka_panjang:  { min: 4500, max: 4999 },
    modal: {min: 6000, max: 6500}
  };
  const range = RANGE_BY_SUB[sub_kelompok];
  if (!range) return { data: null, error: { message: `sub_kelompok tidak dikenali: ${sub_kelompok}` } };

  // 3) ambil neraca_identifier pada scope
  const step = await nextScopedNeracaByRange({ ...range, owner_klaster_id, owner_user_id });
  if (step.error) return { data: null, error: step.error };

  // 4) insert
  const payload = {
    nama,
    jenis: kind,
    sub_kelompok,
    user_id: owner_user_id ?? null,
    klaster_id: owner_klaster_id ?? null,
    neraca_identifier: step.next,
  };

  const ins = await supabase
    .from('kategorial')
    .insert([payload])
    .select('kategori_id, nama, jenis, sub_kelompok, klaster_id, user_id, neraca_identifier')
    .single();

  return ins;
}

// ---- ensureProduk: buat produk kalau belum ada (nama + scope) ----
// GANTI fungsi ini
async function ensureProduk({ nama, kategori_id, owner_user_id, owner_klaster_id }) {
  // cek produk existing dalam scope
  let q = supabase
    .from('produk')
    .select('produk_id, nama, kategori_id, created_by, klaster_id') // <-- created_by
    .eq('nama', nama) // pakai eq biar idempotent bener-bener exact
    .limit(1);

  if (owner_klaster_id) {
    q = q.eq('klaster_id', owner_klaster_id);
  } else {
    q = q.is('klaster_id', null).eq('created_by', owner_user_id); // <-- created_by
  }

  const { data: found, error: findErr } = await q;
  if (findErr) return { data: null, error: findErr };
  if (found?.[0]) return { data: found[0], error: null };

  // insert baru
  const ins = await supabase
    .from('produk')
    .insert([{
      nama,
      kategori_id: kategori_id ?? null,
      created_by: owner_user_id ?? null,   // <-- created_by
      klaster_id: owner_klaster_id ?? null,
    }])
    .select('produk_id, nama, kategori_id, created_by, klaster_id') // <-- created_by
    .single();

  return ins;
}


// ---- daftar default (bisa kamu ubah kapan saja) ----
const DEFAULT_CATEGORIES = [
  // pemasukan
  { nama: 'Panen Kentang',           sub: 'aset_lancar' },
  { nama: 'Persediaan Benih',        sub: 'aset_lancar' },
  { nama: 'Panen Belum Kejual',      sub: 'aset_lancar' },
  { nama: 'Alat Pertanian',          sub: 'aset_tetap'  },
  { nama: 'Mesin Pertanian',         sub: 'aset_tetap'  },
  { nama: 'Lahan Sawah',             sub: 'aset_tetap'  },

  // pengeluaran (kewajiban)
  { nama: 'Cicilan Alat Tani',       sub: 'kewajiban_jangka_panjang' },
  { nama: 'Cicilan Mesin Tani',      sub: 'kewajiban_jangka_panjang' },
  { nama: 'Hutang Bibit',            sub: 'kewajiban_lancar' },
  { nama: 'Hutang Pupuk',            sub: 'kewajiban_lancar' },
  { nama: 'Hutang ke Tengkulak',     sub: 'kewajiban_lancar' },
];

const DEFAULT_PRODUCTS = [
  // nama produk, refer ke nama kategori
  { nama: 'Panen Kentang G0',                     kategori: 'Panen Kentang' },
  { nama: 'Panen Kentang G2',                     kategori: 'Panen Kentang' },
  { nama: 'Panen Kentang G3',                     kategori: 'Panen Kentang' },
  { nama: 'Panen Kentang G4',                     kategori: 'Panen Kentang' },

  { nama: 'Persediaan Benih Kentang',             kategori: 'Persediaan Benih' },
  { nama: 'Panen Kentang yang belum terjual',     kategori: 'Panen Belum Kejual' },

  { nama: 'Lahan Sawah A',                        kategori: 'Lahan Sawah' },

  { nama: 'Cicilan Traktor',                      kategori: 'Cicilan Mesin Tani' },
  { nama: 'Cicilan Cangkul A',                    kategori: 'Cicilan Alat Tani' },

  { nama: 'Hutang Bibit Kentang G0',              kategori: 'Hutang Bibit' },
  { nama: 'Hutang Pembelian Pupuk A',             kategori: 'Hutang Pupuk' },
  { nama: 'Hutang ke Tengkulak A',                kategori: 'Hutang ke Tengkulak' },
];

// ---- fungsi utama: buat batch kategori + produk default (idempotent) ----
export async function createBatchDefaultsForUser({
  owner_user_id,
  owner_klaster_id = null,  // kalau shareToKlaster=false, nilai ini diabaikan
  shareToKlaster = false,   // true => simpan ke klaster, false => pribadi
}) {
  const scopeKlaster = shareToKlaster ? (owner_klaster_id ?? null) : null;

  // 1) pastikan semua kategori ada, simpan peta nama -> kategori_id
  const catMap = new Map(); // namaKategori -> kategori_id
  for (const c of DEFAULT_CATEGORIES) {
    const { data, error } = await ensureKategori({
      nama: c.nama,
      sub_kelompok: c.sub,
      owner_user_id,
      owner_klaster_id: scopeKlaster,
    });
    if (error) return { ok: false, error };
    catMap.set(c.nama, data.kategori_id);
  }

  // 2) buat produk berdasar kategori yang baru dibuat
  for (const p of DEFAULT_PRODUCTS) {
    const kategori_id = catMap.get(p.kategori) || null;
    const { error } = await ensureProduk({
      nama: p.nama,
      kategori_id,
      owner_user_id,
      owner_klaster_id: scopeKlaster,
    });
    if (error) return { ok: false, error };
  }

  return { ok: true };
}
