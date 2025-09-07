// src/tests/finance.controller.test.js
import { jest } from '@jest/globals';

// (opsional) supaya log dotenv tidak berisik saat test
beforeAll(() => {
  process.env.DOTENV_CONFIG_SILENT = 'true';
});

// ---- mock supabase (dipakai utk cek klaster user pada beberapa path) ----
jest.unstable_mockModule('../config/supabase.js', () => ({
  default: {
    from: (table) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { klaster_id: null }, error: null }),
        }),
      }),
    }),
  },
}));

// ---- mock finance models ----
const fm = {
  getProdukById: jest.fn(),
  insertLaporan: jest.fn(),
  insertDetailBarang: jest.fn(),
  getLaporanHeader: jest.fn(),
  getLaporanDetails: jest.fn(),
  listLaporan: jest.fn(),
  deleteLaporan: jest.fn(),
  sumProfitLoss: jest.fn(),
  listAruskas: jest.fn(),
  listForNeracaByItems: jest.fn(), // tidak dipakai di test ini
};

jest.unstable_mockModule('../models/finance_model.js', () => ({
  getProdukById: fm.getProdukById,
  insertLaporan: fm.insertLaporan,
  insertDetailBarang: fm.insertDetailBarang,
  getLaporanHeader: fm.getLaporanHeader,
  getLaporanDetails: fm.getLaporanDetails,
  listLaporan: fm.listLaporan,
  deleteLaporan: fm.deleteLaporan,
  sumProfitLoss: fm.sumProfitLoss,
  listAruskas: fm.listAruskas,
  listForNeracaByItems: fm.listForNeracaByItems,
}));

// ---- mock akun kas model (avoid saldo update on create by not sending akun_id) ----
jest.unstable_mockModule('../models/akun_kas_model.js', () => ({
  getAkunKasById: jest.fn(),
  incSaldoAkunKas: jest.fn(),
}));

// Import controller SETELAH semua mock di atas
const finance = await import('../controllers/finance_controller.js');

function resMock() {
  const res = {};
  res.statusCode = 200;
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
}

describe('finance.controller (minimal tests)', () => {
  const user = { user_id: 'u-1', role: 'user' };

  beforeEach(() => jest.clearAllMocks());

  test('POST createLaporan (pemasukan) → 201 sukses', async () => {
    // dua produk, total 20.000
    fm.getProdukById.mockImplementation(async (id) => ({
      data: { produk_id: id, nama: `P${id}`, kategori_id: 10 },
      error: null,
    }));

    // Kembalikan payload yang dikirim controller supaya bisa kita verifikasi lagi
    fm.insertLaporan.mockImplementation(async (payload) => ({
      data: payload,
      error: null,
    }));

    fm.insertDetailBarang.mockResolvedValue({ error: null });

    const req = {
      user,
      body: {
        jenis: 'pemasukan',
        deskripsi: 'Tes',
        debit: 20000,
        kredit: 0,
        items: [
          { produk_id: 2, jumlah: 1, harga_satuan: 10000 },
          { produk_id: 3, jumlah: 1, harga_satuan: 10000 },
        ],
      },
    };
    const res = resMock();

    await finance.createLaporan(req, res);

    expect(res.statusCode).toBe(201);
    expect(fm.insertLaporan).toHaveBeenCalled();
    expect(fm.insertDetailBarang).toHaveBeenCalled();

    // Ambil ID yang benar-benar dipakai saat menyimpan detail
    const usedId = fm.insertDetailBarang.mock.calls[0][0];
    const usedItems = fm.insertDetailBarang.mock.calls[0][1];

    // Pastikan ID berformat string UUID (cek longgar)
    expect(usedId).toMatch(/^[0-9a-f-]{36}$/i);

    // Pastikan insertLaporan dipanggil dengan ID yang sama
    expect(fm.insertLaporan).toHaveBeenCalledWith(
      expect.objectContaining({
        id_laporan: usedId,
        id_user: user.user_id,
        jenis: 'pemasukan',
        deskripsi: 'Tes',
        debit: 20000,
        kredit: 0,
        // akun_id seharusnya null bila tidak dikirim
        akun_id: null,
      })
    );

    // Validasi item yang dikirim ke insertDetailBarang
    expect(usedItems).toEqual([
      { produk_id: 2, jumlah: 1, subtotal: 10000 },
      { produk_id: 3, jumlah: 1, subtotal: 10000 },
    ]);
  });

  test('GET listLaporan → 200', async () => {
    fm.listLaporan.mockResolvedValue({
      data: [
        { id_laporan: 'a', jenis: 'pemasukan', debit: 10000, kredit: 0 },
        { id_laporan: 'b', jenis: 'pengeluaran', debit: 0, kredit: 5000 },
      ],
      error: null,
      count: 2,
    });

    const req = { user, query: { page: 1, limit: 10 } };
    const res = resMock();

    await finance.listLaporanController(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(2);
  });

  test('GET /arus-kas arah=masuk → 200 + total', async () => {
    fm.listAruskas.mockResolvedValue({
      data: [
        { id_laporan: 'a', jenis: 'pemasukan', debit: 12000, kredit: 0 },
        { id_laporan: 'b', jenis: 'pemasukan', debit: 8000, kredit: 0 },
      ],
      error: null,
      count: 2,
    });

    const req = { user, query: { arah: 'masuk', page: 1, limit: 10 } };
    const res = resMock();

    await finance.getArusKas(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.meta.total_nilai).toBe(20000);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('GET /laba-rugi → 200, hitung benar', async () => {
    fm.sumProfitLoss.mockResolvedValue({
      data: [
        { jenis: 'pemasukan', debit: 30000, kredit: 0 },
        { jenis: 'pengeluaran', debit: 0, kredit: 12000 },
      ],
      error: null,
    });

    const req = { user, query: {} };
    const res = resMock();

    await finance.getLabaRugi(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.total_pemasukan).toBe(30000);
    expect(res.body.total_pengeluaran).toBe(12000);
    expect(res.body.laba_rugi).toBe(18000);
  });
});
