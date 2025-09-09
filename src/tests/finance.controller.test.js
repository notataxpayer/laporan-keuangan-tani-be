// src/controllers/finance_controller.test.js
import { jest } from '@jest/globals';

// ============ Mocks ============

// crypto.randomUUID → nilai deterministik
const uuidMock = { randomUUID: jest.fn(() => 'uuid-1') };
jest.unstable_mockModule('crypto', () => uuidMock);

// supabase (hanya dipakai untuk SELECT klaster_id user)
const supabaseMock = { from: jest.fn() };
function mockUserKlaster(klaster_id = null) {
  supabaseMock.from.mockReturnValue({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: { klaster_id }, error: null }),
      }),
    }),
  });
}
jest.unstable_mockModule('../config/supabase.js', () => ({ default: supabaseMock }));

// finance_model functions
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
  listForNeracaByItems: jest.fn(),
  listForNeracaExpanded: jest.fn(),
};
jest.unstable_mockModule('../models/finance_model.js', () => ({ ...fm }));

// akun kas model
const akm = {
  getAkunKasById: jest.fn(),
  incSaldoAkunKas: jest.fn(),
};
jest.unstable_mockModule('../models/akun_kas_model.js', () => ({ ...akm }));

// (import controller setelah semua mock terpasang)
const ctrl = await import('../controllers/finance_controller.js');

