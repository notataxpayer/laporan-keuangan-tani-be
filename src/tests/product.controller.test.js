// src/tests/product.controller.test.js
import { jest } from '@jest/globals';

// ---- mock supabase config (jaga2 bila dipanggil di controller lain) ----
jest.unstable_mockModule('../config/supabase.js', () => ({
  default: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { klaster_id: null }, error: null }),
        }),
      }),
    }),
  },
}));

// ---- mock models sebelum import controller ----
const modelMocks = {
  createProduct: jest.fn(),
  listProducts: jest.fn(),
  getProductById: jest.fn(),
  updateProductById: jest.fn(),
  deleteProductById: jest.fn(),
};

jest.unstable_mockModule('../models/product_model.js', () => ({
  createProduct: modelMocks.createProduct,
  listProducts: modelMocks.listProducts,
  getProductById: modelMocks.getProductById,
  updateProductById: modelMocks.updateProductById,
  deleteProductById: modelMocks.deleteProductById,
}));

// import controller SETELAH mock siap
const controller = await import('../controllers/product_controller.js');

function createRes() {
  const res = {};
  res.statusCode = 200;
  res.headers = {};
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
}

describe('product.controller', () => {
  const user = { user_id: 'u-1', role: 'admin' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('create → 201 (sukses)', async () => {
    modelMocks.createProduct.mockResolvedValue({
      data: { produk_id: 1, nama: 'Beras Medium', kategori_id: 10, created_by: user.user_id },
      error: null,
    });

    const req = { body: { nama: 'Beras Medium', kategori_id: 10 }, user };
    const res = createRes();

    await controller.create(req, res);

    expect(res.statusCode).toBe(201);
    expect(modelMocks.createProduct).toHaveBeenCalled();
    expect(res.body.data).toMatchObject({ produk_id: 1, nama: 'Beras Medium' });
  });

  test('list → 200', async () => {
    modelMocks.listProducts.mockResolvedValue({
      data: [{ produk_id: 1, nama: 'Beras Medium', kategori_id: 10 }],
      error: null,
      count: 1,
    });

    const req = { query: { page: 1, limit: 10, search: '' } };
    const res = createRes();

    await controller.list(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(1);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('detail → 404 (tidak ditemukan)', async () => {
    modelMocks.getProductById.mockResolvedValue({ data: null, error: null });
    const req = { params: { id: '99' } };
    const res = createRes();

    await controller.detail(req, res);

    expect(res.statusCode).toBe(404);
  });

  test('update → 200 (sukses)', async () => {
    modelMocks.updateProductById.mockResolvedValue({
      data: { produk_id: 1, nama: 'Beras Super', kategori_id: 10 },
      error: null,
    });

    const req = { params: { id: '1' }, body: { nama: 'Beras Super' } };
    const res = createRes();

    await controller.update(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.nama).toBe('Beras Super');
  });

  test('remove → 200 (sukses)', async () => {
    modelMocks.getProductById.mockResolvedValue({
      data: { produk_id: 1, nama: 'Beras Medium' },
      error: null,
    });
    modelMocks.deleteProductById.mockResolvedValue({ error: null });

    const req = { params: { id: '1' } };
    const res = createRes();

    await controller.remove(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/dihapus/i);
  });
});
