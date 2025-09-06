// src/routes/kategori.js
import express from 'express';
import { authRequired, roleGuard } from '../middlewares/auth.js';
import { create, list, remove } from '../controllers/kategori_controller.js';

const router = express.Router();

router.get('/', authRequired, list);
router.post('/', authRequired, create);
router.delete('/:id', authRequired, roleGuard('admin', 'superadmin'), remove);

// ----- Swagger -----
/**
 * @openapi
 * /kategori:
 *   get:
 *     summary: List kategori
 *     security:
 *       - BearerAuth: []
 *     tags: [Kategori]
 *     parameters:
 *       - in: query
 *         name: jenis
 *         schema:
 *           type: string
 *           enum: [pengeluaran, pemasukan, produk, pasar]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200: { description: OK }
 *   post:
 *     summary: Buat kategori
 *     security:
 *       - BearerAuth: []
 *     tags: [Kategori]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nama, jenis]
 *             properties:
 *               nama:
 *                 type: string
 *                 example: Setoran Modal
 *               jenis:
 *                 type: string
 *                 enum: [pengeluaran, pemasukan, produk, pasar]
 *     responses:
 *       201: { description: Kategori dibuat }
 *       400: { description: Validasi gagal }
 */
/**
 * @openapi
 * /kategori/{id}:
 *   delete:
 *     summary: Hapus kategori (admin/superadmin)
 *     security:
 *       - BearerAuth: []
 *     tags: [Kategori]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Kategori dihapus }
 *       404: { description: Tidak ditemukan }
 *       409: { description: Kategori sedang dipakai }
 */
export default router;
