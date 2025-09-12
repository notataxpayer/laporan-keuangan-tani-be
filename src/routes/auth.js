// src/routes/auth.js
import express from 'express';
import { randomUUID } from 'crypto';
import supabase from '../config/supabase.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { signToken, authRequired } from '../middlewares/auth.js';

const router = express.Router();

/**
 * REGISTER
 */
router.post('/register', async (req, res) => {
  const { nama, email, nomor_telepon, password, role = 'user', klaster_id = null } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'email & password wajib diisi' });
  }

  // Cek email (dupe check #1)
  const { data: existingemail, error: errCheckemail } = await supabase
    .from('User')
    .select('user_id')
    .eq('email', email)
    .maybeSingle();

  if (errCheckemail) {
    return res.status(500).json({ message: 'Gagal cek email', detail: errCheckemail.message });
  }
  if (existingemail) {
    return res.status(409).json({ message: 'email sudah digunakan' });
  }

  // Cek email (dupe check #2 – tetap dipertahankan sesuai kode awalmu)
  const { data: existingEmail, error: errCheckEmail } = await supabase
    .from('User')
    .select('user_id')
    .eq('email', email)
    .maybeSingle();

  if (errCheckEmail) {
    return res.status(500).json({ message: 'Gagal cek email', detail: errCheckEmail.message });
  }
  if (existingEmail) {
    return res.status(409).json({ message: 'Email sudah digunakan' });
  }

  // Cek nomor telepon
  if (nomor_telepon) {
    const { data: existingPhone, error: errCheckPhone } = await supabase
      .from('User')
      .select('user_id')
      .eq('nomor_telepon', nomor_telepon)
      .maybeSingle();

    if (errCheckPhone) {
      return res.status(500).json({ message: 'Gagal cek nomor telepon', detail: errCheckPhone.message });
    }
    if (existingPhone) {
      return res.status(409).json({ message: 'Nomor telepon sudah digunakan' });
    }
  }

  const hashed = await hashPassword(password);
  const user_id = randomUUID();

  const { data, error } = await supabase
    .from('User')
    .insert([{ user_id, nama, email, nomor_telepon, password: hashed, role, klaster_id }])
    .select('user_id, nama, email, nomor_telepon, role, klaster_id, created_at')
    .single();

  if (error) {
    return res.status(500).json({ message: 'Gagal membuat user', detail: error.message });
  }

  const token = signToken({ user_id, email, role, klaster_id });
  return res.status(201).json({ token, user: data });
});

/**
 * LOGIN
 * body: { identifier (email atau no. telepon), password }
 */
router.post('/login', async (req, res) => {
  const { identifier, password } = req.body || {};
  if (!identifier || !password) {
    return res.status(400).json({ message: 'Email/No. Telepon & password wajib diisi' });
  }

  const isEmail = identifier.includes('@');

  const { data: user, error } = await supabase
    .from('User')
    .select('user_id, nama, email, password, nomor_telepon, role, klaster_id, created_at')
    .eq(isEmail ? 'email' : 'nomor_telepon', identifier)
    .single();

  if (error || !user) {
    return res.status(401).json({ message: 'Email/Nomor Telepon atau password salah' });
  }

  const ok = await comparePassword(password, user.password);
  if (!ok) {
    return res.status(401).json({ message: 'Email/Nomor Telepon atau password salah' });
  }

  const token = signToken({
    user_id: user.user_id,
    nomor_telepon: user.nomor_telepon,
    email: user.email,
    role: user.role,
    klaster_id: user.klaster_id
  });

  delete user.password;

  return res.json({ token, user });
});

/**
 * ME (cek profil dari token)
 * header: Authorization: Bearer <token>
 */
router.get('/me', authRequired, async (req, res) => {
  const { data, error } = await supabase
    .from('User')
    .select(`
      user_id,
      nama,
      email,
      role,
      klaster_id,
      created_at,
      nomor_telepon,
      klaster:klaster_id ( klaster_id, nama_klaster )
    `)
    .eq('user_id', req.user.user_id)
    .single();

  if (error || !data) {
    return res.status(404).json({ message: 'User tidak ditemukan' });
  }

  // flatten nama_klaster
  const user = {
    ...data,
    nama_klaster: data.klaster?.nama_klaster ?? null,
  };
  delete user.klaster;

  return res.json({ user });
});


