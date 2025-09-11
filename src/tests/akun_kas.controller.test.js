// src/controllers/akun_kas.controller.test.js
import { jest } from '@jest/globals';

// ---- Mock supabase untuk getUserKlasterId (User.klaster_id) ----
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

// ---- Mock model functions ----
const model = {
  createAkunKas: jest.fn(),
  listAkunKasVisible: jest.fn(),
  getAkunKasById: jest.fn(),
  deleteAkunKasById: jest.fn(),
};

jest.unstable_mockModule('../models/akun_kas_model.js', () => ({
  createAkunKas: model.createAkunKas,
  listAkunKasVisible: model.listAkunKasVisible,
  getAkunKasById: model.getAkunKasById,
  deleteAkunKasById: model.deleteAkunKasById,
}));

// Import controller setelah mock siap
const supabaseMock = await import('../config/supabase.js');
const ctrl = await import('../controllers/akun_kas_controller.js');
const { create, list, remove } = ctrl;

// ---- Helper req/res ----
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

// ====================== CREATE ======================
describe('POST /api/akun-kas - create', () => {
  test('400 jika validasi gagal (nama kosong / saldo_awal & saldo_akhir bukan angka)', async () => {
    let res = makeRes();
    await create(makeReq({ body: { nama: '' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);

    res = makeRes();
    await create(makeReq({ body: { nama: 'Kas A', saldo_awal: 'abc' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);

    res = makeRes();
    await create(makeReq({ body: { nama: 'Kas A', saldo_akhir: 'xyz' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('500 jika createAkunKas error', async () => {
    supabaseMock.__setKlasterId(10);
    model.createAkunKas.mockResolvedValue({ data: null, error: new Error('insert fail') });

    const res = makeRes();
    await create(makeReq({
      body: { nama: 'Kas A', deskripsi: 'Desc', saldo_awal: 1000 },
      user: { user_id: 'u-1', role: 'user' },
    }), res);

    expect(model.createAkunKas).toHaveBeenCalledWith(expect.objectContaining({
      nama: 'Kas A',
      deskripsi: 'Desc',
      saldo_awal: 1000,
      saldo_akhir: undefined,
      owner_user_id: 'u-1',
      owner_klaster_id: 10,
    }));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Gagal membuat akun kas' }));
  });

  test('201 jika sukses (saldo_awal default 0, saldo_akhir optional)', async () => {
    supabaseMock.__setKlasterId(null);
    model.createAkunKas.mockResolvedValue({
      data: { akun_id: 7, nama: 'Kas B' },
      error: null,
    });

    const res = makeRes();
    await create(makeReq({
      body: { nama: 'Kas B' }, // saldo_awal default 0
      user: { user_id: 'u-1', role: 'user' },
    }), res);

    expect(model.createAkunKas).toHaveBeenCalledWith(expect.objectContaining({
      nama: 'Kas B',
      saldo_awal: 0,
      saldo_akhir: undefined,
      owner_user_id: 'u-1',
      owner_klaster_id: null,
    }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Akun kas dibuat',
      data: { akun_id: 7, nama: 'Kas B' },
    });
  });

  test('201 jika sukses dengan saldo_akhir dikirim', async () => {
    model.createAkunKas.mockResolvedValue({ data: { akun_id: 9, nama: 'Kas C' }, error: null });

    const res = makeRes();
    await create(makeReq({
      body: { nama: 'Kas C', saldo_awal: 500, saldo_akhir: 800 },
      user: { user_id: 'u-1', role: 'user' },
    }), res);

    expect(model.createAkunKas).toHaveBeenCalledWith(expect.objectContaining({
      saldo_awal: 500,
      saldo_akhir: 800,
    }));
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

// ====================== LIST ======================
describe('GET /api/akun-kas - list', () => {
  test('200: mengembalikan page/limit/total/data (count tersedia)', async () => {
    supabaseMock.__setKlasterId(5);
    model.listAkunKasVisible.mockResolvedValue({
      data: [{ akun_id: 1 }, { akun_id: 2 }],
      count: 15,
      error: null,
    });

    const res = makeRes();
    await list(makeReq({ query: { page: '2', limit: '5', search: 'kas' } }), res);

    expect(model.listAkunKasVisible).toHaveBeenCalledWith({
      search: 'kas',
      page: 2,
      limit: 5,
      viewer_user_id: 'u-1',
      viewer_klaster_id: 5,
    });
    expect(res.json).toHaveBeenCalledWith({
      page: 2,
      limit: 5,
      total: 15,
      data: [{ akun_id: 1 }, { akun_id: 2 }],
    });
  });

  test('total fallback ke data.length ketika count null', async () => {
    model.listAkunKasVisible.mockResolvedValue({
      data: [{ akun_id: 1 }],
      count: null,
      error: null,
    });

    const res = makeRes();
    await list(makeReq({ query: {} }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ total: 1 }));
  });

  test('500 jika listAkunKasVisible error', async () => {
    model.listAkunKasVisible.mockResolvedValue({ data: null, count: null, error: new Error('boom') });

    const res = makeRes();
    await list(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Gagal mengambil akun kas' }));
  });
});

// ====================== REMOVE ======================
describe('DELETE /api/akun-kas/:id - remove', () => {
  test('400 jika param id invalid', async () => {
    const res = makeRes();
    await remove(makeReq({ params: { id: 'abc' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('404 jika akun kas tidak ditemukan', async () => {
    model.getAkunKasById.mockResolvedValue({ data: null, error: null });
    const res = makeRes();
    await remove(makeReq({ params: { id: '7' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('403 jika bukan pemilik/klaster dan bukan admin', async () => {
    model.getAkunKasById.mockResolvedValue({
      data: { akun_id: 9, user_id: 'u-x', klaster_id: 99 },
      error: null,
    });
    supabaseMock.__setKlasterId(7);

    const res = makeRes();
    await remove(makeReq({ params: { id: '9' }, user: { user_id: 'u-1', role: 'user' } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('admin boleh hapus meski bukan owner/klaster', async () => {
    model.getAkunKasById.mockResolvedValue({
      data: { akun_id: 9, user_id: 'u-x', klaster_id: 99 },
      error: null,
    });
    model.deleteAkunKasById.mockResolvedValue({ error: null });

    const res = makeRes();
    await remove(makeReq({ params: { id: '9' }, user: { user_id: 'u-1', role: 'admin' } }), res);
    expect(res.json).toHaveBeenCalledWith({ message: 'Akun kas dihapus' });
  });

  test('pemilik langsung boleh hapus', async () => {
    model.getAkunKasById.mockResolvedValue({
      data: { akun_id: 11, user_id: 'u-1', klaster_id: null },
      error: null,
    });
    model.deleteAkunKasById.mockResolvedValue({ error: null });

    const res = makeRes();
    await remove(makeReq({ params: { id: '11' }, user: { user_id: 'u-1', role: 'user' } }), res);
    expect(res.json).toHaveBeenCalledWith({ message: 'Akun kas dihapus' });
  });

  test('anggota 1 klaster boleh hapus', async () => {
    model.getAkunKasById.mockResolvedValue({
      data: { akun_id: 12, user_id: 'u-x', klaster_id: 7 },
      error: null,
    });
    supabaseMock.__setKlasterId(7);
    model.deleteAkunKasById.mockResolvedValue({ error: null });

    const res = makeRes();
    await remove(makeReq({ params: { id: '12' }, user: { user_id: 'u-1', role: 'user' } }), res);
    expect(res.json).toHaveBeenCalledWith({ message: 'Akun kas dihapus' });
  });

  test('500 jika deleteAkunKasById error', async () => {
    model.getAkunKasById.mockResolvedValue({
      data: { akun_id: 13, user_id: 'u-1', klaster_id: null },
      error: null,
    });
    model.deleteAkunKasById.mockResolvedValue({ error: new Error('del fail') });

    const res = makeRes();
    await remove(makeReq({ params: { id: '13' }, user: { user_id: 'u-1', role: 'user' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Gagal hapus akun kas' }));
  });
});
