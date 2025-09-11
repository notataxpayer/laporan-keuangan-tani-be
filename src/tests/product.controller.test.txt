// src/controllers/product.controller.test.js
import { jest } from '@jest/globals';

// ---- mock product_model ----
const pm = {
  createProduct: jest.fn(),
  listProducts: jest.fn(),
  getProductById: jest.fn(),
  updateProductById: jest.fn(),
  deleteProductById: jest.fn(),
};
jest.unstable_mockModule('../models/product_model.js', () => ({
  createProduct: pm.createProduct,
  listProducts: pm.listProducts,
  getProductById: pm.getProductById,
  updateProductById: pm.updateProductById,
  deleteProductById: pm.deleteProductById,
}));

// ---- mock kategori_model ----
const km = {
  findKategoriByNameScoped: jest.fn(),
  createKategoriAutoSmart: jest.fn(),
};
jest.unstable_mockModule('../models/kategori_model.js', () => ({
  findKategoriByNameScoped: km.findKategoriByNameScoped,
  createKategoriAutoSmart: km.createKategoriAutoSmart,
}));

// ---- import setelah mock ----
const controller = await import('../controllers/product_controller.js');

// ---- helper buat req/res ----
function mkRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}
const mkReq = (over = {}) => ({
  user: { user_id: 'u-1', klaster_id: null },
  body: {},
  params: {},
  query: {},
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ======================= CREATE =======================

test('create: sukses dengan kategori_id langsung', async () => {
  const req = mkReq({ body: { nama: 'Pupuk Urea', kategori_id: 5 } });
  const res = mkRes();

  pm.createProduct.mockResolvedValue({ data: { produk_id: 1 }, error: null });

  await controller.create(req, res);

  expect(pm.createProduct).toHaveBeenCalledWith({
    nama: 'Pupuk Urea',
    kategori_id: 5,
    created_by: 'u-1',
  });
  expect(res.status).toHaveBeenCalledWith(201);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Produk dibuat',
    data: { produk_id: 1 },
  }));
});

test('create: tanpa kategori_id → pakai kategori_nama → kategori sudah ada', async () => {
  const req = mkReq({ body: { nama: 'Panen Kentang', kategori_nama: 'Persediaan Panen' } });
  const res = mkRes();

  km.findKategoriByNameScoped.mockResolvedValue({ data: { kategori_id: 77 }, error: null });
  pm.createProduct.mockResolvedValue({ data: { produk_id: 10 }, error: null });

  await controller.create(req, res);

  expect(km.findKategoriByNameScoped).toHaveBeenCalledWith({
    nama: 'Persediaan Panen',
    owner_user_id: 'u-1',
    owner_klaster_id: null,
  });
  expect(km.createKategoriAutoSmart).not.toHaveBeenCalled();
  expect(pm.createProduct).toHaveBeenCalledWith({
    nama: 'Panen Kentang',
    kategori_id: 77,
    created_by: 'u-1',
  });
  expect(res.status).toHaveBeenCalledWith(201);
});

test('create: tanpa kategori_id → kategori_nama tidak ada → auto-create kategori', async () => {
  const req = mkReq({ body: { nama: 'Cicilan Traktor', kategori_nama: 'Utang Investasi Alat' } });
  const res = mkRes();

  km.findKategoriByNameScoped.mockResolvedValue({ data: null, error: null });
  km.createKategoriAutoSmart.mockResolvedValue({ data: { kategori_id: 4501 }, error: null });
  pm.createProduct.mockResolvedValue({ data: { produk_id: 22 }, error: null });

  await controller.create(req, res);

  expect(km.findKategoriByNameScoped).toHaveBeenCalled();
  expect(km.createKategoriAutoSmart).toHaveBeenCalledWith({
    nama: 'Utang Investasi Alat',
    produk_nama: 'Cicilan Traktor',
    owner_user_id: 'u-1',
    owner_klaster_id: null,
  });
  expect(pm.createProduct).toHaveBeenCalledWith({
    nama: 'Cicilan Traktor',
    kategori_id: 4501,
    created_by: 'u-1',
  });
  expect(res.status).toHaveBeenCalledWith(201);
});

test('create: validasi gagal (nama kosong)', async () => {
  const req = mkReq({ body: { nama: '   ' } });
  const res = mkRes();

  await controller.create(req, res);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Validasi gagal',
    errors: expect.arrayContaining(['nama wajib diisi']),
  }));
  expect(pm.createProduct).not.toHaveBeenCalled();
});

test('create: error saat find kategori', async () => {
  const req = mkReq({ body: { nama: 'Panen Kentang' } });
  const res = mkRes();

  km.findKategoriByNameScoped.mockResolvedValue({ data: null, error: { message: 'db down' } });

  await controller.create(req, res);

  expect(res.status).toHaveBeenCalledWith(500);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Gagal mencari kategori',
  }));
});

test('create: error saat auto-create kategori', async () => {
  const req = mkReq({ body: { nama: 'Utang Dagang Pupuk', kategori_nama: 'Utang Dagang Supplier' } });
  const res = mkRes();

  km.findKategoriByNameScoped.mockResolvedValue({ data: null, error: null });
  km.createKategoriAutoSmart.mockResolvedValue({ data: null, error: { message: 'range penuh' } });

  await controller.create(req, res);

  expect(res.status).toHaveBeenCalledWith(500);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Gagal membuat kategori otomatis',
  }));
});

// ======================= LIST =======================

