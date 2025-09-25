// src/controllers/neraca_controller.js
import { fetchNeracaExpanded } from '../models/neraca_model.js';
import supabase from '../config/supabase.js';

function isAdmin(role) { return role === 'admin' || role === 'superadmin'; }

const isNullishCluster = (v) =>
  v === null || v === undefined || v === "null" || v === "";

function applyShareFilter(rows, { share = "all", userClusterId = null, scope = "user", klasterScopeId = null }) {
  if (share === "own") {
    // hanya yang klaster_id NULL
    return rows.filter(r => isNullishCluster(r.klaster_id));
  }
  if (share === "cluster") {
    // hanya yang klaster_id TIDAK NULL
    // jika scope=user, batasi ke klaster user agar tidak ambil klaster lain
    if (scope === "user" && userClusterId) {
      return rows.filter(r => !isNullishCluster(r.klaster_id) && String(r.klaster_id) === String(userClusterId));
    }
    // jika scope=cluster, cukup non-null (atau samakan dengan klasterScopeId bila ingin strict)
    if (scope === "cluster" && klasterScopeId) {
      return rows.filter(r => !isNullishCluster(r.klaster_id) && String(r.klaster_id) === String(klasterScopeId));
    }
    return rows.filter(r => !isNullishCluster(r.klaster_id));
  }
  return rows; // all
}

const RANGES = {
  aset_lancar:  { min: 0,    max: 2599 },
  aset_tetap:   { min: 2600, max: 3599 },
  kew_lancar:   { min: 4000, max: 4499 },
  kew_jangka:   { min: 4500, max: 4999 },
};

function pickBucket({ sub_kelompok, neraca_identifier }) {
  if (sub_kelompok) return sub_kelompok;
  const ni = neraca_identifier;
  if (ni == null) return null;
  if (ni >= RANGES.aset_lancar.min && ni <= RANGES.aset_lancar.max) return 'aset_lancar';
  if (ni >= RANGES.aset_tetap.min  && ni <= RANGES.aset_tetap.max)  return 'aset_tetap';
  if (ni >= RANGES.kew_lancar.min  && ni <= RANGES.kew_lancar.max)  return 'kewajiban_lancar';
  if (ni >= RANGES.kew_jangka.min  && ni <= RANGES.kew_jangka.max)  return 'kewajiban_jangka_panjang';
  return null;
}

// helper agregasi per bucket dan per produk
function buildBuckets(rows) {
  const buckets = {
    aset_lancar:  { debit:0, kredit:0, items:{} },
    aset_tetap:   { debit:0, kredit:0, items:{} },
    kewajiban_lancar: { debit:0, kredit:0, items:{} },
    kewajiban_jangka_panjang: { debit:0, kredit:0, items:{} },
    unknown: { debit:0, kredit:0, items:{} },
  };

  for (const r of rows) {
    const key = pickBucket(r) || 'unknown';
    if (!key || !buckets[key]) continue;

    // total bucket
    if (r.jenis === 'pemasukan') buckets[key].debit  += r.subtotal;
    else                         buckets[key].kredit += r.subtotal;

    // group by produk di dalam bucket
    const pid = r.produk_id ?? `unknown:${r.kategori_id ?? 'null'}`;
    if (!buckets[key].items[pid]) {
      buckets[key].items[pid] = {
        produk_id: r.produk_id,
        produk_nama: r.produk_nama,
        kategori_id: r.kategori_id,
        kategori_nama: r.kategori_nama,
        debit: 0,
        kredit: 0,
      };
    }
    if (r.jenis === 'pemasukan') buckets[key].items[pid].debit  += r.subtotal;
    else                         buckets[key].items[pid].kredit += r.subtotal;
  }

  // hitung saldo & convert items object → array
  const finalize = (b) => {
    const itemsArr = Object.values(b.items).map(it => ({ ...it, saldo: it.debit - it.kredit }));
    return { debit: b.debit, kredit: b.kredit, saldo: b.debit - b.kredit, items: itemsArr };
  };

  return {
    aset_lancar: finalize(buckets.aset_lancar),
    aset_tetap: finalize(buckets.aset_tetap),
    kewajiban_lancar: finalize(buckets.kewajiban_lancar),
    kewajiban_jangka_panjang: finalize(buckets.kewajiban_jangka_panjang),
  };
}
// resolver user
function resolveTargetUser(req) {
  const userIdParam = req.params.userId || req.query.user_id || null;
  if (isAdmin(req.user.role)) return userIdParam || req.user.user_id;
  return req.user.user_id;
}

async function resolveScope(req) {
  // Prioritaskan path cluster jika ada
  const klasterId = req.params.klasterId || req.query.klaster_id || null;
  const userIdParam = req.params.userId || req.query.user_id || null;

  if (klasterId) {
    // Non-admin hanya boleh akses klasternya sendiri
    if (!isAdmin(req.user.role)) {
      const { data: me } = await supabase
        .from('User').select('klaster_id').eq('user_id', req.user.user_id).single();
      if (!me || String(me.klaster_id) !== String(klasterId)) {
        return { error: { code: 403, message: 'Forbidden (klaster)' } };
      }
    }
    return { scope: 'cluster', klaster_id: klasterId };
  }

  // Scope user
  if (userIdParam) {
    if (!isAdmin(req.user.role) && userIdParam !== req.user.user_id) {
      return { error: { code: 403, message: 'Forbidden (user)' } };
    }
    return { scope: 'user', id_user: userIdParam };
  }

  // default: user saat ini
  return { scope: 'user', id_user: req.user.user_id };
}

