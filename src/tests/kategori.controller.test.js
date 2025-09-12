// src/controllers/kategori.controller.test.js
import { jest } from '@jest/globals';

// ---------- Mock Supabase (untuk getUserKlasterId) ----------
let __mockKlasterId = null;
let __mockUserErr = null;

jest.unstable_mockModule('../config/supabase.js', () => ({
  __setKlasterId: (v) => { __mockKlasterId = v; },
  __setUserErr: (e) => { __mockUserErr = e; },
  default: {
    from: (table) => ({
      select: () => ({
        eq: () => ({
          single: async () => (__mockUserErr
            ? { data: null, error: __mockUserErr }
            : { data: { klaster_id: __mockKlasterId }, error: null }),
        }),
      }),
    }),
  },
}));

// ---------- Mock Model Functions ----------
const modelFns = {
  createKategoriAutoSmart: jest.fn(),
  listKategoriVisible: jest.fn(),
  getKategoriById: jest.fn(),
  deleteKategoriById: jest.fn(),
  countProdukByKategori: jest.fn(),
  countLapkeuanganByKategori: jest.fn(),
};

jest.unstable_mockModule('../models/kategori_model.js', () => ({
  createKategoriAutoSmart: modelFns.createKategoriAutoSmart,
  listKategoriVisible: modelFns.listKategoriVisible,
  getKategoriById: modelFns.getKategoriById,
  deleteKategoriById: modelFns.deleteKategoriById,
  countProdukByKategori: modelFns.countProdukByKategori,
  countLapkeuanganByKategori: modelFns.countLapkeuanganByKategori,
  listKategoriByScope: modelFns.listKategoriByScope,
}));

// Setelah mock siap, baru import controller-nya
const { create, list, remove } = await import('../controllers/kategori_controller.js');
const supabaseMock = await import('../config/supabase.js');

// ---------- Helper response/request ----------
function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}
function makeReq({
  body = undefined,
  query = undefined,
  params = undefined,
  user = { user_id: 'u-1', role: 'user' },
} = {}) {
  return { body, query, params, user };
}

beforeEach(() => {
  jest.clearAllMocks();
  supabaseMock.__setKlasterId(null);
  supabaseMock.__setUserErr(null);
});

// ================= CREATE =================
describe('POST /api/kategori - create', () => {
  test('400 jika validasi gagal (nama kosong / jenis tidak valid)', async () => {
    const res = makeRes();

    // kasus 1: nama kosong
    let req = makeReq({ body: { nama: '', jenis: 'pemasukan' } });
    await create(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].errors).toBeTruthy();

    // kasus 2: jenis invalid
    const res2 = makeRes();
    req = makeReq({ body: { nama: 'Kategori A', jenis: 'salah' } });
    await create(req, res2);
    expect(res2.status).toHaveBeenCalledWith(400);
    expect(res2.json.mock.calls[0][0].errors).toBeTruthy();
  });

  test('500 jika model createKategoriAutoSmart error', async () => {
    const res = makeRes();
    const req = makeReq({ body: { nama: 'Operasional', jenis: 'pengeluaran' } });

    supabaseMock.__setKlasterId(10);
    modelFns.createKategoriAutoSmart.mockResolvedValue({
      data: null,
      error: new Error('db fail'),
    });

    await create(req, res);
    expect(modelFns.createKategoriAutoSmart).toHaveBeenCalledWith({
      nama: 'Operasional',
      jenis: 'pengeluaran',
      owner_user_id: 'u-1',
      owner_klaster_id: 10,
    });
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Gagal membuat kategori' }),
    );
  });

  test('201 saat sukses, membawa data hasil insert', async () => {
    const res = makeRes();
    const req = makeReq({ body: { nama: 'Penjualan', jenis: 'pemasukan' } });

    supabaseMock.__setKlasterId(null); // klaster null (user personal)
    modelFns.createKategoriAutoSmart.mockResolvedValue({
      data: { id: 123, nama: 'Penjualan', jenis: 'pemasukan' },
      error: null,
    });

    await create(req, res);
    expect(modelFns.createKategoriAutoSmart).toHaveBeenCalledWith({
      nama: 'Penjualan',
      jenis: 'pemasukan',
      owner_user_id: 'u-1',
      owner_klaster_id: null,
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Kategori dibuat',
      data: { id: 123, nama: 'Penjualan', jenis: 'pemasukan' },
    });
  });
});