/**
 * UPDATE PROFIL SAYA
 * PATCH /auth/me
 * body (opsional): { nama, email, nomor_telepon }
 * - Non-admin tidak bisa ubah role/klaster di sini.
 * - Email & nomor_telepon dicek unik (kecuali milik diri sendiri).
 * - Jika email berubah, token baru akan diterbitkan.
 */
router.patch('/me', authRequired, async (req, res) => {
  try {
    const { nama, email, nomor_telepon, klaster_id } = req.body || {};
    const payload = {};

    // --- nama ---
    if (nama !== undefined) {
      const trimmed = String(nama).trim();
      if (!trimmed) return res.status(400).json({ message: 'nama tidak boleh kosong' });
      payload.nama = trimmed;
    }

    // --- email (unik, bukan milik sendiri) ---
    if (email !== undefined) {
      const trimmed = String(email).trim();
      if (!trimmed) return res.status(400).json({ message: 'email tidak boleh kosong' });

      const { data: dupeEmail, error: e1 } = await supabase
        .from('User')
        .select('user_id')
        .eq('email', trimmed)
        .neq('user_id', req.user.user_id)
        .maybeSingle();
      if (e1) return res.status(500).json({ message: 'Gagal cek email', detail: e1.message });
      if (dupeEmail) return res.status(409).json({ message: 'Email sudah digunakan' });

      payload.email = trimmed;
    }

    // --- nomor_telepon (unik, bukan milik sendiri) ---
    if (nomor_telepon !== undefined) {
      const trimmed = String(nomor_telepon).trim();
      if (!trimmed) return res.status(400).json({ message: 'nomor_telepon tidak boleh kosong' });

      const { data: dupePhone, error: e2 } = await supabase
        .from('User')
        .select('user_id')
        .eq('nomor_telepon', trimmed)
        .neq('user_id', req.user.user_id)
        .maybeSingle();
      if (e2) return res.status(500).json({ message: 'Gagal cek nomor telepon', detail: e2.message });
      if (dupePhone) return res.status(409).json({ message: 'Nomor telepon sudah digunakan' });

      payload.nomor_telepon = trimmed;
    }

    // --- klaster_id (hanya admin/superadmin) ---
    if (klaster_id !== undefined) {
      const isAdm = ['admin', 'superadmin'].includes(String(req.user?.role || '').toLowerCase());
      if (!isAdm) {
        return res.status(403).json({ message: 'Forbidden: kamu tidak boleh mengubah klaster' });
      }

      const target = klaster_id === null ? null : Number(klaster_id);
      if (target !== null && Number.isNaN(target)) {
        return res.status(400).json({ message: 'klaster_id harus angka atau null' });
      }

      if (target !== null) {
        const { data: kl, error: kErr } = await supabase
          .from('klaster')
          .select('klaster_id')
          .eq('klaster_id', target)
          .maybeSingle();

        if (kErr) return res.status(500).json({ message: 'Gagal cek klaster', detail: kErr.message });
        if (!kl) return res.status(404).json({ message: 'Klaster tidak ditemukan' });
      }

      payload.klaster_id = target;
    }

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ message: 'Tidak ada field yang diupdate' });
    }

    const { data: updated, error: updErr } = await supabase
      .from('User')
      .update(payload)
      .eq('user_id', req.user.user_id)
      .select('user_id, nama, email, nomor_telepon, role, klaster_id, created_at')
      .single();

    if (updErr) {
      return res.status(500).json({ message: 'Gagal mengupdate profil', detail: updErr.message });
    }

    // re-issue token agar klaster_id/email/telepon terbaru ikut
    const token = signToken({
      user_id: updated.user_id,
      email: updated.email,
      nomor_telepon: updated.nomor_telepon,
      role: updated.role,
      klaster_id: updated.klaster_id,
    });

    return res.json({ message: 'Profil diperbarui', token, user: updated });
  } catch (e) {
    return res.status(500).json({ message: 'Internal error', detail: String(e?.message || e) });
  }
});