test('list: sukses', async () => {
  const req = mkReq({ query: { page: '2', limit: '5', search: 'kentang' } });
  const res = mkRes();

  pm.listProducts.mockResolvedValue({ data: [{ produk_id: 1 }], error: null, count: 11 });

  await controller.list(req, res);

  expect(pm.listProducts).toHaveBeenCalledWith({ page: 2, limit: 5, search: 'kentang' });
  expect(res.json).toHaveBeenCalledWith({
    page: 2,
    limit: 5,
    total: 11,
    data: [{ produk_id: 1 }],
  });
});

test('list: error dari model', async () => {
  const req = mkReq({ query: {} });
  const res = mkRes();

  pm.listProducts.mockResolvedValue({ data: null, error: { message: 'db err' }, count: null });

  await controller.list(req, res);

  expect(res.status).toHaveBeenCalledWith(500);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Gagal mengambil produk',
  }));
});

// ======================= DETAIL =======================

test('detail: id invalid', async () => {
  const req = mkReq({ params: { id: 'abc' } });
  const res = mkRes();

  await controller.detail(req, res);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ message: 'Param id tidak valid' });
});

test('detail: not found', async () => {
  const req = mkReq({ params: { id: '9' } });
  const res = mkRes();

  pm.getProductById.mockResolvedValue({ data: null, error: null });

  await controller.detail(req, res);

  expect(res.status).toHaveBeenCalledWith(404);
  expect(res.json).toHaveBeenCalledWith({ message: 'Produk tidak ditemukan' });
});

test('detail: success', async () => {
  const req = mkReq({ params: { id: '9' } });
  const res = mkRes();

  pm.getProductById.mockResolvedValue({ data: { produk_id: 9, nama: 'X' }, error: null });

  await controller.detail(req, res);

  expect(res.json).toHaveBeenCalledWith({ data: { produk_id: 9, nama: 'X' } });
});

// ======================= UPDATE =======================

test('update: id invalid', async () => {
  const req = mkReq({ params: { id: 'bad' }, body: { nama: 'A' } });
  const res = mkRes();

  await controller.update(req, res);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ message: 'Param id tidak valid' });
});

test('update: payload kosong → tidak ada field yang diupdate', async () => {
  const req = mkReq({ params: { id: '3' }, body: {} });
  const res = mkRes();

  await controller.update(req, res);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ message: 'Tidak ada field yang diupdate' });
});


test('update: set kategori via kategori_id langsung', async () => {
  const req = mkReq({ params: { id: '3' }, body: { kategori_id: 88 } });
  const res = mkRes();

  pm.updateProductById.mockResolvedValue({ data: { produk_id: 3, kategori_id: 88 }, error: null });

  await controller.update(req, res);

  expect(pm.updateProductById).toHaveBeenCalledWith(3, { kategori_id: 88 });
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Produk diupdate',
  }));
});

test('update: set kategori via kategori_nama (existing) ', async () => {
  const req = mkReq({ params: { id: '3' }, body: { kategori_nama: 'Lahan Sawah' } });
  const res = mkRes();

  km.findKategoriByNameScoped.mockResolvedValue({ data: { kategori_id: 1500 }, error: null });
  pm.updateProductById.mockResolvedValue({ data: { produk_id: 3, kategori_id: 1500 }, error: null });

  await controller.update(req, res);

  expect(km.findKategoriByNameScoped).toHaveBeenCalledWith({
    nama: 'Lahan Sawah',
    owner_user_id: 'u-1',
    owner_klaster_id: null,
  });
  expect(km.createKategoriAutoSmart).not.toHaveBeenCalled();
  expect(pm.updateProductById).toHaveBeenCalledWith(3, { kategori_id: 1500 });
});

test('update: set kategori via kategori_nama (auto-create)', async () => {
  const req = mkReq({ params: { id: '3' }, body: { kategori_nama: 'Utang Dagang Supplier' } });
  const res = mkRes();

  km.findKategoriByNameScoped.mockResolvedValue({ data: null, error: null });
  // controller butuh nama produk saat inference kalau payload.nama tidak ada → dia fallback ke getProductById
  pm.getProductById.mockResolvedValue({ data: { produk_id: 3, nama: 'Utang Dagang Pupuk' }, error: null });
  km.createKategoriAutoSmart.mockResolvedValue({ data: { kategori_id: 4100 }, error: null });
  pm.updateProductById.mockResolvedValue({ data: { produk_id: 3, kategori_id: 4100 }, error: null });

  await controller.update(req, res);

  expect(km.createKategoriAutoSmart).toHaveBeenCalledWith({
    nama: 'Utang Dagang Supplier',
    produk_nama: 'Utang Dagang Pupuk',
    owner_user_id: 'u-1',
    owner_klaster_id: null,
  });
  expect(pm.updateProductById).toHaveBeenCalledWith(3, { kategori_id: 4100 });
});

// ======================= REMOVE =======================

test('remove: not found', async () => {
  const req = mkReq({ params: { id: '77' } });
  const res = mkRes();

  pm.getProductById.mockResolvedValue({ data: null, error: null });

  await controller.remove(req, res);

  expect(res.status).toHaveBeenCalledWith(404);
  expect(res.json).toHaveBeenCalledWith({ message: 'Produk tidak ditemukan' });
});

test('remove: success', async () => {
  const req = mkReq({ params: { id: '77' } });
  const res = mkRes();

  pm.getProductById.mockResolvedValue({ data: { produk_id: 77 }, error: null });
  pm.deleteProductById.mockResolvedValue({ error: null });

  await controller.remove(req, res);

  expect(pm.deleteProductById).toHaveBeenCalledWith(77);
  expect(res.json).toHaveBeenCalledWith({ message: 'Produk dihapus' });
});