// ================= LIST =================
describe('GET /api/kategori - list', () => {
  test('200 saat sukses, kembalikan page/limit/total/data', async () => {
    const res = makeRes();
    const req = makeReq({
      query: { page: '2', limit: '5', search: 'ope', jenis: 'pengeluaran' },
    });

    supabaseMock.__setKlasterId(7);
    modelFns.listKategoriVisible.mockResolvedValue({
      data: [{ id: 1 }, { id: 2 }],
      count: 10,
      error: null,
    });

    await list(req, res);
    expect(modelFns.listKategoriVisible).toHaveBeenCalledWith({
      jenis: 'pengeluaran',
      search: 'ope',
      page: 2,
      limit: 5,
      viewer_user_id: 'u-1',
      viewer_klaster_id: 7,
    });
    expect(res.json).toHaveBeenCalledWith({
      page: 2,
      limit: 5,
      total: 10,
      data: [{ id: 1 }, { id: 2 }],
    });
  });

  test('total fallback ke data.length jika count null', async () => {
    const res = makeRes();
    const req = makeReq({ query: {} });

    supabaseMock.__setKlasterId(null);
    modelFns.listKategoriVisible.mockResolvedValue({
      data: [{ id: 1 }, { id: 2 }, { id: 3 }],
      count: null,
      error: null,
    });

    await list(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ total: 3 }),
    );
  });

  test('500 jika listKategoriVisible error', async () => {
    const res = makeRes();
    const req = makeReq({ query: {} });

    modelFns.listKategoriVisible.mockResolvedValue({
      data: null,
      count: null,
      error: new Error('boom'),
    });

    await list(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Gagal mengambil kategori' }),
    );
  });
});

