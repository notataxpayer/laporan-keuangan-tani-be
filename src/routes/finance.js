// src/routes/finance.js
import express from 'express';
import { authRequired } from '../middlewares/auth.js';
import {
  createLaporan,
  listLaporanController,
  getLaporanDetail,
  deleteLaporanController,
  getLabaRugi,
} from '../controllers/finance_controller.js';

const router = express.Router();

// Buat laporan (user login) — data otomatis milik user tsb
router.post('/laporan', authRequired, createLaporan);

// List laporan
// - user biasa: hanya miliknya
// - admin/superadmin: bisa filter ?id_user=<uuid>
router.get('/laporan', authRequired, listLaporanController);

// Detail laporan (+items)
router.get('/laporan/:id', authRequired, getLaporanDetail);

// Hapus laporan (owner atau admin/superadmin)
router.delete('/laporan/:id', authRequired, deleteLaporanController);

// Laporan laba-rugi (debit=pemasukan, kredit=pengeluaran)
router.get('/laba-rugi', authRequired, getLabaRugi);

export default router;
