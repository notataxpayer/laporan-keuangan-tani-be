// src/models/neraca_model.test.js
import { jest } from '@jest/globals';

let __resp = {
  detaillaporanbarang: { data: [], error: null },
  produk: { data: [], error: null },
  kategorial: { data: [], error: null },
};

function __resetResp() {
  __resp = {
    detaillaporanbarang: { data: [], error: null },
    produk: { data: [], error: null },
    kategorial: { data: [], error: null },
  };
}
function __setResp(table, resp) {
  __resp[table] = resp;
}

class QB {
  constructor(table) { this.table = table; }
  select() { return this; }
  in() { return this; }
  gte() { return this; }
  lt()  { return this; }
  // Make it thenable so `await qb` works
  then(onFulfilled, onRejected) {
    const out = __resp[this.table] ?? { data: null, error: null };
    return Promise.resolve(out).then(onFulfilled, onRejected);
  }
}

jest.unstable_mockModule('../config/supabase.js', () => ({
  __setResp,
  __resetResp,
  default: {
    from: (table) => new QB(table),
  },
}));

// Import module under test AFTER mocks
const supabaseMock = await import('../config/supabase.js');
const { fetchNeracaExpanded } = await import('../models/neraca_model.js');

beforeEach(() => {
  jest.clearAllMocks();
  supabaseMock.__resetResp();
});

