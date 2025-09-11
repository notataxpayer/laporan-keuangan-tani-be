// src/controllers/finance_controller.test.js
import { jest } from '@jest/globals';

// ==== Mock crypto.randomUUID agar deterministik ====
jest.unstable_mockModule('crypto', () => ({
  randomUUID: () => 'lap-uuid-fixed',
}));

// ==== Mock supabase.from('User').select(...).eq(...).single() ====
// Kita butuh kontrol klaster_id milik user yang login.
let __mockKlasterId = null;
let __mockUserErr = null;
jest.unstable_mockModule('../config/supabase.js', () => ({
  __setKlasterId: (v) => { __mockKlasterId = v; },
  __setUserErr: (e) => { __mockUserErr = e; },
  default: {
    from: (table) => ({
      select: () => ({
        eq: () => ({
          single: async () => (__mockUserErr
            ? { data: null, error: __mockUserErr }
            : { data: { klaster_id: __mockKlasterId }, error: null }),
        }),
      }),
    }),
  },
}));

// ==== Mock semua fungsi models/finance_model.js ====
const fns = {
  getProdukById:           jest.fn(),
  insertLaporan:           jest.fn(),
  insertDetailBarang:      jest.fn(),
  getLaporanHeader:        jest.fn(),
  getLaporanDetails:       jest.fn(),
  listLaporan:             jest.fn(),
  deleteLaporan:           jest.fn(),
  sumProfitLoss:           jest.fn(),
  listAruskas:             jest.fn(),
  listForNeracaByItems:    jest.fn(),
  listForNeracaExpanded:   jest.fn(),
};
jest.unstable_mockModule('../models/finance_model.js', () => ({
  getProdukById:         fns.getProdukById,
  insertLaporan:         fns.insertLaporan,
  insertDetailBarang:    fns.insertDetailBarang,
  getLaporanHeader:      fns.getLaporanHeader,
  getLaporanDetails:     fns.getLaporanDetails,
  listLaporan:           fns.listLaporan,
  deleteLaporan:         fns.deleteLaporan,
  sumProfitLoss:         fns.sumProfitLoss,
  listAruskas:           fns.listAruskas,
  listForNeracaByItems:  fns.listForNeracaByItems,
  listForNeracaExpanded: fns.listForNeracaExpanded,
}));

// ==== Mock models/akun_kas_model.js ====
const akunFns = {
  getAkunKasById:  jest.fn(),
  incSaldoAkunKas: jest.fn(),
};
jest.unstable_mockModule('../models/akun_kas_model.js', () => ({
  getAkunKasById:  akunFns.getAkunKasById,
  incSaldoAkunKas: akunFns.incSaldoAkunKas,
}));

// ==== Mock neraca_builder (tidak dipakai di test ini, cukup stub) ====
jest.unstable_mockModule('../config/neraca_builder.js', () => ({
  buildNeracaNested: jest.fn(),
}));

// ==== Import controller setelah semua mock siap ====
const cryptoMock = await import('crypto'); // memastikan mock applied
const supabaseMock = await import('../config/supabase.js');
const financeController = await import('../controllers/finance_controller.js');

const {
  createLaporan,
  listLaporanController,
  getLaporanDetail,
  deleteLaporanController,
  getLabaRugi,
  getArusKas,
  getArusKasByAkun,
} = financeController;

// ==== Helper req/res ====
function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}
function makeReq({
  body = {},
  query = {},
  params = {},
  user = { user_id: 'u-1', role: 'user' },
} = {}) {
  return { body, query, params, user };
}

beforeEach(() => {
  jest.clearAllMocks();
  supabaseMock.__setKlasterId(null);
  supabaseMock.__setUserErr(null);
});

