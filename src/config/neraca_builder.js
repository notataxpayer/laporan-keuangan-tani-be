// src/services/neraca_builder.js
export function buildNeracaNested(items, { mode = 'gross' } = {}) {
  const isAset = (code) => code !== null && code >= 0 && code <= 3599;
  const isKew  = (code) => code !== null && code >= 4000 && code <= 4999;

  // Struktur target:
  // {
  //   aset: [{ code, kategori_nama, total, products: [{ produk_id, nama, total }] }],
  //   kewajiban: [ ... ],
  // }
  const mapPerCode = new Map(); // code → { code, kategori_nama, total, products: Map(produk_id → {produk_id, nama, total}) }

  for (const r of items) {
    const code = r.neraca_identifier ?? null;
    if (code === null) continue; // lewati cat tanpa akun neraca

    let val = Math.abs(Number(r.subtotal || 0));
    if (mode === 'directional') {
      if (isAset(code)) {
        val = r.jenis === 'pengeluaran' ? -Math.abs(val) : +Math.abs(val);
      } else if (isKew(code)) {
        val = r.jenis === 'pemasukan' ? -Math.abs(val) : +Math.abs(val);
      }
    }

    if (!mapPerCode.has(code)) {
      mapPerCode.set(code, {
        code,
        kategori_nama: r.kategori_nama ?? null,
        total: 0,
        products: new Map(),
      });
    }
    const bucket = mapPerCode.get(code);
    bucket.total += val;

    if (r.produk_id != null) {
      if (!bucket.products.has(r.produk_id)) {
        bucket.products.set(r.produk_id, {
          produk_id: r.produk_id,
          nama: r.produk_nama ?? null,
          total: 0,
        });
      }
      const p = bucket.products.get(r.produk_id);
      p.total += val;
    }
  }

  const aset = [];
  const kewajiban = [];
  for (const code of [...mapPerCode.keys()].sort((a,b)=>a-b)) {
    const b = mapPerCode.get(code);
    const products = [...b.products.values()].sort((a,b)=> (b.total - a.total)); // urutkan produk by nilai
    const node = { code, kategori_nama: b.kategori_nama, total: b.total, products };
    if (isAset(code)) aset.push(node);
    else if (isKew(code)) kewajiban.push(node);
  }

  const total_aset = aset.reduce((s,a)=>s+a.total, 0);
  const total_kew  = kewajiban.reduce((s,a)=>s+a.total, 0);

  return {
    groups: { aset, kewajiban },
    totals: { aset: total_aset, kewajiban: total_kew, selisih: total_aset - total_kew },
  };
}


// Classified by subrange

function classifyBySubOrRange({ code, sub }) {
  if (sub) return sub; // pakai yang dari DB jika tersedia
  if (code == null) return null;
  if (code >= 0 && code <= 1499) return 'aset_lancar';
  if (code >= 1500 && code <= 3599) return 'aset_tetap';
  if (code >= 4000 && code <= 4499) return 'kewajiban_lancar';
  if (code >= 4500 && code <= 4999) return 'kewajiban_jangka_panjang';
  return null;
}

export function buildNeracaNestedWithSubgroups(items, { mode = 'gross' } = {}) {
  const buckets = {
    aset_lancar: [], aset_tetap: [],
    kewajiban_lancar: [], kewajiban_jangka_panjang: [],
  };
  const totals = { aset_lancar:0, aset_tetap:0, kewajiban_lancar:0, kewajiban_jangka_panjang:0 };

  const perCode = new Map(); // code -> { code, kategori_nama, subgroup, total, products: Map }

  const signed = (subgroup, jenis, v) => {
    if (mode !== 'directional') return Math.abs(v);
    const val = Math.abs(v);
    if (subgroup?.startsWith('aset')) {
      return jenis === 'pengeluaran' ? -val : +val;
    }
    if (subgroup?.startsWith('kewajiban')) {
      return jenis === 'pemasukan' ? -val : +val;
    }
    return val;
  };

  for (const r of items) {
    const code = r.neraca_identifier ?? null;
    const subgroup = classifyBySubOrRange({ code, sub: r.sub_kelompok });
    if (!subgroup) continue;

    const val = signed(subgroup, r.jenis, Number(r.subtotal || 0));
    if (!perCode.has(code)) {
      perCode.set(code, {
        code,
        kategori_nama: r.kategori_nama ?? null,
        subgroup,
        total: 0,
        products: new Map(),
      });
    }
    const b = perCode.get(code);
    b.total += val;

    if (r.produk_id != null) {
      if (!b.products.has(r.produk_id)) {
        b.products.set(r.produk_id, { produk_id: r.produk_id, nama: r.produk_nama ?? null, total: 0 });
      }
      b.products.get(r.produk_id).total += val;
    }
  }

  // tuang ke bucket + hitung totals
  for (const node of perCode.values()) {
    const products = [...node.products.values()].sort((a,b)=>b.total - a.total);
    const row = { code: node.code, kategori_nama: node.kategori_nama, total: node.total, products };
    buckets[node.subgroup].push(row);
    totals[node.subgroup] += node.total;
  }

  // sort tiap bucket
  for (const key of Object.keys(buckets)) buckets[key].sort((a,b)=>a.code - b.code);

  const total_aset = totals.aset_lancar + totals.aset_tetap;
  const total_kew  = totals.kewajiban_lancar + totals.kewajiban_jangka_panjang;

  return {
    groups: {
      aset: { lancar: buckets.aset_lancar, tetap: buckets.aset_tetap },
      kewajiban: { lancar: buckets.kewajiban_lancar, jangka_panjang: buckets.kewajiban_jangka_panjang },
    },
    totals: {
      aset: { lancar: totals.aset_lancar, tetap: totals.aset_tetap, total: total_aset },
      kewajiban: { lancar: totals.kewajiban_lancar, jangka_panjang: totals.kewajiban_jangka_panjang, total: total_kew },
      selisih: total_aset - total_kew
    }
  };
}