// ============ Helpers ============
const mkRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const mkReq = (over = {}) => ({
  user: { user_id: 'u-1', role: 'user' },
  body: {},
  params: {},
  query: {},
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ============ createLaporan ============
test('createLaporan: validasi jenis salah', async () => {
  const req = mkReq({ body: { jenis: 'lain', debit: 0, kredit: 0 } });
  const res = mkRes();
  await ctrl.createLaporan(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ message: 'jenis harus "pengeluaran" atau "pemasukan"' });
});

test('createLaporan: pemasukan tapi debit/kredit tidak sesuai aturan', async () => {
  const req = mkReq({ body: { jenis: 'pemasukan', debit: 0, kredit: 10 } });
  const res = mkRes();
  await ctrl.createLaporan(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

test('createLaporan: validasi akun kas - forbidden (bukan owner/klaster/admin)', async () => {
  mockUserKlaster(11); // user di klaster 11
  // akun milik user lain dan klaster lain
  akm.getAkunKasById.mockResolvedValue({
    data: { akun_id: 5, user_id: 'u-xyz', klaster_id: 99 },
    error: null,
  });

  const req = mkReq({
    body: { jenis: 'pemasukan', debit: 1000, kredit: 0, items: [], akun_id: 5 },
  });
  const res = mkRes();

  await ctrl.createLaporan(req, res);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(res.json).toHaveBeenCalledWith({ message: 'Forbidden: akun kas bukan milikmu/klastermu' });
});

test('createLaporan: validasi items - total tidak sama dengan debit', async () => {
  akm.getAkunKasById.mockResolvedValue({
    data: { akun_id: 1, user_id: 'u-1', klaster_id: null },
    error: null,
  });
  fm.getProdukById.mockResolvedValue({ data: { produk_id: 7 }, error: null });

  const req = mkReq({
    body: {
      jenis: 'pemasukan',
      debit: 1000,
      kredit: 0,
      akun_id: 1,
      items: [{ produk_id: 7, jumlah: 2, subtotal: 300 }], // total 600 ≠ 1000
    },
  });
  const res = mkRes();

  await ctrl.createLaporan(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json.mock.calls[0][0].message).toMatch(/total subtotal items/);
});

test('createLaporan: sukses pemasukan dengan akun & items (insert header, detail, update saldo)', async () => {
  mockUserKlaster(null);
  akm.getAkunKasById.mockResolvedValue({
    data: { akun_id: 1, user_id: 'u-1', klaster_id: null },
    error: null,
  });
  fm.getProdukById.mockResolvedValue({ data: { produk_id: 7 }, error: null });
  fm.insertLaporan.mockResolvedValue({ data: { id_laporan: 'uuid-1', debit: 1000, kredit: 0 }, error: null });
  fm.insertDetailBarang.mockResolvedValue({ error: null });
  akm.incSaldoAkunKas.mockResolvedValue({ error: null });

  const req = mkReq({
    body: {
      jenis: 'pemasukan',
      debit: 1000,
      kredit: 0,
      akun_id: 1,
      items: [{ produk_id: 7, jumlah: 2, harga_satuan: 500 }], // subtotal 1000
    },
  });
  const res = mkRes();

  await ctrl.createLaporan(req, res);

  expect(fm.insertLaporan).toHaveBeenCalledWith(expect.objectContaining({
    id_laporan: 'uuid-1',
    jenis: 'pemasukan',
    debit: 1000,
    kredit: 0,
  }));
  expect(fm.insertDetailBarang).toHaveBeenCalledWith('uuid-1', [{ produk_id: 7, jumlah: 2, subtotal: 1000 }]);
  expect(akm.incSaldoAkunKas).toHaveBeenCalledWith(1, 1000); // delta = debit - kredit
  expect(res.status).toHaveBeenCalledWith(201);
});

test('createLaporan: gagal insert detail → rollback header & 500', async () => {
  akm.getAkunKasById.mockResolvedValue({
    data: { akun_id: 1, user_id: 'u-1', klaster_id: null },
    error: null,
  });
  fm.getProdukById.mockResolvedValue({ data: { produk_id: 7 }, error: null });
  fm.insertLaporan.mockResolvedValue({ data: { id_laporan: 'uuid-1' }, error: null });
  fm.insertDetailBarang.mockResolvedValue({ error: { message: 'insert detail error' } });
  fm.deleteLaporan.mockResolvedValue({ error: null });

  const req = mkReq({
    body: {
      jenis: 'pemasukan',
      debit: 1000,
      kredit: 0,
      akun_id: 1,
      items: [{ produk_id: 7, jumlah: 1, subtotal: 1000 }],
    },
  });
  const res = mkRes();

  await ctrl.createLaporan(req, res);
  expect(fm.deleteLaporan).toHaveBeenCalledWith('uuid-1');
  expect(res.status).toHaveBeenCalledWith(500);
  expect(res.json.mock.calls[0][0].message).toBe('Gagal menyimpan detail barang');
});

// ============ listLaporanController ============
test('listLaporanController: sukses', async () => {
  fm.listLaporan.mockResolvedValue({ data: [{ id_laporan: 'A' }], error: null, count: 1 });

  const req = mkReq({ query: { page: '2', limit: '5', jenis: 'pemasukan', akun_id: '3' } });
  const res = mkRes();

  await ctrl.listLaporanController(req, res);

  expect(fm.listLaporan).toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith({
    page: 2,
    limit: 5,
    total: 1,
    data: [{ id_laporan: 'A' }],
  });
});

// ============ getLaporanDetail ============
test('getLaporanDetail: not found', async () => {
  fm.getLaporanHeader.mockResolvedValue({ data: null, error: null });
  const req = mkReq({ params: { id: 'x' } });
  const res = mkRes();
  await ctrl.getLaporanDetail(req, res);
  expect(res.status).toHaveBeenCalledWith(404);
});

test('getLaporanDetail: forbidden untuk non-admin berbeda user', async () => {
  fm.getLaporanHeader.mockResolvedValue({ data: { id_user: 'other' }, error: null });
  const req = mkReq({ params: { id: 'x' }, user: { user_id: 'u-1', role: 'user' } });
  const res = mkRes();
  await ctrl.getLaporanDetail(req, res);
  expect(res.status).toHaveBeenCalledWith(403);
});

test('getLaporanDetail: sukses + harga_satuan dihitung', async () => {
  fm.getLaporanHeader.mockResolvedValue({ data: { id_user: 'u-1' }, error: null });
  fm.getLaporanDetails.mockResolvedValue({
    data: [{ jumlah: 5, subtotal: 1000 }],
    error: null,
  });
  const req = mkReq({ params: { id: 'x' } });
  const res = mkRes();
  await ctrl.getLaporanDetail(req, res);
  expect(res.json).toHaveBeenCalledWith({
    header: { id_user: 'u-1' },
    details: [{ jumlah: 5, subtotal: 1000, harga_satuan: 200 }],
  });
});

// ============ deleteLaporanController ============
test('deleteLaporanController: reversal saldo akun dan hapus', async () => {
  fm.getLaporanHeader.mockResolvedValue({
    data: { id_user: 'u-1', akun_id: 9, debit: 300, kredit: 0 },
    error: null,
  });
  akm.incSaldoAkunKas.mockResolvedValue({ error: null });
  fm.deleteLaporan.mockResolvedValue({ error: null });

  const req = mkReq({ params: { id: 'x' } });
  const res = mkRes();
  await ctrl.deleteLaporanController(req, res);

  expect(akm.incSaldoAkunKas).toHaveBeenCalledWith(9, -300); // reversal
  expect(fm.deleteLaporan).toHaveBeenCalledWith('x');
  expect(res.json).toHaveBeenCalledWith({ message: 'Laporan dihapus' });
});

// ============ getLabaRugi ============
test('getLabaRugi: hitung debit-kredit berdasar jenis', async () => {
  fm.sumProfitLoss.mockResolvedValue({
    data: [
      { jenis: 'pemasukan', debit: 1000 },
      { jenis: 'pengeluaran', kredit: 400 },
    ],
    error: null,
  });
  const req = mkReq({ query: {} });
  const res = mkRes();
  await ctrl.getLabaRugi(req, res);
  expect(res.json).toHaveBeenCalledWith({
    periode: { start: null, end: null },
    total_pemasukan: 1000,
    total_pengeluaran: 400,
    laba_rugi: 600,
  });
});

// ============ getArusKas ============
test('getArusKas: param arah invalid', async () => {
  const req = mkReq({ query: { arah: 'x' } });
  const res = mkRes();
  await ctrl.getArusKas(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

test('getArusKas: sukses arah=masuk', async () => {
  fm.listAruskas.mockResolvedValue({
    data: [{ debit: 100 }, { debit: 50 }],
    count: 2,
    error: null,
  });
  const req = mkReq({ query: { arah: 'masuk', page: '1', limit: '10' } });
  const res = mkRes();
  await ctrl.getArusKas(req, res);
  expect(res.json).toHaveBeenCalledWith({
    meta: {
      arah: 'masuk',
      page: 1,
      limit: 10,
      total_rows: 2,
      total_nilai: 150,
    },
    data: [{ debit: 100 }, { debit: 50 }],
  });
});

// ============ getNeraca ============
test('getNeraca: agregasi per range aset_lancar/aset_tetap/kewajiban', async () => {
  // RANGES in controller:
  // aset_lancar: 0-2599; aset_tetap: 2600-3599; kewajiban: 4000-4999
  fm.listForNeracaByItems.mockResolvedValue({
    data: [
      { neraca_identifier: 10, jenis: 'pemasukan', subtotal: 300 },    // aset lancar debit
      { neraca_identifier: 2550, jenis: 'pengeluaran', subtotal: 50 }, // aset lancar kredit
      { neraca_identifier: 3000, jenis: 'pemasukan', subtotal: 200 },  // aset tetap debit
      { neraca_identifier: 4100, jenis: 'pengeluaran', subtotal: 120 } // kewajiban kredit
    ],
    error: null,
  });

  const req = mkReq({ query: {} });
  const res = mkRes();
  await ctrl.getNeraca(req, res);

  // aset_lancar saldo = 300 - 50 = 250
  // aset_tetap saldo  = 200
  // kewajiban saldo   = 120
  // total_aset = 450; total_kewajiban = 120
  expect(res.json).toHaveBeenCalledWith({
    periode: { start: null, end: null },
    aset_lancar: { debit: 300, kredit: 50, saldo: 250 },
    aset_tetap:  { debit: 200, kredit: 0,  saldo: 200 },
    kewajiban:   { debit: 0,   kredit: 120, saldo: -120 }, // debit 0, kredit 120, saldo = 0 - 120 = -120 → tapi controller isi {debit, kredit, saldo: debit-kredit}
    total_aset: 450,
    total_kewajiban: -120,
    seimbang: 450 === -120,
  });
});

// ============ getArusKasByAkun ============
test('getArusKasByAkun: akun_id invalid', async () => {
  const req = mkReq({ query: { akun_id: 'abc' } });
  const res = mkRes();
  await ctrl.getArusKasByAkun(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

test('getArusKasByAkun: akun tidak ditemukan', async () => {
  akm.getAkunKasById.mockResolvedValue({ data: null, error: null });
  const req = mkReq({ query: { akun_id: '7' } });
  const res = mkRes();
  await ctrl.getArusKasByAkun(req, res);
  expect(res.status).toHaveBeenCalledWith(404);
});

test('getArusKasByAkun: forbidden non-owner non-admin beda klaster', async () => {
  // akun milik user lain & klaster 99
  akm.getAkunKasById.mockResolvedValue({ data: { akun_id: 7, user_id: 'someone', klaster_id: 99 }, error: null });
  mockUserKlaster(11);
  const req = mkReq({ query: { akun_id: '7' }, user: { user_id: 'u-1', role: 'user' } });
  const res = mkRes();
  await ctrl.getArusKasByAkun(req, res);
  expect(res.status).toHaveBeenCalledWith(403);
});

test('getArusKasByAkun: sukses (owner) ambil dua arah + total', async () => {
  akm.getAkunKasById.mockResolvedValue({ data: { akun_id: 7, user_id: 'u-1', klaster_id: null }, error: null });
  mockUserKlaster(null);

  // masuk
  fm.listAruskas.mockImplementation(async ({ arah }) => {
    if (arah === 'masuk') return { data: [{ debit: 100 }, { debit: 50 }], count: 2, error: null };
    return { data: [{ kredit: 30 }], count: 1, error: null };
  });

  const req = mkReq({ query: { akun_id: '7', page: '1', limit: '10' } });
  const res = mkRes();
  await ctrl.getArusKasByAkun(req, res);

  expect(res.json).toHaveBeenCalledWith({
    meta: {
      akun_id: 7,
      periode: { start: null, end: null },
      page: 1, limit: 10,
      total_rows_masuk: 2,
      total_rows_keluar: 1,
      total_masuk: 150,
      total_keluar: 30,
      net: 120,
    },
    masuk: [{ debit: 100 }, { debit: 50 }],
    keluar: [{ kredit: 30 }],
  });
});
