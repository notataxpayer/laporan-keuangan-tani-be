import express from 'express';
import supabase from '../config/supabase.js';
import authRoutes from './auth.js';
import produkRoutes from './produk.js';
import financeRoutes from './finance.js';
import kategoriRoutes from './kategori.js';

const router = express.Router();


router.use('/auth', authRoutes);
router.use('/produk', produkRoutes);
router.use('/keuangan', financeRoutes);
router.use('/kategori', kategoriRoutes);

export default router;
