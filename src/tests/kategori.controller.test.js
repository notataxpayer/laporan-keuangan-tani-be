// src/tests/kategori.controller.test.js
import { jest } from '@jest/globals';

// ---- MOCK SUPABASE (untuk getUserKlasterId di controller) ----
let mockUserKlasterId = null; 
const mockFrom = jest.fn((table) => {
  if (table === 'User') {
    const chain = {
      select: jest.fn(() => chain),
      eq: jest.fn(() => chain),
      single: jest.fn(async () => ({
        data: mockUserKlasterId !== undefined ? { klaster_id: mockUserKlasterId } : null,
        error: null,
      })),
    };
    return chain;
  }
  return {
    select: jest.fn(() => ({ eq: jest.fn(() => ({ single: jest.fn(async () => ({ data: null, error: null })) })) })),
  };
});

jest.unstable_mockModule('../config/supabase.js', () => ({
  default: { from: mockFrom },
}));

// ---- MOCK MODEL KATEGORI ----
const modelMocks = {
  createKategoriAuto: jest.fn(),
  listKategoriVisible: jest.fn(),
  getKategoriById: jest.fn(),
  deleteKategoriById: jest.fn(),
  countProdukByKategori: jest.fn(),
  countLapkeuanganByKategori: jest.fn(),
};

jest.unstable_mockModule('../models/kategori_model.js', () => ({
  createKategoriAuto: modelMocks.createKategoriAuto,
  listKategoriVisible: modelMocks.listKategoriVisible,
  getKategoriById: modelMocks.getKategoriById,
  deleteKategoriById: modelMocks.deleteKategoriById,
  countProdukByKategori: modelMocks.countProdukByKategori,
  countLapkeuanganByKategori: modelMocks.countLapkeuanganByKategori,
}));

// ---- IMPORT CONTROLLER SETELAH MOCK ----
const controller = await import('../controllers/kategori_controller.js');

// ---- Helper response minimal ----
function createRes() {
  const res = {};
  res.statusCode = 200;
  res.body = undefined;
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
}

describe('kategori.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserKlasterId = null; // default: user tanpa klaster
  });

  // 1) CREATE sukses
  test('create → 201 sukses (auto owner_user_id & owner_klaster_id)', async () => {
    mockUserKlasterId = 7; // user ini punya klaster 7
    modelMocks.createKategoriAuto.mockResolvedValue({
      data: {
        kategori_id: 42,
        nama: 'Beban Listrik',
        jenis: 'pengeluaran',
        klaster_id: 7,
        user_id: 'u-1',
        neraca_identifier: 4000,
      },
      error: null,
    });

    const req = {
      user: { user_id: 'u-1', role: 'user' },
      body: { nama: 'Beban Listrik', jenis: 'pengeluaran' },
    };
    const res = createRes();

    await controller.create(req, res);

    // pastikan supabase.from('User') dipanggil untuk ambil klaster_id
    expect(mockFrom).toHaveBeenCalledWith('User');
    // pastikan model dipanggil dengan owner yang benar
    expect(modelMocks.createKategoriAuto).toHaveBeenCalledWith({
      nama: 'Beban Listrik',
      jenis: 'pengeluaran',
      owner_user_id: 'u-1',
      owner_klaster_id: 7,
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.data).toMatchObject({ neraca_identifier: 4000, jenis: 'pengeluaran' });
  });

  // 2) CREATE validasi gagal
  test('create → 400 validasi gagal (tanpa nama)', async () => {
    const req = {
      user: { user_id: 'u-1', role: 'user' },
      body: { jenis: 'pemasukan' }, // nama hilang
    };
    const res = createRes();

    await controller.create(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Validasi gagal');
    expect(modelMocks.createKategoriAuto).not.toHaveBeenCalled();
  });

  // 3) LIST sukses
  test('list → 200 sukses (filter viewer_user_id & viewer_klaster_id)', async () => {
    mockUserKlasterId = null; // user tanpa klaster → filter by user_id saja
    modelMocks.listKategoriVisible.mockResolvedValue({
      data: [
        { kategori_id: 1, nama: 'Setoran Modal', jenis: 'pemasukan', user_id: 'u-1', klaster_id: null, neraca_identifier: 0 },
      ],
      error: null,
      count: 1,
    });

    const req = {
      user: { user_id: 'u-1', role: 'user' },
      query: { page: '1', limit: '10', search: 'modal' },
    };
    const res = createRes();

    await controller.list(req, res);

    expect(modelMocks.listKategoriVisible).toHaveBeenCalledWith({
      jenis: undefined,
      search: 'modal',
      page: 1,
      limit: 10,
      viewer_user_id: 'u-1',
      viewer_klaster_id: null, // karena mockUserKlasterId = null
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(1);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  // 4) DELETE → 403 forbidden (bukan owner & bukan satu klaster & bukan admin)
  test('remove → 403 forbidden (bukan pemilik)', async () => {
    // kategori milik user lain & klaster lain
    modelMocks.getKategoriById.mockResolvedValue({
      data: { kategori_id: 5, user_id: 'u-999', klaster_id: 99, nama: 'Hutang Bank', jenis: 'pengeluaran' },
      error: null,
    });
    mockUserKlasterId = 77; // klaster viewer: 77 (≠ 99)

    const req = {
      user: { user_id: 'u-1', role: 'user' },
      params: { id: '5' },
    };
    const res = createRes();

    await controller.remove(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toMatch(/Forbidden/);
    expect(modelMocks.countProdukByKategori).not.toHaveBeenCalled();
    expect(modelMocks.deleteKategoriById).not.toHaveBeenCalled();
  });

  // 5) DELETE → 200 sukses (admin, tidak ada referensi)
  test('remove → 200 sukses (admin)', async () => {
    modelMocks.getKategoriById.mockResolvedValue({
      data: { kategori_id: 8, user_id: 'someone', klaster_id: 7, nama: 'Beban Listrik', jenis: 'pengeluaran' },
      error: null,
    });
    modelMocks.countProdukByKategori.mockResolvedValue({ count: 0, error: null });
    modelMocks.countLapkeuanganByKategori.mockResolvedValue({ count: 0, error: null });
    modelMocks.deleteKategoriById.mockResolvedValue({ error: null });

    const req = {
      user: { user_id: 'u-admin', role: 'admin' }, // admin → allowed
      params: { id: '8' },
    };
    const res = createRes();

    await controller.remove(req, res);

    expect(modelMocks.countProdukByKategori).toHaveBeenCalledWith(8);
    expect(modelMocks.countLapkeuanganByKategori).toHaveBeenCalledWith(8);
    expect(modelMocks.deleteKategoriById).toHaveBeenCalledWith(8);
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Kategori dihapus');
  });
});
