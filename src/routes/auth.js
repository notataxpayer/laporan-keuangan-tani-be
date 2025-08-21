import express from 'express';
import { randomUUID } from 'crypto';
import supabase from '../config/supabase.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { signToken, authRequired } from '../middlewares/auth.js';

const router = express.Router();

/**
 * REGISTER
 * body: { nama?, username, password, role?, klaster_id? }
 * role default: 'user'
 */
router.post('/register', async (req, res) => {
  const { nama, username, password, role = 'user', klaster_id = null } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ message: 'username & password wajib diisi' });
  }

  // Cek duplikasi username
  const { data: existing, error: errCheck } = await supabase
    .from('User')
    .select('user_id')
    .eq('username', username)
    .maybeSingle();

  if (errCheck) {
    return res.status(500).json({ message: 'Gagal cek username', detail: errCheck.message });
  }
  if (existing) {
    return res.status(409).json({ message: 'Username sudah digunakan' });
  }

  const hashed = await hashPassword(password);
  const user_id = randomUUID();

  const { data, error } = await supabase
    .from('User')
    .insert([{ user_id, nama, username, password: hashed, role, klaster_id }])
    .select('user_id, nama, username, role, klaster_id, created_at')
    .single();

  if (error) {
    return res.status(500).json({ message: 'Gagal membuat user', detail: error.message });
  }

  const token = signToken({ user_id, username, role });
  return res.status(201).json({ token, user: data });
});

/**
 * LOGIN
 * body: { username, password }
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: 'username & password wajib diisi' });
  }

  const { data: user, error } = await supabase
    .from('User')
    .select('user_id, nama, username, password, role, klaster_id, created_at')
    .eq('username', username)
    .single();

  if (error || !user) {
    return res.status(401).json({ message: 'Username atau password salah' });
  }

  const ok = await comparePassword(password, user.password);
  if (!ok) return res.status(401).json({ message: 'Username atau password salah' });

  const token = signToken({ user_id: user.user_id, username: user.username, role: user.role });
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
    .select('user_id, nama, username, role, klaster_id, created_at')
    .eq('user_id', req.user.user_id)
    .single();

  if (error || !user) {
    return res.status(404).json({ message: 'User tidak ditemukan' });
  }
  return res.json({ user });
});

export default router;
