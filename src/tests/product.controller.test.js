// src/tests/product.controller.test.js
import { jest } from '@jest/globals';

// ---- Mock models sebelum import controller ----
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

// import controller setelah mock di-setup
const controller = await import('../controllers/product_controller.js');

// ---- helper response sederhana ----
function createRes() {
  const res = {};
  res.statusCode = 200;
  res.body = undefined;
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
}

describe('product.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ----------------- CREATE -----------------
  describe('create', () => {
    test('201 → sukses membuat produk', async () => {
      modelMocks.createProduct.mockResolvedValue({
        data: { produk_id: 1, nama: 'Beras', harga: 12000, kategori_id: 7, created_by: 'u-1' },
        error: null,
      });
      const req = { body: { nama: 'Beras', harga: 12000, kategori_id: 7 }, user: { user_id: 'u-1' } };
      const res = createRes();

      await controller.create(req, res);

      expect(modelMocks.createProduct).toHaveBeenCalledWith({
        nama: 'Beras',
        harga: 12000,
        kategori_id: 7,
        created_by: 'u-1',
      });
      expect(res.statusCode).toBe(201);
      expect(res.body.message).toBe('Produk dibuat');
      expect(res.body.data).toMatchObject({ produk_id: 1 });
    });

    test('400 → validasi gagal (nama kosong & harga tidak angka)', async () => {
      const req = { body: { nama: '', harga: 'NaN' }, user: { user_id: 'u-1' } };
      const res = createRes();

      await controller.create(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe('Validasi gagal');
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(res.body.errors.length).toBeGreaterThanOrEqual(1);
    });

    test('500 → model error saat insert', async () => {
      modelMocks.createProduct.mockResolvedValue({ data: null, error: { message: 'db failed' } });
      const req = { body: { nama: 'Beras', harga: 12000 }, user: { user_id: 'u-1' } };
      const res = createRes();

      await controller.create(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ message: 'Gagal membuat produk', detail: 'db failed' });
    });
  });

  // ----------------- LIST -----------------
  describe('list', () => {
    test('200 → sukses list dengan paging & search', async () => {
      modelMocks.listProducts.mockResolvedValue({
        data: [{ produk_id: 1, nama: 'Beras', harga: 12000 }],
        error: null,
        count: 1,
      });
      const req = { query: { page: '2', limit: '5', search: 'beras' } };
      const res = createRes();

      await controller.list(req, res);

      expect(modelMocks.listProducts).toHaveBeenCalledWith({ page: 2, limit: 5, search: 'beras' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        page: 2,
        limit: 5,
        total: 1,
        data: [{ produk_id: 1, nama: 'Beras', harga: 12000 }],
      });
    });

    test('500 → model error saat list', async () => {
      modelMocks.listProducts.mockResolvedValue({ data: null, error: { message: 'db err' } });
      const req = { query: {} };
      const res = createRes();

      await controller.list(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ message: 'Gagal mengambil produk', detail: 'db err' });
    });
  });

  // ----------------- DETAIL -----------------
  describe('detail', () => {
    test('400 → id invalid', async () => {
      const req = { params: { id: 'abc' } };
      const res = createRes();

      await controller.detail(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ message: 'Param id tidak valid' });
    });

    test('404 → produk tidak ditemukan', async () => {
      modelMocks.getProductById.mockResolvedValue({ data: null, error: null });
      const req = { params: { id: '999' } };
      const res = createRes();

      await controller.detail(req, res);

      expect(modelMocks.getProductById).toHaveBeenCalledWith(999);
      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ message: 'Produk tidak ditemukan' });
    });

    test('200 → ditemukan', async () => {
      modelMocks.getProductById.mockResolvedValue({
        data: { produk_id: 2, nama: 'Pupuk', harga: 8000 },
        error: null,
      });
      const req = { params: { id: '2' } };
      const res = createRes();

      await controller.detail(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ data: { produk_id: 2, nama: 'Pupuk', harga: 8000 } });
    });
  });

  // ----------------- UPDATE -----------------
  describe('update', () => {
    test('400 → id invalid', async () => {
      const req = { params: { id: 'x' }, body: { harga: 13000 } };
      const res = createRes();

      await controller.update(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ message: 'Param id tidak valid' });
    });

    test('400 → tidak ada field yang diupdate', async () => {
      const req = { params: { id: '1' }, body: {} };
      const res = createRes();

      await controller.update(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ message: 'Tidak ada field yang diupdate' });
    });

    test('400 → harga bukan angka pada partial update', async () => {
      const req = { params: { id: '1' }, body: { harga: 'NaN' } };
      const res = createRes();

      await controller.update(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe('Validasi gagal');
      expect(Array.isArray(res.body.errors)).toBe(true);
    });

    test('400 → kategori_id bukan angka pada partial update', async () => {
      const req = { params: { id: '1' }, body: { kategori_id: 'abc' } };
      const res = createRes();

      await controller.update(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe('Validasi gagal');
      expect(res.body.errors.join(' ')).toMatch(/kategori_id harus berupa angka/);
    });

    test('200 → sukses update (nama & harga)', async () => {
      modelMocks.updateProductById.mockResolvedValue({
        data: { produk_id: 1, nama: 'Beras Premium', harga: 12500 },
        error: null,
      });
      const req = { params: { id: '1' }, body: { nama: 'Beras Premium', harga: 12500 } };
      const res = createRes();

      await controller.update(req, res);

      expect(modelMocks.updateProductById).toHaveBeenCalledWith(1, {
        nama: 'Beras Premium',
        harga: 12500,
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        message: 'Produk diupdate',
        data: { produk_id: 1, nama: 'Beras Premium', harga: 12500 },
      });
    });

    test('200 → sukses update hanya kategori_id null', async () => {
      modelMocks.updateProductById.mockResolvedValue({
        data: { produk_id: 5, nama: 'Gula', harga: 9000, kategori_id: null },
        error: null,
      });
      const req = { params: { id: '5' }, body: { kategori_id: null } };
      const res = createRes();

      await controller.update(req, res);

      expect(modelMocks.updateProductById).toHaveBeenCalledWith(5, { kategori_id: null });
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe('Produk diupdate');
    });

    test('500 → model error saat update', async () => {
      modelMocks.updateProductById.mockResolvedValue({ data: null, error: { message: 'db err' } });
      const req = { params: { id: '1' }, body: { harga: 13000 } };
      const res = createRes();

      await controller.update(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ message: 'Gagal update produk', detail: 'db err' });
    });
  });

  // ----------------- REMOVE -----------------
  describe('remove', () => {
    test('400 → id invalid', async () => {
      const req = { params: { id: 'NaN' } };
      const res = createRes();

      await controller.remove(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ message: 'Param id tidak valid' });
    });

    test('404 → produk tidak ditemukan', async () => {
      modelMocks.getProductById.mockResolvedValue({ data: null, error: null });
      const req = { params: { id: '5' } };
      const res = createRes();

      await controller.remove(req, res);

      expect(modelMocks.getProductById).toHaveBeenCalledWith(5);
      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ message: 'Produk tidak ditemukan' });
    });

    test('500 → gagal delete di model', async () => {
      modelMocks.getProductById.mockResolvedValue({ data: { produk_id: 7 }, error: null });
      modelMocks.deleteProductById.mockResolvedValue({ error: { message: 'db delete err' } });
      const req = { params: { id: '7' } };
      const res = createRes();

      await controller.remove(req, res);

      expect(modelMocks.deleteProductById).toHaveBeenCalledWith(7);
      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ message: 'Gagal hapus produk', detail: 'db delete err' });
    });

    test('200 → sukses delete', async () => {
      modelMocks.getProductById.mockResolvedValue({ data: { produk_id: 3 }, error: null });
      modelMocks.deleteProductById.mockResolvedValue({ error: null });
      const req = { params: { id: '3' } };
      const res = createRes();

      await controller.remove(req, res);

      expect(modelMocks.deleteProductById).toHaveBeenCalledWith(3);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ message: 'Produk dihapus' });
    });
  });
});