// ================= REMOVE =================
describe('DELETE /api/kategori/:id - remove', () => {
  test('400 jika param id invalid', async () => {
    const res = makeRes();
    const req = makeReq({ params: { id: 'abc' } });
    await remove(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('404 jika kategori tidak ditemukan (error atau data null)', async () => {
    const res = makeRes();
    const req = makeReq({ params: { id: '10' } });

    modelFns.getKategoriById.mockResolvedValue({ data: null, error: null });
    await remove(req, res);
    expect(res.status).toHaveBeenCalledWith(404);

    const res2 = makeRes();
    modelFns.getKategoriById.mockResolvedValue({ data: null, error: new Error('x') });
    await remove(makeReq({ params: { id: '10' } }), res2);
    expect(res2.status).toHaveBeenCalledWith(404);
  });

  test('403 jika bukan pemilik (bukan admin, user_id/klaster tidak cocok)', async () => {
    const res = makeRes();
    const req = makeReq({ params: { id: '9' }, user: { user_id: 'u-1', role: 'user' } });

    // kategori milik user lain dan klaster lain
    modelFns.getKategoriById.mockResolvedValue({
      data: { id: 9, user_id: 'u-999', klaster_id: 99 },
      error: null,
    });
    supabaseMock.__setKlasterId(7); // viewer klaster 7 ≠ 99

    await remove(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('boleh jika admin walaupun bukan owner', async () => {
    const res = makeRes();
    const req = makeReq({
      params: { id: '9' },
      user: { user_id: 'u-1', role: 'admin' },
    });

    modelFns.getKategoriById.mockResolvedValue({
      data: { id: 9, user_id: 'u-999', klaster_id: 99 },
      error: null,
    });
    // next checks for refs:
    modelFns.countProdukByKategori.mockResolvedValue({ count: 0, error: null });
    modelFns.countLapkeuanganByKategori.mockResolvedValue({ count: 0, error: null });
    modelFns.deleteKategoriById.mockResolvedValue({ error: null });

    await remove(req, res);
    expect(res.json).toHaveBeenCalledWith({ message: 'Kategori dihapus' });
  });

  test('409 jika terpakai di produk', async () => {
    const res = makeRes();
    const req = makeReq({ params: { id: '5' }, user: { user_id: 'u-1', role: 'user' } });

    // kategori milik user
    modelFns.getKategoriById.mockResolvedValue({
      data: { id: 5, user_id: 'u-1', klaster_id: null },
      error: null,
    });

    modelFns.countProdukByKategori.mockResolvedValue({ count: 2, error: null });

    await remove(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Kategori dipakai oleh produk—tidak bisa dihapus' }),
    );
  });

  test('409 jika terpakai di laporan keuangan', async () => {
    const res = makeRes();
    const req = makeReq({ params: { id: '6' }, user: { user_id: 'u-1', role: 'user' } });

    modelFns.getKategoriById.mockResolvedValue({
      data: { id: 6, user_id: 'u-1', klaster_id: null },
      error: null,
    });

    modelFns.countProdukByKategori.mockResolvedValue({ count: 0, error: null });
    modelFns.countLapkeuanganByKategori.mockResolvedValue({ count: 1, error: null });

    await remove(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Kategori dipakai di laporan keuangan—tidak bisa dihapus' }),
    );
  });

  test('500 jika gagal cek referensi (produk / laporan)', async () => {
    // produk error
    const res = makeRes();
    modelFns.getKategoriById.mockResolvedValue({
      data: { id: 7, user_id: 'u-1', klaster_id: null },
      error: null,
    });
    modelFns.countProdukByKategori.mockResolvedValue({ count: null, error: new Error('prod err') });

    await remove(makeReq({ params: { id: '7' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);

    // laporan error
    const res2 = makeRes();
    modelFns.getKategoriById.mockResolvedValue({
      data: { id: 8, user_id: 'u-1', klaster_id: null },
      error: null,
    });
    modelFns.countProdukByKategori.mockResolvedValue({ count: 0, error: null });
    modelFns.countLapkeuanganByKategori.mockResolvedValue({ count: null, error: new Error('lap err') });

    await remove(makeReq({ params: { id: '8' } }), res2);
    expect(res2.status).toHaveBeenCalledWith(500);
  });

  test('500 jika gagal delete', async () => {
    const res = makeRes();
    const req = makeReq({ params: { id: '11' }, user: { user_id: 'u-1', role: 'user' } });

    modelFns.getKategoriById.mockResolvedValue({
      data: { id: 11, user_id: 'u-1', klaster_id: null },
      error: null,
    });
    modelFns.countProdukByKategori.mockResolvedValue({ count: 0, error: null });
    modelFns.countLapkeuanganByKategori.mockResolvedValue({ count: 0, error: null });
    modelFns.deleteKategoriById.mockResolvedValue({ error: new Error('del fail') });

    await remove(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Gagal hapus kategori' }),
    );
  });

  test('200 jika sukses delete', async () => {
    const res = makeRes();
    const req = makeReq({ params: { id: '12' }, user: { user_id: 'u-1', role: 'user' } });

    modelFns.getKategoriById.mockResolvedValue({
      data: { id: 12, user_id: 'u-1', klaster_id: null },
      error: null,
    });
    modelFns.countProdukByKategori.mockResolvedValue({ count: 0, error: null });
    modelFns.countLapkeuanganByKategori.mockResolvedValue({ count: 0, error: null });
    modelFns.deleteKategoriById.mockResolvedValue({ error: null });

    await remove(req, res);
    expect(res.json).toHaveBeenCalledWith({ message: 'Kategori dihapus' });
  });
});
