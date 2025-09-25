// src/routes/neraca.js
import express from 'express';
import { authRequired } from '../middlewares/auth.js';
import {
  getNeracaSummary,
  getNeracaDetails,
  getNeracaByProduk,
} from '../controllers/neraca_controller.js';

const router = express.Router();

// --- ORDER MATTERS ---
// 1) Cluster routes (lebih spesifik) harus dideklarasikan lebih dulu
router.get('/summary/cluster/:klasterId',   authRequired, getNeracaSummary);
router.get('/details/cluster/:klasterId',   authRequired, getNeracaDetails);
router.get('/by-produk/cluster/:klasterId', authRequired, getNeracaByProduk);

// 2) Rute tanpa param → pakai user yang sedang login (default)
router.get('/summary', authRequired, getNeracaSummary);

// 3) Rute berdasarkan userId eksplisit (admin/superadmin saja)
router.get('/summary/user/:userId', authRequired, getNeracaSummary);

// Details & by-produk (scope user saat ini by default)
router.get('/details',    authRequired, getNeracaDetails);
router.get('/by-produk',  authRequired, getNeracaByProduk);

export default router;


/**
 * @openapi
 * tags:
 *   - name: Neraca
 *
 * /neraca/summary:
 *   get:
 *     summary: Rekap neraca per kelompok + detail produk ringkas
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Neraca]
 *     parameters:
 *       - in: query
 *         name: start
 *         schema: { type: string, example: '2025-09-01' }
 *       - in: query
 *         name: end
 *         schema: { type: string, example: '2025-10-01' }
 *       - in: query
 *         name: id_user
 *         schema: { type: string, format: uuid }
 *         description: Hanya admin/superadmin; filter user lain.
 *     responses:
 *       200: { description: OK }
 *
 * /neraca/details:
 *   get:
 *     summary: Daftar produk dalam satu bucket neraca (dengan agregat)
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Neraca]
 *     parameters:
 *       - in: query
 *         name: bucket
 *         required: true
 *         schema:
 *           type: string
 *           enum: [aset_lancar, aset_tetap, kewajiban_lancar, kewajiban_jangka_panjang]
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, minimum: 1, maximum: 100 }
 *     responses:
 *       200: { description: OK }
 *
 * /neraca/by-produk:
 *   get:
 *     summary: Agregasi neraca per produk (lintas bucket)
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Neraca]
 *     responses:
 *       200: { description: OK }
 */
