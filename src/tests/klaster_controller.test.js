// src/controllers/klaster_controller.test.js
import { jest } from '@jest/globals';

/* ========================= Mocks ========================= */

// --- Mock supabase ONLY untuk remove() yang memanggil update('User') ---
let __resetMembersError = null;
let __lastUpdate = null;

class UpdateQB {
  constructor(table) { this.table = table; this._payload = null; this._eq = null; }
  update(payload) { this._payload = payload; __lastUpdate = { table: this.table, payload }; return this; }
  eq(field, val)  {
    this._eq = { field, val };
    // hasil akhir await chain
    if (__resetMembersError) return Promise.resolve({ data: null, error: __resetMembersError });
    return Promise.resolve({ data: { updated: true, where: this._eq }, error: null });
  }
}

jest.unstable_mockModule('../config/supabase.js', () => ({
  __setResetMembersError: (e) => { __resetMembersError = e; },
  __getLastUpdate: () => __lastUpdate,
  default: {
    from: (table) => new UpdateQB(table),
  },
}));

// --- Mock model functions yang dipakai controller ---
const model = {
  createCluster:      jest.fn(),
  getClusterById:     jest.fn(),
  listClusters:       jest.fn(),
  updateCluster:      jest.fn(),
  deleteCluster:      jest.fn(),
  setUserCluster:     jest.fn(),
  getUsersInCluster:  jest.fn(),
};

jest.unstable_mockModule('../models/klaster_model.js', () => ({
  createCluster:     model.createCluster,
  getClusterById:    model.getClusterById,
  listClusters:      model.listClusters,
  updateCluster:     model.updateCluster,
  deleteCluster:     model.deleteCluster,
  setUserCluster:    model.setUserCluster,
  getUsersInCluster: model.getUsersInCluster,
}));

// Import controller setelah semua mock siap
const supabaseMock = await import('../config/supabase.js');
const ctrl = await import('../controllers/klaster_controller.js');
const {
  create,
  list,
  myCluster,
  detail,
  update,
  remove,
} = ctrl;

/* ========================= Helpers ========================= */

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json:   jest.fn().mockReturnThis(),
  };
}
function makeReq({
  body = {},
  query = {},
  params = {},
  user = { user_id: 'u-1', role: 'user', klaster_id: null },
} = {}) {
  return { body, query, params, user };
}

beforeEach(() => {
  jest.clearAllMocks();
  supabaseMock.__setResetMembersError(null);
});

/* ========================= Tests ========================= */