describe('fetchNeracaExpanded', () => {
  test('mengembalikan [] ketika langkah 1 (detail) data kosong', async () => {
    supabaseMock.__setResp('detaillaporanbarang', { data: [], error: null });
    const res = await fetchNeracaExpanded({ id_user: 'u-1' });
    expect(res).toEqual({ data: [], error: null });
  });

  test('return error jika langkah 1 (detail) error', async () => {
    supabaseMock.__setResp('detaillaporanbarang', { data: null, error: new Error('q1 err') });
    const res = await fetchNeracaExpanded({ id_user: 'u-1' });
    expect(res.error).toBeTruthy();
    expect(res.error.message).toBe('q1 err');
  });

  test('filter by id_user: hanya baris milik id_user yang diproses', async () => {
    // Step 1: dua baris, user berbeda
    supabaseMock.__setResp('detaillaporanbarang', {
      data: [
        { subtotal: 100, produk_id: 1, laporan: { id_user: 'u-1', jenis: 'pemasukan', created_at: '2025-01-01' } },
        { subtotal: 200, produk_id: 2, laporan: { id_user: 'u-x', jenis: 'pengeluaran', created_at: '2025-01-02' } },
      ],
      error: null,
    });
    // Step 2: produk untuk pid 1 saja (pid 2 harusnya tak diproses karena difilter)
    supabaseMock.__setResp('produk', {
      data: [{ produk_id: 1, nama: 'Produk A', kategori_id: 10 }],
      error: null,
    });
    // Step 3: kategori untuk kid 10
    supabaseMock.__setResp('kategorial', {
      data: [{ kategori_id: 10, nama: 'Kat A', sub_kelompok: 'aset_lancar', neraca_identifier: 123 }],
      error: null,
    });

    const res = await fetchNeracaExpanded({ id_user: 'u-1' });
    expect(res.error).toBeNull();
    expect(res.data).toEqual([
      {
        jenis: 'pemasukan',
        subtotal: 100,
        produk_id: 1,
        produk_nama: 'Produk A',
        kategori_id: 10,
        kategori_nama: 'Kat A',
        sub_kelompok: 'aset_lancar',
        neraca_identifier: 123,
      },
    ]);
  });

  test('return error jika langkah 2 (produk) error', async () => {
    supabaseMock.__setResp('detaillaporanbarang', {
      data: [{ subtotal: 50, produk_id: 7, laporan: { id_user: 'u-1', jenis: 'pemasukan' } }],
      error: null,
    });
    supabaseMock.__setResp('produk', { data: null, error: new Error('produk err') });
    const res = await fetchNeracaExpanded({ id_user: 'u-1' });
    expect(res.error).toBeTruthy();
    expect(res.error.message).toBe('produk err');
  });

  test('skip langkah 3 ketika semua kategori_id null; hasil pakai fallback null', async () => {
    supabaseMock.__setResp('detaillaporanbarang', {
      data: [
        { subtotal: 70, produk_id: 1, laporan: { id_user: 'u-1', jenis: 'pengeluaran' } },
      ],
      error: null,
    });
    supabaseMock.__setResp('produk', {
      data: [{ produk_id: 1, nama: 'Tanpa Kategori', kategori_id: null }],
      error: null,
    });
    // Tidak set resp 'kategorial' -> seharusnya tidak dipanggil (tetap aman)
    const res = await fetchNeracaExpanded({ id_user: 'u-1' });
    expect(res.error).toBeNull();
    expect(res.data).toEqual([
      {
        jenis: 'pengeluaran',
        subtotal: 70,
        produk_id: 1,
        produk_nama: 'Tanpa Kategori',
        kategori_id: null,
        kategori_nama: null,
        sub_kelompok: null,
        neraca_identifier: null,
      },
    ]);
  });

  test('return error jika langkah 3 (kategori) error', async () => {
    supabaseMock.__setResp('detaillaporanbarang', {
      data: [{ subtotal: 90, produk_id: 5, laporan: { id_user: 'u-1', jenis: 'pemasukan' } }],
      error: null,
    });
    supabaseMock.__setResp('produk', {
      data: [{ produk_id: 5, nama: 'Produk X', kategori_id: 99 }],
      error: null,
    });
    supabaseMock.__setResp('kategorial', { data: null, error: new Error('kategori err') });

    const res = await fetchNeracaExpanded({ id_user: 'u-1' });
    expect(res.error).toBeTruthy();
    expect(res.error.message).toBe('kategori err');
  });

  test('mapping lengkap: gabungkan produk & kategori; field null bila tidak ada di peta', async () => {
    supabaseMock.__setResp('detaillaporanbarang', {
      data: [
        { subtotal: 150, produk_id: 1, laporan: { id_user: 'u-1', jenis: 'pemasukan' } },
        { subtotal: 60,  produk_id: 2, laporan: { id_user: 'u-1', jenis: 'pengeluaran' } },
      ],
      error: null,
    });
    supabaseMock.__setResp('produk', {
      data: [
        { produk_id: 1, nama: 'P1', kategori_id: 10 },
        { produk_id: 2, nama: 'P2', kategori_id: 11 },
      ],
      error: null,
    });
    supabaseMock.__setResp('kategorial', {
      data: [
        { kategori_id: 10, nama: 'K10', sub_kelompok: 'aset_tetap', neraca_identifier: 2700 },
        // kategori 11 sengaja tidak ada → fallback null
      ],
      error: null,
    });

    const res = await fetchNeracaExpanded({ id_user: 'u-1' });
    expect(res.error).toBeNull();
    expect(res.data).toEqual([
      {
        jenis: 'pemasukan',
        subtotal: 150,
        produk_id: 1,
        produk_nama: 'P1',
        kategori_id: 10,
        kategori_nama: 'K10',
        sub_kelompok: 'aset_tetap',
        neraca_identifier: 2700,
      },
      {
        jenis: 'pengeluaran',
        subtotal: 60,
        produk_id: 2,
        produk_nama: 'P2',
        kategori_id: 11,
        kategori_nama: null,
        sub_kelompok: null,
        neraca_identifier: null,
      },
    ]);
  });

  test('tanpa id_user: tidak difilter, semua baris diproses', async () => {
    supabaseMock.__setResp('detaillaporanbarang', {
      data: [
        { subtotal: 10, produk_id: 3, laporan: { id_user: 'u-1', jenis: 'pemasukan' } },
        { subtotal: 20, produk_id: 4, laporan: { id_user: 'u-2', jenis: 'pengeluaran' } },
      ],
      error: null,
    });
    supabaseMock.__setResp('produk', {
      data: [
        { produk_id: 3, nama: 'P3', kategori_id: null },
        { produk_id: 4, nama: 'P4', kategori_id: null },
      ],
      error: null,
    });

    const res = await fetchNeracaExpanded({ /* id_user undefined */ });
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(2);
  });
});
