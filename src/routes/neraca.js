// src/routes/neraca.js
import express from 'express';
import { authRequired } from '../middlewares/auth.js';
import {
  getNeracaSummary,
  getNeracaDetails,
  getNeracaByProduk,
} from '../controllers/neraca_controller.js';

const router = express.Router();

router.get('/summary', authRequired, getNeracaSummary);
router.get('/details', authRequired, getNeracaDetails);
router.get('/by-produk', authRequired, getNeracaByProduk);

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