// --------- create ----------
describe('POST /api/klaster - create', () => {
  test('403 jika bukan admin/superadmin', async () => {
    const res = makeRes();
    await create(makeReq({ user: { user_id: 'u-1', role: 'user' } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('400 jika nama_klaster kosong', async () => {
    const res = makeRes();
    await create(makeReq({ user: { user_id: 'u-1', role: 'admin' }, body: { nama_klaster: '' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('409 jika admin sudah punya klaster', async () => {
    const res = makeRes();
    await create(makeReq({ user: { user_id: 'u-1', role: 'admin', klaster_id: 9 }, body: { nama_klaster: 'Tim A' } }), res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('500 jika createCluster error', async () => {
    model.createCluster.mockResolvedValue({ data: null, error: new Error('insert fail') });
    const res = makeRes();
    await create(makeReq({ user: { user_id: 'u-1', role: 'admin' }, body: { nama_klaster: 'Tim A' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('500 jika setUserCluster gagal', async () => {
    model.createCluster.mockResolvedValue({ data: { klaster_id: 7, nama_klaster: 'Tim A' }, error: null });
    model.setUserCluster.mockResolvedValue({ error: new Error('link fail') });
    const res = makeRes();
    await create(makeReq({ user: { user_id: 'u-1', role: 'admin' }, body: { nama_klaster: 'Tim A' } }), res);
    expect(model.setUserCluster).toHaveBeenCalledWith('u-1', 7);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('201 sukses', async () => {
    model.createCluster.mockResolvedValue({ data: { klaster_id: 7, nama_klaster: 'Tim A' }, error: null });
    model.setUserCluster.mockResolvedValue({ error: null });
    const res = makeRes();
    await create(makeReq({ user: { user_id: 'u-1', role: 'admin' }, body: { nama_klaster: 'Tim A' } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ message: 'Klaster dibuat', data: { klaster_id: 7, nama_klaster: 'Tim A' } });
  });
});

// --------- list ----------
describe('GET /api/klaster - list', () => {
  test('user biasa tanpa klaster: data kosong', async () => {
    const res = makeRes();
    await list(makeReq({ user: { user_id: 'u-1', role: 'user', klaster_id: null } }), res);
    expect(res.json).toHaveBeenCalledWith({ page: 1, limit: 1, total: 0, data: [] });
  });

  test('user biasa dengan klaster: kembalikan klasternya kalau ada', async () => {
    model.getClusterById.mockResolvedValue({ data: { klaster_id: 5, nama_klaster: 'Alpha' }, error: null });
    const res = makeRes();
    await list(makeReq({ user: { user_id: 'u-1', role: 'user', klaster_id: 5 } }), res);
    expect(res.json).toHaveBeenCalledWith({ page: 1, limit: 1, total: 1, data: [{ klaster_id: 5, nama_klaster: 'Alpha' }] });
  });

  test('admin: gunakan pagination & search; 500 jika error', async () => {
    model.listClusters.mockResolvedValue({ data: null, error: new Error('boom'), count: null });
    const res = makeRes();
    await list(makeReq({ user: { user_id: 'u-1', role: 'admin' }, query: { page: '2', limit: '5', search: 'al' } }), res);
    expect(model.listClusters).toHaveBeenCalledWith({ page: 2, limit: 5, search: 'al' });
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('admin: sukses', async () => {
    model.listClusters.mockResolvedValue({
      data: [{ klaster_id: 1 }, { klaster_id: 2 }],
      count: 10,
      error: null,
    });
    const res = makeRes();
    await list(makeReq({ user: { user_id: 'u-1', role: 'admin' }, query: { page: '2', limit: '5', search: '' } }), res);
    expect(res.json).toHaveBeenCalledWith({ page: 2, limit: 5, total: 10, data: [{ klaster_id: 1 }, { klaster_id: 2 }] });
  });
});

// --------- myCluster ----------
describe('GET /api/klaster/me - myCluster', () => {
  test('404 jika user belum tergabung klaster', async () => {
    const res = makeRes();
    await myCluster(makeReq({ user: { user_id: 'u-1', role: 'user', klaster_id: null } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('404 jika klaster tidak ditemukan', async () => {
    model.getClusterById.mockResolvedValue({ data: null, error: null });
    const res = makeRes();
    await myCluster(makeReq({ user: { user_id: 'u-1', role: 'user', klaster_id: 9 } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('500 jika getUsersInCluster error', async () => {
    model.getClusterById.mockResolvedValue({ data: { klaster_id: 9, nama_klaster: 'Beta' }, error: null });
    model.getUsersInCluster.mockResolvedValue({ data: null, error: new Error('members fail') });
    const res = makeRes();
    await myCluster(makeReq({ user: { user_id: 'u-1', role: 'user', klaster_id: 9 } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('200 sukses', async () => {
    model.getClusterById.mockResolvedValue({ data: { klaster_id: 9, nama_klaster: 'Beta' }, error: null });
    model.getUsersInCluster.mockResolvedValue({ data: [{ user_id: 'u-1' }], error: null });
    const res = makeRes();
    await myCluster(makeReq({ user: { user_id: 'u-1', role: 'user', klaster_id: 9 } }), res);
    expect(res.json).toHaveBeenCalledWith({ klaster: { klaster_id: 9, nama_klaster: 'Beta' }, members: [{ user_id: 'u-1' }] });
  });
});

// --------- detail ----------
describe('GET /api/klaster/:id - detail', () => {
  test('400 jika param id invalid', async () => {
    const res = makeRes();
    await detail(makeReq({ params: { id: 'abc' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('403 jika user biasa akses klaster lain', async () => {
    const res = makeRes();
    await detail(makeReq({ params: { id: '7' }, user: { user_id: 'u-1', role: 'user', klaster_id: 9 } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('404 jika klaster tidak ditemukan', async () => {
    model.getClusterById.mockResolvedValue({ data: null, error: null });
    const res = makeRes();
    await detail(makeReq({ params: { id: '7' }, user: { user_id: 'u-1', role: 'admin' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('500 jika getUsersInCluster error', async () => {
    model.getClusterById.mockResolvedValue({ data: { klaster_id: 7, nama_klaster: 'G' }, error: null });
    model.getUsersInCluster.mockResolvedValue({ data: null, error: new Error('members fail') });
    const res = makeRes();
    await detail(makeReq({ params: { id: '7' }, user: { user_id: 'u-1', role: 'admin' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('200 sukses', async () => {
    model.getClusterById.mockResolvedValue({ data: { klaster_id: 7, nama_klaster: 'G' }, error: null });
    model.getUsersInCluster.mockResolvedValue({ data: [{ user_id: 'u-2' }], error: null });
    const res = makeRes();
    await detail(makeReq({ params: { id: '7' }, user: { user_id: 'u-1', role: 'admin' } }), res);
    expect(res.json).toHaveBeenCalledWith({ klaster: { klaster_id: 7, nama_klaster: 'G' }, members: [{ user_id: 'u-2' }] });
  });
});

// --------- update ----------
describe('PATCH /api/klaster/:id - update', () => {
  test('403 jika bukan admin/superadmin', async () => {
    const res = makeRes();
    await update(makeReq({ user: { user_id: 'u-1', role: 'user' }, params: { id: '5' }, body: { nama_klaster: 'X' } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('400 jika id invalid', async () => {
    const res = makeRes();
    await update(makeReq({ user: { role: 'admin' }, params: { id: 'abc' }, body: { nama_klaster: 'X' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('400 jika tidak ada field yang diupdate', async () => {
    const res = makeRes();
    await update(makeReq({ user: { role: 'admin' }, params: { id: '5' }, body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('400 jika nama_klaster kosong', async () => {
    const res = makeRes();
    await update(makeReq({ user: { role: 'admin' }, params: { id: '5' }, body: { nama_klaster: '   ' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('500 jika updateCluster error', async () => {
    model.updateCluster.mockResolvedValue({ data: null, error: new Error('upd fail') });
    const res = makeRes();
    await update(makeReq({ user: { role: 'admin' }, params: { id: '5' }, body: { nama_klaster: 'Baru' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('200 sukses', async () => {
    model.updateCluster.mockResolvedValue({ data: { klaster_id: 5, nama_klaster: 'Baru' }, error: null });
    const res = makeRes();
    await update(makeReq({ user: { role: 'admin' }, params: { id: '5' }, body: { nama_klaster: 'Baru' } }), res);
    expect(res.json).toHaveBeenCalledWith({ message: 'Klaster diupdate', data: { klaster_id: 5, nama_klaster: 'Baru' } });
  });
});

// --------- remove ----------
describe('DELETE /api/klaster/:id - remove', () => {
  test('403 jika bukan admin/superadmin', async () => {
    const res = makeRes();
    await remove(makeReq({ user: { role: 'user' }, params: { id: '7' } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('400 jika id invalid', async () => {
    const res = makeRes();
    await remove(makeReq({ user: { role: 'admin' }, params: { id: 'abc' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('500 jika reset anggota (update User set klaster_id=null) error', async () => {
    supabaseMock.__setResetMembersError(new Error('reset fail'));
    const res = makeRes();
    await remove(makeReq({ user: { role: 'admin' }, params: { id: '7' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('500 jika deleteCluster error', async () => {
    model.deleteCluster.mockResolvedValue({ error: new Error('del fail') });
    const res = makeRes();
    await remove(makeReq({ user: { role: 'admin' }, params: { id: '7' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('200 sukses hapus', async () => {
    model.deleteCluster.mockResolvedValue({ error: null });
    const res = makeRes();
    await remove(makeReq({ user: { role: 'superadmin' }, params: { id: '7' } }), res);

    // Pastikan supabase update dipanggil ke table 'User' dengan payload { klaster_id: null } dan eq('klaster_id', 7)
    const last = supabaseMock.__getLastUpdate();
    expect(last).toEqual({ table: 'User', payload: { klaster_id: null } });
    expect(res.json).toHaveBeenCalledWith({ message: 'Klaster dihapus' });
  });
});
