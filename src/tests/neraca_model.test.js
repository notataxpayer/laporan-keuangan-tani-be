// src/tests/neraca_model.test.js
import { jest } from '@jest/globals';

// --- mock data yang dipakai sepanjang pipeline ---
const RESULTS = {
  User: {
    data: [{ user_id: 'U1' }, { user_id: 'U2' }],
  },
  lapkeuangan: {
    data: [
      { id_laporan: 'L1', id_user: 'U1', jenis: 'pemasukan', created_at: '2025-01-01T00:00:00Z' },
    ],
  },
  detaillaporanbarang: {
    data: [{ laporan_id: 'L1', subtotal: 1000, produk_id: 10 }],
  },
  produk: {
    data: [{ produk_id: 10, nama: 'Pupuk', kategori_id: 5 }],
  },
  kategorial: {
    data: [{ kategori_id: 5, nama: 'Input', sub_kelompok: 'aset_lancar', neraca_identifier: 100 }],
  },
};

// Builder supabase yang chainable + thenable (biar bisa di-await)
class Builder {
  constructor(table) { this.table = table; this._single = false; }
  select() { return this; }
  eq() { return this; }
  in() { return this; }
  gte() { return this; }
  lt() { return this; }
  single() { this._single = true; return this; }
  then(resolve, reject) {
    try {
      let resp = RESULTS[this.table] || { data: [], error: null };
      if (this._single) resp = { data: (resp.data?.[0] ?? null), error: null };
      resolve(resp);
    } catch (e) { reject?.(e); }
  }
}

// Mock supabase (ESM way) — lakukan sebelum import SUT
await jest.unstable_mockModule('../config/supabase.js', () => ({
  __esModule: true,
  default: { from: (table) => new Builder(table) },
}));

// Import SUT SETELAH mock
const { fetchNeracaExpanded } = await import('../models/neraca_model.js');

describe('fetchNeracaExpanded (minimal)', () => {
  test('tanpa id_user & klaster_id → data kosong', async () => {
    const { data, error } = await fetchNeracaExpanded({});
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  test('dengan klaster_id → 1 baris hasil lengkap', async () => {
    const { data, error } = await fetchNeracaExpanded({ klaster_id: 'K1' });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      jenis: 'pemasukan',
      subtotal: 1000,
      produk_id: 10,
      produk_nama: 'Pupuk',
      kategori_id: 5,
      kategori_nama: 'Input',
      sub_kelompok: 'aset_lancar',
      neraca_identifier: 100,
    });
  });
});
