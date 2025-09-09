// src/controllers/kategori.controller.test.js
import { jest } from '@jest/globals';

// ================= MOCK: supabase (untuk getUserKlasterId) =================
const supabaseMock = {
  from: jest.fn(),
};
function mockSelectKlasterId(klaster_id = null) {
  supabaseMock.from.mockReturnValue({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: { klaster_id }, error: null }),
      }),
    }),
  });
}
jest.unstable_mockModule('../config/supabase.js', () => ({ default: supabaseMock }));

// ================= MOCK: kategori_model functions =================
const km = {
  createKategoriAuto: jest.fn(),
  listKategoriVisible: jest.fn(),
  getKategoriById: jest.fn(),
  deleteKategoriById: jest.fn(),
  countProdukByKategori: jest.fn(),
  countLapkeuanganByKategori: jest.fn(),
};
jest.unstable_mockModule('../models/kategori_model.js', () => ({
  createKategoriAuto: km.createKategoriAuto,
  listKategoriVisible: km.listKategoriVisible,
  getKategoriById: km.getKategoriById,
  deleteKategoriById: km.deleteKategoriById,
  countProdukByKategori: km.countProdukByKategori,
  countLapkeuanganByKategori: km.countLapkeuanganByKategori,
}));

// ================= IMPORT controller setelah mock =================
const controller = await import('../controllers/kategori_controller.js');

// =============== helpers req/res =================
function mkRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
const mkReq = (over = {}) => ({
  user: { user_id: 'u-1', role: 'user' }, // default user biasa
  body: {},
  params: {},
  query: {},
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ======================= CREATE =======================

test('create: validasi gagal (tanpa nama)', async () => {
  mockSelectKlasterId(null);
  const req = mkReq({ body: { jenis: 'pemasukan' } });
  const res = mkRes();

  await controller.create(req, res);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Validasi gagal',
    errors: expect.arrayContaining(['nama wajib diisi']),
  }));
  expect(km.createKategoriAuto).not.toHaveBeenCalled();
});

test('create: validasi gagal (jenis tidak diizinkan)', async () => {
  mockSelectKlasterId(null);
  const req = mkReq({ body: { nama: 'Kas', jenis: 'random' } });
  const res = mkRes();

  await controller.create(req, res);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json.mock.calls[0][0].errors[0]).toMatch(/jenis wajib salah satu/);
});

test('create: sukses (jenis pemasukan), bawa klaster_id dari DB', async () => {
  mockSelectKlasterId(11);
  km.createKategoriAuto.mockResolvedValue({
    data: { kategori_id: 1, nama: 'Kas', neraca_identifier: 10 },
    error: null,
  });

  const req = mkReq({ body: { nama: 'Kas', jenis: 'pemasukan' } });
  const res = mkRes();

  await controller.create(req, res);

  expect(supabaseMock.from).toHaveBeenCalledWith('User'); // getUserKlasterId dipanggil
  expect(km.createKategoriAuto).toHaveBeenCalledWith({
    nama: 'Kas',
    jenis: 'pemasukan',
    owner_user_id: 'u-1',
    owner_klaster_id: 11,
  });
  expect(res.status).toHaveBeenCalledWith(201);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Kategori dibuat',
    data: expect.objectContaining({ kategori_id: 1 }),
  }));
});

test('create: error dari createKategoriAuto', async () => {
  mockSelectKlasterId(null);
  km.createKategoriAuto.mockResolvedValue({
    data: null,
    error: { message: 'range penuh' },
  });

  const req = mkReq({ body: { nama: 'Utang Dagang', jenis: 'pengeluaran' } });
  const res = mkRes();

  await controller.create(req, res);

  expect(res.status).toHaveBeenCalledWith(500);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Gagal membuat kategori',
    detail: 'range penuh',
  }));
});

// ======================= LIST =======================

test('list: sukses (dengan jenis & search)', async () => {
  mockSelectKlasterId(11);
  km.listKategoriVisible.mockResolvedValue({
    data: [{ kategori_id: 1 }],
    count: 7,
    error: null,
  });

  const req = mkReq({ query: { page: '2', limit: '5', search: 'kas', jenis: 'pemasukan' } });
  const res = mkRes();

  await controller.list(req, res);

  expect(km.listKategoriVisible).toHaveBeenCalledWith({
    jenis: 'pemasukan',
    search: 'kas',
    page: 2,
    limit: 5,
    viewer_user_id: 'u-1',
    viewer_klaster_id: 11,
  });
  expect(res.json).toHaveBeenCalledWith({
    page: 2,
    limit: 5,
    total: 7,
    data: [{ kategori_id: 1 }],
  });
});