// ======================= createLaporan =======================
describe('POST /api/keuangan/laporan - createLaporan', () => {
  test('400: jenis invalid / debit kredit rule invalid', async () => {
    const res = makeRes();
    await createLaporan(makeReq({ body: { jenis: 'salah' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);

    const res2 = makeRes();
    await createLaporan(makeReq({ body: { jenis: 'pemasukan', debit: 0, kredit: 0 } }), res2);
    expect(res2.status).toHaveBeenCalledWith(400);

    const res3 = makeRes();
    await createLaporan(makeReq({ body: { jenis: 'pengeluaran', debit: 10, kredit: 0 } }), res3);
    expect(res3.status).toHaveBeenCalledWith(400);
  });

  test('400: akun_id tidak ditemukan', async () => {
    akunFns.getAkunKasById.mockResolvedValue({ data: null, error: null });
    const res = makeRes();
    await createLaporan(makeReq({
      body: { jenis: 'pemasukan', debit: 100, kredit: 0, items: [], akun_id: 1 },
    }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'akun_id tidak ditemukan' }));
  });

  test('403: akun_id bukan milik user/klaster dan bukan admin', async () => {
    akunFns.getAkunKasById.mockResolvedValue({ data: { akun_id: 1, user_id: 'u-x', klaster_id: 99 }, error: null });
    supabaseMock.__setKlasterId(7);
    const res = makeRes();
    await createLaporan(makeReq({
      body: { jenis: 'pemasukan', debit: 100, kredit: 0, items: [], akun_id: 1 },
      user: { user_id: 'u-1', role: 'user' },
    }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('400: items invalid (produk_id/jumlah/harga/subtotal mismatches)', async () => {
    // produk_id invalid
    let res = makeRes();
    await createLaporan(makeReq({
      body: { jenis: 'pemasukan', debit: 100, kredit: 0, items: [{ produk_id: 'xx', jumlah: 1, subtotal: 100 }] },
    }), res);
    expect(res.status).toHaveBeenCalledWith(400);

    // jumlah invalid
    res = makeRes();
    await createLaporan(makeReq({
      body: { jenis: 'pemasukan', debit: 100, kredit: 0, items: [{ produk_id: 1, jumlah: 0, subtotal: 100 }] },
    }), res);
    expect(res.status).toHaveBeenCalledWith(400);

    // produk tidak ditemukan
    fns.getProdukById.mockResolvedValue({ data: null, error: null });
    res = makeRes();
    await createLaporan(makeReq({
      body: { jenis: 'pemasukan', debit: 100, kredit: 0, items: [{ produk_id: 1, jumlah: 1, subtotal: 100 }] },
    }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('400: total subtotal items tidak sama dengan debit/kredit', async () => {
    fns.getProdukById.mockResolvedValue({ data: { id: 1 }, error: null });
    const res = makeRes();
    await createLaporan(makeReq({
      body: {
        jenis: 'pemasukan',
        debit: 200, kredit: 0,
        items: [{ produk_id: 1, jumlah: 1, subtotal: 100 }],
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/total subtotal items/);
  });

  test('500: insertLaporan error', async () => {
    fns.getProdukById.mockResolvedValue({ data: { id: 1 }, error: null });
    fns.insertLaporan.mockResolvedValue({ data: null, error: new Error('insert header fail') });
    const res = makeRes();
    await createLaporan(makeReq({
      body: {
        jenis: 'pemasukan',
        debit: 100, kredit: 0,
        items: [{ produk_id: 1, jumlah: 1, subtotal: 100 }],
      },
    }), res);
    expect(fns.insertLaporan).toHaveBeenCalledWith(expect.objectContaining({ id_laporan: 'lap-uuid-fixed' }));
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('500: insertDetailBarang error -> rollback deleteLaporan', async () => {
    fns.getProdukById.mockResolvedValue({ data: { id: 1 }, error: null });
    fns.insertLaporan.mockResolvedValue({ data: { id_laporan: 'lap-uuid-fixed' }, error: null });
    fns.insertDetailBarang.mockResolvedValue({ error: new Error('detail fail') });
    fns.deleteLaporan.mockResolvedValue({ error: null });

    const res = makeRes();
    await createLaporan(makeReq({
      body: {
        jenis: 'pemasukan',
        debit: 100, kredit: 0,
        items: [{ produk_id: 1, jumlah: 1, subtotal: 100 }],
      },
    }), res);
    expect(fns.deleteLaporan).toHaveBeenCalledWith('lap-uuid-fixed');
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('500: incSaldoAkunKas error -> rollback deleteLaporan', async () => {
    // akun valid & milik user
    akunFns.getAkunKasById.mockResolvedValue({ data: { akun_id: 7, user_id: 'u-1', klaster_id: null }, error: null });
    fns.getProdukById.mockResolvedValue({ data: { id: 1 }, error: null });
    fns.insertLaporan.mockResolvedValue({ data: { id_laporan: 'lap-uuid-fixed' }, error: null });
    fns.insertDetailBarang.mockResolvedValue({ error: null });
    akunFns.incSaldoAkunKas.mockResolvedValue({ error: new Error('saldo fail') });
    fns.deleteLaporan.mockResolvedValue({ error: null });

    const res = makeRes();
    await createLaporan(makeReq({
      body: {
        jenis: 'pemasukan',
        debit: 100, kredit: 0,
        items: [{ produk_id: 1, jumlah: 1, subtotal: 100 }],
        akun_id: 7,
      },
    }), res);
    expect(akunFns.incSaldoAkunKas).toHaveBeenCalledWith(7, 100);
    expect(fns.deleteLaporan).toHaveBeenCalledWith('lap-uuid-fixed');
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('201: sukses tanpa akun (saldo tidak diupdate)', async () => {
    fns.getProdukById.mockResolvedValue({ data: { id: 1 }, error: null });
    fns.insertLaporan.mockResolvedValue({ data: { id_laporan: 'lap-uuid-fixed', ok: true }, error: null });
    fns.insertDetailBarang.mockResolvedValue({ error: null });

    const res = makeRes();
    await createLaporan(makeReq({
      body: {
        jenis: 'pengeluaran',
        debit: 0, kredit: 50,
        items: [{ produk_id: 1, jumlah: 1, subtotal: 50 }],
      },
    }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ message: 'Laporan dibuat', data: { id_laporan: 'lap-uuid-fixed', ok: true } });
    expect(akunFns.incSaldoAkunKas).not.toHaveBeenCalled();
  });
});

// ======================= listLaporanController =======================
describe('GET /api/keuangan/laporan - listLaporanController', () => {
  test('non-admin memaksa id_user = req.user.user_id', async () => {
    fns.listLaporan.mockResolvedValue({ data: [{ id: 1 }], count: 1, error: null });
    const res = makeRes();
    await listLaporanController(makeReq({
      query: { page: '2', limit: '5', jenis: 'pemasukan' },
      user: { user_id: 'u-1', role: 'user' },
    }), res);
    expect(fns.listLaporan).toHaveBeenCalledWith(expect.objectContaining({ id_user: 'u-1' }));
    expect(res.json).toHaveBeenCalledWith({ page: 2, limit: 5, total: 1, data: [{ id: 1 }] });
  });

  test('admin boleh override id_user via query', async () => {
    fns.listLaporan.mockResolvedValue({ data: [], count: 0, error: null });
    const res = makeRes();
    await listLaporanController(makeReq({
      query: { id_user: 'u-x' },
      user: { user_id: 'u-1', role: 'admin' },
    }), res);
    expect(fns.listLaporan).toHaveBeenCalledWith(expect.objectContaining({ id_user: 'u-x' }));
  });

  test('500 jika error', async () => {
    fns.listLaporan.mockResolvedValue({ data: null, count: null, error: new Error('boom') });
    const res = makeRes();
    await listLaporanController(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ======================= getLaporanDetail =======================
describe('GET /api/keuangan/laporan/:id - getLaporanDetail', () => {
  test('404 jika tidak ditemukan', async () => {
    fns.getLaporanHeader.mockResolvedValue({ data: null, error: null });
    const res = makeRes();
    await getLaporanDetail(makeReq({ params: { id: 'lap-1' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('403 jika bukan pemilik dan bukan admin', async () => {
    fns.getLaporanHeader.mockResolvedValue({ data: { id_user: 'u-x' }, error: null });
    const res = makeRes();
    await getLaporanDetail(makeReq({ params: { id: 'lap-1' }, user: { user_id: 'u-1', role: 'user' } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('500 jika gagal ambil detail', async () => {
    fns.getLaporanHeader.mockResolvedValue({ data: { id_user: 'u-1' }, error: null });
    fns.getLaporanDetails.mockResolvedValue({ data: null, error: new Error('details fail') });
    const res = makeRes();
    await getLaporanDetail(makeReq({ params: { id: 'lap-1' }, user: { user_id: 'u-1', role: 'user' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('200 sukses + harga_satuan dihitung floor(subtotal/jumlah)', async () => {
    fns.getLaporanHeader.mockResolvedValue({ data: { id_user: 'u-1', akun_id: null }, error: null });
    fns.getLaporanDetails.mockResolvedValue({
      data: [{ produk_id: 1, jumlah: 3, subtotal: 101 }],
      error: null,
    });
    const res = makeRes();
    await getLaporanDetail(makeReq({ params: { id: 'lap-1' }, user: { user_id: 'u-1', role: 'user' } }), res);
    expect(res.json).toHaveBeenCalledWith({
      header: { id_user: 'u-1', akun_id: null },
      details: [{ produk_id: 1, jumlah: 3, subtotal: 101, harga_satuan: Math.floor(101 / 3) }],
    });
  });
});

// ======================= deleteLaporanController =======================
describe('DELETE /api/keuangan/laporan/:id - deleteLaporanController', () => {
  test('404 jika header tidak ada', async () => {
    fns.getLaporanHeader.mockResolvedValue({ data: null, error: null });
    const res = makeRes();
    await deleteLaporanController(makeReq({ params: { id: 'lap-1' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('403 jika bukan pemilik dan bukan admin', async () => {
    fns.getLaporanHeader.mockResolvedValue({ data: { id_user: 'u-x' }, error: null });
    const res = makeRes();
    await deleteLaporanController(makeReq({ params: { id: 'lap-1' }, user: { user_id: 'u-1', role: 'user' } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('500 jika reversal saldo akun gagal', async () => {
    fns.getLaporanHeader.mockResolvedValue({ data: { id_user: 'u-1', akun_id: 7, debit: 100, kredit: 0 }, error: null });
    akunFns.incSaldoAkunKas.mockResolvedValue({ error: new Error('reversal fail') });
    const res = makeRes();
    await deleteLaporanController(makeReq({ params: { id: 'lap-1' }, user: { user_id: 'u-1', role: 'user' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('500 jika deleteLaporan gagal', async () => {
    fns.getLaporanHeader.mockResolvedValue({ data: { id_user: 'u-1', akun_id: null, debit: 0, kredit: 0 }, error: null });
    akunFns.incSaldoAkunKas.mockResolvedValue({ error: null });
    fns.deleteLaporan.mockResolvedValue({ error: new Error('del fail') });
    const res = makeRes();
    await deleteLaporanController(makeReq({ params: { id: 'lap-1' }, user: { user_id: 'u-1', role: 'user' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('200 sukses delete', async () => {
    fns.getLaporanHeader.mockResolvedValue({ data: { id_user: 'u-1', akun_id: null, debit: 0, kredit: 0 }, error: null });
    fns.deleteLaporan.mockResolvedValue({ error: null });
    const res = makeRes();
    await deleteLaporanController(makeReq({ params: { id: 'lap-1' }, user: { user_id: 'u-1', role: 'user' } }), res);
    expect(res.json).toHaveBeenCalledWith({ message: 'Laporan dihapus' });
  });
});

// ======================= getLabaRugi =======================
describe('GET /api/keuangan/laba-rugi - getLabaRugi', () => {
  test('500 jika sumProfitLoss error', async () => {
    fns.sumProfitLoss.mockResolvedValue({ data: null, error: new Error('agg fail') });
    const res = makeRes();
    await getLabaRugi(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('200: menghitung pemasukan(kredit/debit) & laba_rugi', async () => {
    fns.sumProfitLoss.mockResolvedValue({
      data: [
        { jenis: 'pemasukan', debit: 300, kredit: 0 },
        { jenis: 'pengeluaran', debit: 0, kredit: 120 },
      ],
      error: null,
    });
    const res = makeRes();
    await getLabaRugi(makeReq({
      query: { start: '2025-01-01', end: '2025-02-01' },
    }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      total_pemasukan: 300,
      total_pengeluaran: 120,
      laba_rugi: 180,
    }));
  });
});

// ======================= getArusKas =======================
describe('GET /api/keuangan/arus-kas - getArusKas', () => {
  test('400 jika arah invalid', async () => {
    const res = makeRes();
    await getArusKas(makeReq({ query: { arah: 'salah' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('500 jika listAruskas error', async () => {
    fns.listAruskas.mockResolvedValue({ data: null, error: new Error('list fail'), count: null });
    const res = makeRes();
    await getArusKas(makeReq({ query: { arah: 'masuk' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('200 sukses + meta total_nilai sesuai arah', async () => {
    fns.listAruskas.mockResolvedValue({
      data: [{ debit: 50, kredit: 0 }, { debit: 25, kredit: 0 }],
      count: 2,
      error: null,
    });
    const res = makeRes();
    await getArusKas(makeReq({ query: { arah: 'masuk', page: '2', limit: '5' } }), res);
    expect(res.json).toHaveBeenCalledWith({
      meta: { arah: 'masuk', page: 2, limit: 5, total_rows: 2, total_nilai: 75 },
      data: [{ debit: 50, kredit: 0 }, { debit: 25, kredit: 0 }],
    });
  });
});

// ======================= getArusKasByAkun =======================
describe('GET /api/keuangan/arus-kas/by-akun - getArusKasByAkun', () => {
  test('400 jika akun_id non-angka', async () => {
    const res = makeRes();
    await getArusKasByAkun(makeReq({ query: { akun_id: 'abc' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('404 jika akun kas tidak ditemukan', async () => {
    akunFns.getAkunKasById.mockResolvedValue({ data: null, error: null });
    const res = makeRes();
    await getArusKasByAkun(makeReq({ query: { akun_id: '7' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('403 jika akun bukan milik user/klaster dan bukan admin', async () => {
    akunFns.getAkunKasById.mockResolvedValue({ data: { akun_id: 7, user_id: 'u-x', klaster_id: 99 }, error: null });
    supabaseMock.__setKlasterId(7); // user klaster 7 ≠ akun 99
    const res = makeRes();
    await getArusKasByAkun(makeReq({ query: { akun_id: '7' }, user: { user_id: 'u-1', role: 'user' } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('500 jika salah satu listAruskas (masuk/keluar) error', async () => {
    // akun milik user
    akunFns.getAkunKasById.mockResolvedValue({ data: { akun_id: 7, user_id: 'u-1', klaster_id: null }, error: null });
    fns.listAruskas
      .mockResolvedValueOnce({ data: null, error: new Error('masuk fail') })   // masuk
      .mockResolvedValueOnce({ data: [],  error: null });                       // keluar
    const res = makeRes();
    await getArusKasByAkun(makeReq({ query: { akun_id: '7' }, user: { user_id: 'u-1', role: 'user' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('200 sukses: gabungkan masuk & keluar + net', async () => {
    akunFns.getAkunKasById.mockResolvedValue({ data: { akun_id: 7, user_id: 'u-1', klaster_id: null }, error: null });
    fns.listAruskas
      .mockResolvedValueOnce({ // masuk
        data: [{ debit: 100, kredit: 0 }],
        count: 1,
        error: null,
      })
      .mockResolvedValueOnce({ // keluar
        data: [{ debit: 0, kredit: 40 }],
        count: 1,
        error: null,
      });

    const res = makeRes();
    await getArusKasByAkun(makeReq({ query: { akun_id: '7', page: '1', limit: '10' }, user: { user_id: 'u-1', role: 'user' } }), res);
    expect(res.json).toHaveBeenCalledWith({
      meta: {
        akun_id: 7,
        periode: { start: null, end: null },
        page: 1,
        limit: 10,
        total_rows_masuk: 1,
        total_rows_keluar: 1,
        total_masuk: 100,
        total_keluar: 40,
        net: 60,
      },
      masuk: [{ debit: 100, kredit: 0 }],
      keluar: [{ debit: 0, kredit: 40 }],
    });
  });
});
