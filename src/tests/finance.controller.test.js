// src/tests/finance.controller.test.js
import { jest } from '@jest/globals';

// ---- MOCK SEMUA FUNGSI MODEL SEBELUM IMPORT CONTROLLER ----
const modelMocks = {
  getKategoriById: jest.fn(),
  getProdukById: jest.fn(),
  insertLaporan: jest.fn(),
  insertDetailBarang: jest.fn(),
  getLaporanHeader: jest.fn(),
  getLaporanDetails: jest.fn(),
  listLaporan: jest.fn(),
  deleteLaporan: jest.fn(),
  sumProfitLoss: jest.fn(),
  listAruskas: jest.fn(), // kalau nanti mau dipakai
};

jest.unstable_mockModule('../models/finance_model.js', () => ({
  getKategoriById: modelMocks.getKategoriById,
  getProdukById: modelMocks.getProdukById,
  insertLaporan: modelMocks.insertLaporan,
  insertDetailBarang: modelMocks.insertDetailBarang,
  getLaporanHeader: modelMocks.getLaporanHeader,
  getLaporanDetails: modelMocks.getLaporanDetails,
  listLaporan: modelMocks.listLaporan,
  deleteLaporan: modelMocks.deleteLaporan,
  sumProfitLoss: modelMocks.sumProfitLoss,
  listAruskas: modelMocks.listAruskas,
}));

// Import controller SETELAH mock siap
const finance = await import('../controllers/finance_controller.js');

// ---- helper response sederhana ----
function createRes() {
  const res = {};
  res.statusCode = 200;
  res.body = undefined;
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
}

describe('finance.controller (minimal tests)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------- POST /keuangan/laporan ----------------
  test('POST createLaporan (pemasukan) → 201 sukses', async () => {
    // Arrange mocks
    modelMocks.getKategoriById.mockResolvedValue({
      data: { kategori_id: 7, jenis: 'pemasukan' },
      error: null,
    });
    modelMocks.getProdukById.mockResolvedValue({
      data: { produk_id: 3, harga: 12000, nama: 'Beras' },
      error: null,
    });
    modelMocks.insertLaporan.mockResolvedValue({
      data: {
        id_laporan: '11111111-1111-1111-1111-111111111111',
        id_user: 'u-1',
        jenis: 'pemasukan',
        kategori_id: 7,
        deskripsi: 'Penjualan beras 10kg',
        debit: 120000,
        kredit: 0,
      },
      error: null,
    });
    modelMocks.insertDetailBarang.mockResolvedValue({ error: null });

    const req = {
      user: { user_id: 'u-1', role: 'user' },
      body: {
        jenis: 'pemasukan',
        kategori_id: 7,
        deskripsi: 'Penjualan beras 10kg',
        debit: 120000,
        kredit: 0,
        items: [{ produk_id: 3, jumlah: 10 }], // harga 12.000 * 10 = 120.000
      },
    };
    const res = createRes();

    // Act
    await finance.createLaporan(req, res);
    const usedId = modelMocks.insertLaporan.mock.calls[0][0].id_laporan;

    // Assert
    expect(modelMocks.getKategoriById).toHaveBeenCalledWith(7);
    expect(modelMocks.getProdukById).toHaveBeenCalledWith(3);
    expect(modelMocks.insertLaporan).toHaveBeenCalled();
    expect(modelMocks.insertDetailBarang).toHaveBeenCalledWith(
      usedId,
      [{ produk_id: 3, jumlah: 10, subtotal: 120000 }]
    );
    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe('Laporan dibuat');
    expect(res.body.data).toMatchObject({ jenis: 'pemasukan', debit: 120000, kredit: 0 });
  });

  // --------------- GET /keuangan/laporan ------------------
  test('GET listLaporanController → 200 sukses', async () => {
    modelMocks.listLaporan.mockResolvedValue({
      data: [
        {
          id_laporan: 'L1',
          id_user: 'u-1',
          jenis: 'pemasukan',
          kategori_id: 7,
          debit: 120000,
          kredit: 0,
          created_at: '2025-08-21T00:00:00Z',
        },
      ],
      error: null,
      count: 1,
    });

    const req = {
      user: { user_id: 'u-1', role: 'user' }, // user biasa → otomatis filter ke miliknya
      query: { page: '1', limit: '10' },
    };
    const res = createRes();

    await finance.listLaporanController(req, res);

    expect(modelMocks.listLaporan).toHaveBeenCalledWith({
      id_user: 'u-1',
      start: undefined,
      end: undefined,
      jenis: undefined,
      kategori_id: undefined,
      page: 1,
      limit: 10,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      page: 1,
      limit: 10,
      total: 1,
      data: expect.any(Array),
    });
  });

  // ---------- GET /keuangan/laporan/:id (param id) --------
  test('GET getLaporanDetail (param id) → 200 sukses', async () => {
    modelMocks.getLaporanHeader.mockResolvedValue({
      data: {
        id_laporan: 'L1',
        id_user: 'u-1',
        jenis: 'pemasukan',
        kategori_id: 7,
        debit: 120000,
        kredit: 0,
      },
      error: null,
    });
    modelMocks.getLaporanDetails.mockResolvedValue({
      data: [
        { id_detail: 1, produk_id: 3, jumlah: 10, subtotal: 120000, produk: { nama: 'Beras', harga: 12000 } },
      ],
      error: null,
    });

    const req = { user: { user_id: 'u-1', role: 'user' }, params: { id: 'L1' } };
    const res = createRes();

    await finance.getLaporanDetail(req, res);

    expect(modelMocks.getLaporanHeader).toHaveBeenCalledWith('L1');
    expect(modelMocks.getLaporanDetails).toHaveBeenCalledWith('L1');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      header: expect.objectContaining({ id_laporan: 'L1', jenis: 'pemasukan' }),
      details: expect.any(Array),
    });
  });
});