// GET /neraca/summary?start=&end=&id_user=
export async function getNeracaSummary(req, res) {
  const start = req.query.start ? new Date(req.query.start).toISOString() : undefined;
  const end   = req.query.end   ? new Date(req.query.end).toISOString()   : undefined;

  const resolved = await resolveScope(req);
  if (resolved.error) return res.status(resolved.error.code).json({ message: resolved.error.message });

  const { scope, id_user, klaster_id } = resolved;

  // ambil param share: "all" | "own" | "cluster"
  const share = String(req.query.share || "all").toLowerCase();
  const userClusterId = req.user?.klaster_id ?? null;

  const { data, error } = await fetchNeracaExpanded({
    id_user: scope === 'user' ? id_user : undefined,
    klaster_id: scope === 'cluster' ? klaster_id : undefined,
    start, end
  });
  if (error) return res.status(500).json({ message: 'Gagal ambil neraca', detail: error.message });

  // >>> APPLY SHARE FILTER DI SINI <<<
  const filtered = applyShareFilter(data, {
    share,
    userClusterId,
    scope,
    klasterScopeId: klaster_id ?? null,
  });

  const grouped = buildBuckets(filtered);
  const total_aset = grouped.aset_lancar.saldo + grouped.aset_tetap.saldo;
  const total_kew  = grouped.kewajiban_lancar.saldo + grouped.kewajiban_jangka_panjang.saldo;

  return res.json({
    scope,
    share,
    target: scope === 'user' ? { id_user } : { klaster_id },
    periode: { start: start ?? null, end: end ?? null },
    ...grouped,
    total_aset,
    total_kewajiban: total_kew,
    total: total_aset + total_kew
  });
}



// GET /neraca/details?bucket=&start=&end=&id_user=&limit=&page=
export async function getNeracaDetails(req, res) {
  const start = req.query.start ? new Date(req.query.start).toISOString() : undefined;
  const end   = req.query.end   ? new Date(req.query.end).toISOString()   : undefined;
  const bucket = String(req.query.bucket || '').toLowerCase();

  const targetUser = resolveTargetUser(req);
  if (!isAdmin(req.user.role) && req.params.userId && req.params.userId !== req.user.user_id) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const offset = (page - 1) * limit;

  const share = String(req.query.share || "all").toLowerCase();
  const userClusterId = req.user?.klaster_id ?? null;

  const { data, error } = await fetchNeracaExpanded({ id_user: targetUser, start, end });
  if (error) return res.status(500).json({ message: 'Gagal ambil data', detail: error.message });

  // filter share dulu
  const afterShare = applyShareFilter(data, {
    share,
    userClusterId,
    scope: 'user',
    klasterScopeId: null,
  });

  // lalu seleksi bucket
  const rows = afterShare.filter(r => pickBucket(r) === bucket);

  // agregasi per produk (tetap sama)
  const map = new Map();
  for (const r of rows) {
    const key = r.produk_id ?? `unknown:${r.kategori_id ?? 'null'}`;
    const acc = map.get(key) || {
      produk_id: r.produk_id,
      produk_nama: r.produk_nama,
      kategori_id: r.kategori_id,
      kategori_nama: r.kategori_nama,
      debit: 0,
      kredit: 0,
    };
    if (r.jenis === 'pemasukan') acc.debit += r.subtotal;
    else                         acc.kredit += r.subtotal;
    map.set(key, acc);
  }
  const items = [...map.values()].map(it => ({ ...it, saldo: it.debit - it.kredit }));
  const paged = items.slice(offset, offset + limit);

  return res.json({ bucket, share, page, limit, total: items.length, items: paged });
}


// GET /neraca/by-produk?start=&end=&id_user=
export async function getNeracaByProduk(req, res) {
  const start = req.query.start ? new Date(req.query.start).toISOString() : undefined;
  const end   = req.query.end   ? new Date(req.query.end).toISOString()   : undefined;

  const targetUser = resolveTargetUser(req);
  if (!isAdmin(req.user.role) && req.params.userId && req.params.userId !== req.user.user_id) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const share = String(req.query.share || "all").toLowerCase();
  const userClusterId = req.user?.klaster_id ?? null;

  const { data, error } = await fetchNeracaExpanded({ id_user: targetUser, start, end });
  if (error) return res.status(500).json({ message: 'Gagal ambil data', detail: error.message });

  // filter share dulu
  const afterShare = applyShareFilter(data, {
    share,
    userClusterId,
    scope: 'user',
    klasterScopeId: null,
  });

  // lanjut grouping by produk (seperti semula)
  const map = new Map();
  for (const r of afterShare) {
    const bucket = pickBucket(r) ?? 'unknown';
    const key = r.produk_id ?? `unknown:${r.kategori_id ?? 'null'}`;
    const acc = map.get(key) || {
      produk_id: r.produk_id,
      produk_nama: r.produk_nama,
      kategori_id: r.kategori_id,
      kategori_nama: r.kategori_nama,
      buckets: {
        aset_lancar: { debit:0, kredit:0 },
        aset_tetap: { debit:0, kredit:0 },
        kewajiban_lancar: { debit:0, kredit:0 },
        kewajiban_jangka_panjang: { debit:0, kredit:0 },
        unknown: { debit:0, kredit:0 },
      }
    };
    if (r.jenis === 'pemasukan') acc.buckets[bucket].debit  += r.subtotal;
    else                         acc.buckets[bucket].kredit += r.subtotal;
    map.set(key, acc);
  }

  const items = [...map.values()].map(row => {
    const tot = Object.values(row.buckets).reduce(
      (a, b) => ({ debit: a.debit + b.debit, kredit: a.kredit + b.kredit }),
      {debit:0, kredit:0}
    );
    return { ...row, total: { ...tot, saldo: tot.debit - tot.kredit } };
  });

  return res.json({
    share,
    periode: { start: start ?? null, end: end ?? null },
    data: items
  });
}

