import express from 'express';
import supabase from '../config/supabase.js';
import authRoutes from './auth.js';
import produkRoutes from './produk.js';
import financeRoutes from './finance.js';

const router = express.Router();

// Endpoint test koneksi Supabase
router.get('/ping', async (req, res) => {
  const { data, error } = await supabase.from('produk').select('*').limit(1);

  if (error) return res.status(500).json({ error: 'Koneksi gagal ke Supabase' });

  res.json({ message: 'pong', test_produk: data });
});

router.use('/auth', authRoutes);
router.use('/produk', produkRoutes);
router.use('/keuangan', financeRoutes);

export default router;
