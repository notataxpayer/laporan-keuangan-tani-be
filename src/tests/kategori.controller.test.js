// src/tests/kategori.controller.test.js
import { jest } from '@jest/globals';

// ---- mock supabase untuk ambil klaster user ----
const supabaseFromMock = jest.fn();
jest.unstable_mockModule('../config/supabase.js', () => ({
  default: {
    from: supabaseFromMock.mockImplementation((table) => {
      if (table === 'User') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { klaster_id: null }, error: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: null, error: null }) }),
        }),
      };
    }),
  },
}));

// ---- mock models ----
const model = {
  createKategoriAuto: jest.fn(),
  listKategoriVisible: jest.fn(),
  getKategoriById: jest.fn(),
  deleteKategoriById: jest.fn(),
  countProdukByKategori: jest.fn(),
  countLapkeuanganByKategori: jest.fn(),
};

jest.unstable_mockModule('../models/kategori_model.js', () => ({
  createKategoriAuto: model.createKategoriAuto,
  listKategoriVisible: model.listKategoriVisible,
  getKategoriById: model.getKategoriById,
  deleteKategoriById: model.deleteKategoriById,
  countProdukByKategori: model.countProdukByKategori,
  countLapkeuanganByKategori: model.countLapkeuanganByKategori,
}));

const controller = await import('../controllers/kategori_controller.js');

function resMock() {
  const res = {};
  res.statusCode = 200;
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
}

describe('kategori.controller', () => {
  const user = { user_id: 'u-1', role: 'user' };

  beforeEach(() => jest.clearAllMocks());

  test('create → 201', async () => {
    model.createKategoriAuto.mockResolvedValue({
      data: { kategori_id: 7, nama: 'Penjualan', jenis: 'pemasukan', neraca_identifier: 0 },
      error: null,
    });

    const req = { user, body: { nama: 'Penjualan', jenis: 'pemasukan' } };
    const res = resMock();

    await controller.create(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.data).toMatchObject({ kategori_id: 7 });
  });

  test('list → 200', async () => {
    model.listKategoriVisible.mockResolvedValue({
      data: [
        { kategori_id: 7, nama: 'Penjualan', jenis: 'pemasukan', neraca_identifier: 0 },
      ],
      error: null,
      count: 1,
    });

    const req = { user, query: { page: 1, limit: 20, search: '' } };
    const res = resMock();

    await controller.list(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(1);
  });

  test('remove → 200 (owner)', async () => {
    model.getKategoriById.mockResolvedValue({
      data: { kategori_id: 7, nama: 'Biaya Solar', jenis: 'pengeluaran', user_id: 'u-1', klaster_id: null },
      error: null,
    });
    model.countProdukByKategori.mockResolvedValue({ count: 0, error: null });
    model.countLapkeuanganByKategori.mockResolvedValue({ count: 0, error: null });
    model.deleteKategoriById.mockResolvedValue({ error: null });

    const req = { user, params: { id: '7' } };
    const res = resMock();

    await controller.remove(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/dihapus/i);
  });
});
