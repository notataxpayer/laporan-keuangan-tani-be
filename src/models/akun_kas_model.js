import supabase from '../config/supabase.js';

const TABLE = 'akun_kas';

export async function createAkunKas({ nama, deskripsi = null, saldo_awal = 0, saldo_akhir, owner_user_id, owner_klaster_id }) {
  const awal = Number(saldo_awal || 0);
  const akhir = saldo_akhir === undefined || saldo_akhir === null ? awal : Number(saldo_akhir);

  return supabase
    .from(TABLE)
    .insert([{
      nama,
      deskripsi,
      saldo_awal: awal,
      saldo_akhir: akhir,
      user_id: owner_user_id ?? null,
      klaster_id: owner_klaster_id ?? null,
    }])
    .select('akun_id, nama, deskripsi, saldo_awal, saldo_akhir, user_id, klaster_id, created_at')
    .single();
}

export async function listAkunKasVisible({ search, page = 1, limit = 20, viewer_user_id, viewer_klaster_id }) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let q = supabase
    .from(TABLE)
    .select('akun_id, nama, deskripsi, saldo_awal, saldo_akhir, user_id, klaster_id, created_at', { count: 'exact' })
    .order('akun_id', { ascending: true });

  if (search) q = q.ilike('nama', `%${search}%`);

  if (viewer_klaster_id) {
    q = q.or(`klaster_id.eq.${viewer_klaster_id},user_id.eq.${viewer_user_id}`);
  } else {
    q = q.eq('user_id', viewer_user_id);
  }

  return q.range(from, to);
}

export async function getAkunKasById(akun_id) {
  return supabase
    .from(TABLE)
    .select('akun_id, nama, deskripsi, saldo_awal, saldo_akhir, user_id, klaster_id')
    .eq('akun_id', Number(akun_id))
    .maybeSingle();
}

export async function deleteAkunKasById(akun_id) {
  return supabase.from(TABLE).delete().eq('akun_id', Number(akun_id));
}

export async function incSaldoAkunKas(akun_id, delta) {
  const id = Number(akun_id);
  const d  = Number(delta || 0);

  const { data: row, error: selErr } = await supabase
    .from(TABLE)
    .select('saldo_akhir')
    .eq('akun_id', id)
    .single();

  if (selErr || !row) return { error: selErr || new Error('akun_kas tidak ditemukan') };

  const next = Number(row.saldo_akhir || 0) + d;

  return supabase
    .from(TABLE)
    .update({ saldo_akhir: next })
    .eq('akun_id', id)
    .select('akun_id, saldo_akhir')
    .single();
}
