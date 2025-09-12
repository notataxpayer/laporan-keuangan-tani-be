import express from 'express';
import { randomUUID } from 'crypto';
import supabase from '../config/supabase.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { signToken, authRequired } from '../middlewares/auth.js';

const router = express.Router();

router.post('/register', async (req, res) => {
  const { nama, email, nomor_telepon, password, role = 'user', klaster_id = null } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'email & password wajib diisi' });
  }

  // Cek email
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

// Cek email
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
 * body: { email, password }
 */
router.post('/login', async (req, res) => {
  const { identifier, password } = req.body || {};
  if (!identifier || !password) {
    return res.status(400).json({ message: 'Email/No. Telepon & password wajib diisi' });
  }

  // Deteksi input apakah email atau nomor telepon
  const isEmail = identifier.includes('@');

  // Query ke Supabase
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

  // Generate token
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
  const { data: user, error } = await supabase
    .from('User')
    .select('user_id, nama, email, role, klaster_id, created_at')
    .eq('user_id', req.user.user_id)
    .single();

  if (error || !user) {
    return res.status(404).json({ message: 'User tidak ditemukan' });
  }
  return res.json({ user });
});

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



export default router;