/**
 * GANTI PASSWORD
 * PATCH /auth/me/password
 * body: { old_password, new_password }
 */
router.patch('/me/password', authRequired, async (req, res) => {
  try {
    const { old_password, new_password } = (req.body || {});

    if (!old_password || !new_password) {
      return res.status(400).json({ message: 'old_password dan new_password wajib diisi' });
    }
    if (String(new_password).length < 8) {
      return res.status(400).json({ message: 'new_password minimal 8 karakter' });
    }

    // ambil password hash lama
    const { data: user, error: selErr } = await supabase
      .from('User')
      .select('user_id, password')
      .eq('user_id', req.user.user_id)
      .single();

    if (selErr || !user) {
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }

    const ok = await comparePassword(String(old_password), String(user.password));
    if (!ok) {
      return res.status(401).json({ message: 'Password lama salah' });
    }

    const hashed = await hashPassword(String(new_password));

    const { error: updErr } = await supabase
      .from('User')
      .update({ password: hashed })
      .eq('user_id', req.user.user_id);

    if (updErr) {
      return res.status(500).json({ message: 'Gagal mengganti password', detail: updErr.message });
    }

    return res.json({ message: 'Password berhasil diganti' });
  } catch (e) {
    return res.status(500).json({ message: 'Internal error', detail: String(e?.message || e) });
  }
});

export default router;

// Swagger docs
/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Register user baru
 *     description: Membuat user baru. Email wajib unik. Nomor telepon opsional namun bila diisi harus unik.
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               nama:
 *                 type: string
 *                 example: Budi
 *               email:
 *                 type: string
 *                 format: email
 *                 example: budi@example.com
 *               nomor_telepon:
 *                 type: string
 *                 nullable: true
 *                 example: "081234567890"
 *               password:
 *                 type: string
 *                 example: rahasia123
 *               role:
 *                 type: string
 *                 enum: [user, admin, superadmin]
 *                 default: user
 *               klaster_id:
 *                 type: integer
 *                 nullable: true
 *     responses:
 *       201:
 *         description: User dibuat
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     user_id:
 *                       type: string
 *                       format: uuid
 *                     nama:
 *                       type: string
 *                     email:
 *                       type: string
 *                       format: email
 *                     nomor_telepon:
 *                       type: string
 *                       nullable: true
 *                     role:
 *                       type: string
 *                       enum: [user, admin, superadmin]
 *                     klaster_id:
 *                       type: integer
 *                       nullable: true
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: email & password wajib diisi
 *       409:
 *         description: Email/nomor telepon sudah digunakan
 *       500:
 *         description: Gagal membuat user
 */

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Login (email atau nomor telepon)
 *     description: Kirim **identifier** berisi email **atau** nomor telepon, beserta password.
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - identifier
 *               - password
 *             properties:
 *               identifier:
 *                 type: string
 *                 example: budi@example.com
 *                 description: Email atau nomor telepon (mis. "081234567890")
 *               password:
 *                 type: string
 *                 example: rahasia123
 *     responses:
 *       200:
 *         description: Login sukses
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     user_id:
 *                       type: string
 *                       format: uuid
 *                     nama:
 *                       type: string
 *                     email:
 *                       type: string
 *                       format: email
 *                     nomor_telepon:
 *                       type: string
 *                       nullable: true
 *                     role:
 *                       type: string
 *                       enum: [user, admin, superadmin]
 *                     klaster_id:
 *                       type: integer
 *                       nullable: true
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Email/No. Telepon & password wajib diisi
 *       401:
 *         description: Kredensial salah
 */

/**
 * @openapi
 * /auth/me:
 *   get:
 *     summary: Profil pengguna dari token
 *     security:
 *       - BearerAuth: []
 *     tags:
 *       - Auth
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     user_id:
 *                       type: string
 *                       format: uuid
 *                     nama:
 *                       type: string
 *                     email:
 *                       type: string
 *                       format: email
 *                     role:
 *                       type: string
 *                       enum: [user, admin, superadmin]
 *                     klaster_id:
 *                       type: integer
 *                       nullable: true
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized (token hilang/invalid)
 *       404:
 *         description: User tidak ditemukan
 */

