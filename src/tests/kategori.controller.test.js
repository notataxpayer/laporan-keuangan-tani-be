// src/tests/kategori.controller.test.js
import { jest } from '@jest/globals';

// --- Mock model layer (ESM-safe) ---
await jest.unstable_mockModule('../models/kategori_model.js', () => ({
  __esModule: true,
  createKategoriAutoSmart: jest.fn().mockResolvedValue({ data: { kategori_id: 1 }, error: null }),
  listKategoriVisible:     jest.fn().mockResolvedValue({ data: [{ kategori_id: 1, nama: 'Contoh' }], error: null, count: 1 }),
  getKategoriById:         jest.fn().mockResolvedValue({ data: { kategori_id: 9, user_id: 'U-1' }, error: null }),
  deleteKategoriById:      jest.fn().mockResolvedValue({ error: null }),
  listKategoriByScope:     jest.fn().mockResolvedValue({ data: [{ kategori_id: 2 }], error: null, count: 1 }),
  nullifyProdukKategori:   jest.fn().mockResolvedValue({ data: [{ produk_id: 1 }, { produk_id: 2 }], error: null }),
}));

// --- Mock supabase (ESM-safe) ---
await jest.unstable_mockModule('../config/supabase.js', () => {
  const chain = (data) => ({
    select: jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data, error: null }),
  });
  const from = jest.fn((table) => {
    if (table === 'User') return chain({ klaster_id: 2 }); // user login punya klaster 2
    return chain(null);
  });
  return { __esModule: true, default: { from } };
});

// --- Import controller SETELAH semua mock terpasang ---
const { create, list, listByScope, remove } = await import('../controllers/kategori_controller.js');

// ---- Helpers req/res ----
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};
const mockReq = (over = {}) => ({
  body:   {},
  params: {},
  query:  {},
  user:   { user_id: 'U-1', role: 'user' },
  ...over,
});

// ---- Tests ----
describe('kategori_controller (ESM)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('create → 201', async () => {
    const req = mockReq({ body: { nama: 'Bibit Jagung', jenis: 'pemasukan' } });
    const res = mockRes();
    await create(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Kategori dibuat',
      data: expect.objectContaining({ kategori_id: 1 }),
    }));
  });

  test('list → 200', async () => {
    const req = mockReq({ query: { page: 1, limit: 10 } });
    const res = mockRes();
    await list(req, res);
    expect(res.json).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
      total: 1,
      data: [{ kategori_id: 1, nama: 'Contoh' }],
    });
  });

  test('listByScope → 400 jika tanpa user_id/klaster_id', async () => {
    const req = mockReq({ query: {} });
    const res = mockRes();
    await listByScope(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Wajib kirim user_id atau klaster_id',
    }));
  });

  test('listByScope (admin; user_id & klaster cocok) → 200', async () => {
    const req = mockReq({
      user:  { user_id: 'ADMIN', role: 'admin' },
      query: { user_id: 'U-X', klaster_id: '2', page: 1, limit: 5 },
    });
    const res = mockRes();
    await listByScope(req, res);
    expect(res.json).toHaveBeenCalledWith({
      page: 1,
      limit: 5,
      total: 1,
      data: [{ kategori_id: 2 }],
    });
  });

  test('remove (pemilik) → nullify produk & delete kategori', async () => {
    const req = mockReq({ params: { id: '9' } });
    const res = mockRes();
    await remove(req, res);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Kategori dihapus',
      affected_products_set_null: 2,
    });
  });
});
