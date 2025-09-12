// src/tests/akun_kas_controller.test.js
import { jest } from '@jest/globals';

// --- Mock supabase: hanya handle tabel User untuk ambil klaster user ---
class UserBuilder {
  constructor() { this._userId = null; this._single = false; }
  select() { return this; }
  eq(col, val) { if (col === 'user_id') this._userId = String(val); return this; }
  single() { this._single = true; return this; }
  then(resolve) {
    // Map user -> klaster
    const map = { U1: 'K1', U9: 'K9' };
    const out = { data: { klaster_id: map[this._userId] ?? null }, error: null };
    resolve(out);
  }
}
await jest.unstable_mockModule('../config/supabase.js', () => ({
  __esModule: true,
  default: { from: (table) => {
    if (table === 'User') return new UserBuilder();
    throw new Error('Unexpected table: ' + table);
  }},
}));

// --- Mock model akun_kas (pakai jest.fn) ---
const model = {
  createAkunKas: jest.fn(),
  listAkunKasVisible: jest.fn(),
  getAkunKasById: jest.fn(),
  deleteAkunKasById: jest.fn(),
  updateAkunKasById: jest.fn(),
};
await jest.unstable_mockModule('../models/akun_kas_model.js', () => ({
  __esModule: true,
  ...model,
}));

// Import SUT setelah mock
const controller = await import('../controllers/akun_kas_controller.js');

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('akun_kas controller: update (minimal)', () => {
  test('share_to_klaster: true → set klaster_id ke klaster user', async () => {
    // Arrange
    model.getAkunKasById.mockResolvedValue({
      data: { id: 1, user_id: 'U1', klaster_id: null }, error: null
    });
    model.updateAkunKasById.mockResolvedValue({
      data: { id: 1, nama: 'Kas', klaster_id: 'K1' }, error: null
    });

    const req = {
      params: { id: '1' },
      body: { share_to_klaster: true, nama: 'Kas' },
      user: { user_id: 'U1', role: 'user' },
    };
    const res = mockRes();

    // Act
    await controller.update(req, res);

    // Assert
    expect(res.statusCode).toBe(200);
    expect(model.updateAkunKasById).toHaveBeenCalledWith(1, expect.objectContaining({ klaster_id: 'K1', nama: 'Kas' }));
    expect(res.body?.message).toBe('Akun kas diupdate');
  });

  test('non-owner & beda klaster → 403 dan tidak update', async () => {
    // U9 bukan owner, akun milik U1 dan klasternya K2; user U9 klasternya K9.
    model.getAkunKasById.mockResolvedValue({
      data: { id: 2, user_id: 'U1', klaster_id: 'K2' }, error: null
    });

    const req = {
      params: { id: '2' },
      body: { nama: 'Kas Mana Saja' },
      user: { user_id: 'U9', role: 'user' },
    };
    const res = mockRes();

    await controller.update(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body?.message).toMatch(/Forbidden/);
    expect(model.updateAkunKasById).not.toHaveBeenCalled();
  });
});