test('list: error dari model', async () => {
  mockSelectKlasterId(11);
  km.listKategoriVisible.mockResolvedValue({ data: null, count: null, error: { message: 'db err' } });

  const req = mkReq({ query: {} });
  const res = mkRes();

  await controller.list(req, res);

  expect(res.status).toHaveBeenCalledWith(500);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Gagal mengambil kategori',
  }));
});

// ======================= REMOVE =======================

test('remove: id invalid', async () => {
  const req = mkReq({ params: { id: 'abc' } });
  const res = mkRes();

  await controller.remove(req, res);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ message: 'Param id tidak valid' });
});

test('remove: not found', async () => {
  km.getKategoriById.mockResolvedValue({ data: null, error: null });

  const req = mkReq({ params: { id: '9' } });
  const res = mkRes();

  await controller.remove(req, res);

  expect(res.status).toHaveBeenCalledWith(404);
  expect(res.json).toHaveBeenCalledWith({ message: 'Kategori tidak ditemukan' });
});

test('remove: forbidden (bukan admin & bukan pemilik & beda klaster)', async () => {
  km.getKategoriById.mockResolvedValue({
    data: { kategori_id: 9, user_id: 'someone-else', klaster_id: 99 },
    error: null,
  });
  // user tidak punya klaster sama
  mockSelectKlasterId(11);

  const req = mkReq({ params: { id: '9' }, user: { user_id: 'u-1', role: 'user' } });
  const res = mkRes();

  await controller.remove(req, res);

  expect(res.status).toHaveBeenCalledWith(403);
  expect(res.json).toHaveBeenCalledWith({ message: 'Forbidden: bukan pemilik kategori' });
});

test('remove: terblokir karena dipakai oleh produk', async () => {
  // allowed (pemilik)
  km.getKategoriById.mockResolvedValue({
    data: { kategori_id: 9, user_id: 'u-1', klaster_id: null },
    error: null,
  });
  mockSelectKlasterId(null);
  km.countProdukByKategori.mockResolvedValue({ count: 3, error: null });

  const req = mkReq({ params: { id: '9' } });
  const res = mkRes();

  await controller.remove(req, res);

  expect(km.countProdukByKategori).toHaveBeenCalledWith(9);
  expect(res.status).toHaveBeenCalledWith(409);
  expect(res.json).toHaveBeenCalledWith({ message: 'Kategori dipakai oleh produk—tidak bisa dihapus' });
});

test('remove: terblokir karena dipakai di laporan keuangan', async () => {
  // allowed (klaster sama)
  km.getKategoriById.mockResolvedValue({
    data: { kategori_id: 9, user_id: null, klaster_id: 11 },
    error: null,
  });
  mockSelectKlasterId(11);
  km.countProdukByKategori.mockResolvedValue({ count: 0, error: null });
  km.countLapkeuanganByKategori.mockResolvedValue({ count: 5, error: null });

  const req = mkReq({ params: { id: '9' } });
  const res = mkRes();

  await controller.remove(req, res);

  expect(km.countLapkeuanganByKategori).toHaveBeenCalledWith(9);
  expect(res.status).toHaveBeenCalledWith(409);
  expect(res.json).toHaveBeenCalledWith({ message: 'Kategori dipakai di laporan keuangan—tidak bisa dihapus' });
});

test('remove: admin boleh hapus meski bukan pemilik', async () => {
  km.getKategoriById.mockResolvedValue({
    data: { kategori_id: 9, user_id: 'someone-else', klaster_id: 99 },
    error: null,
  });
  mockSelectKlasterId(11);
  km.countProdukByKategori.mockResolvedValue({ count: 0, error: null });
  km.countLapkeuanganByKategori.mockResolvedValue({ count: 0, error: null });
  km.deleteKategoriById.mockResolvedValue({ error: null });

  const req = mkReq({ params: { id: '9' }, user: { user_id: 'u-1', role: 'admin' } });
  const res = mkRes();

  await controller.remove(req, res);

  expect(km.deleteKategoriById).toHaveBeenCalledWith(9);
  expect(res.json).toHaveBeenCalledWith({ message: 'Kategori dihapus' });
});

test('remove: sukses (pemilik & tidak direferensikan)', async () => {
  km.getKategoriById.mockResolvedValue({
    data: { kategori_id: 9, user_id: 'u-1', klaster_id: null },
    error: null,
  });
  mockSelectKlasterId(null);
  km.countProdukByKategori.mockResolvedValue({ count: 0, error: null });
  km.countLapkeuanganByKategori.mockResolvedValue({ count: 0, error: null });
  km.deleteKategoriById.mockResolvedValue({ error: null });

  const req = mkReq({ params: { id: '9' } });
  const res = mkRes();

  await controller.remove(req, res);

  expect(km.deleteKategoriById).toHaveBeenCalledWith(9);
  expect(res.json).toHaveBeenCalledWith({ message: 'Kategori dihapus' });
});
