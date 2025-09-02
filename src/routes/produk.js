// src/routes/produk.js
import express from 'express';
import { authRequired, roleGuard } from '../middlewares/auth.js';
import { create, list, detail, update, remove } from '../controllers/product_controller.js';

const router = express.Router();

// READ (list/detail) → cukup login
router.get('/', authRequired, list);
router.get('/:id', authRequired, detail);

// WRITE (create/update/delete) → admin/superadmin saja
router.post('/', authRequired, roleGuard('admin', 'superadmin'), create);
router.patch('/:id', authRequired, roleGuard('admin', 'superadmin'), update);
router.delete('/:id', authRequired, roleGuard('admin', 'superadmin'), remove);

// swagger docs
/**
 * @openapi
 * /produk:
 *   get:
 *     summary: List produk
 *     description: Mengembalikan daftar produk dengan pagination dan pencarian.
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Produk]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Cari berdasarkan nama produk (ILIKE).
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 10 }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 page:  { type: integer, example: 1 }
 *                 limit: { type: integer, example: 10 }
 *                 total: { type: integer, example: 42 }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Produk' }
 *       401: { description: Unauthorized }
 *   post:
 *     summary: Buat produk (admin/superadmin)
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Produk]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nama, harga]
 *             properties:
 *               nama: { type: string, example: "Beras IR64 Premium" }
 *               harga: { type: integer, example: 12000 }
 *               kategori_id: { type: integer, nullable: true, example: 1 }
 *     responses:
 *       201:
 *         description: Produk dibuat
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Produk dibuat" }
 *                 data:    { $ref: '#/components/schemas/Produk' }
 *       400: { description: Validasi gagal }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden (bukan admin/superadmin) }
 */

/**
 * @openapi
 * /produk/{id}:
 *   get:
 *     summary: Detail produk
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Produk]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { $ref: '#/components/schemas/Produk' }
 *       401: { description: Unauthorized }
 *       404: { description: Tidak ditemukan }
 *   patch:
 *     summary: Update produk (admin/superadmin)
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Produk]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nama: { type: string, example: "Beras IR64 Premium 5kg" }
 *               harga: { type: integer, example: 12500 }
 *               kategori_id: { type: integer, nullable: true, example: 1 }
 *     responses:
 *       200:
 *         description: Produk diupdate
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Produk diupdate" }
 *                 data:    { $ref: '#/components/schemas/Produk' }
 *       400: { description: Validasi gagal / ID tidak valid }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden (bukan admin/superadmin) }
 *       404: { description: Tidak ditemukan }
 *   delete:
 *     summary: Hapus produk (admin/superadmin)
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Produk]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Produk dihapus
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Produk dihapus" }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden (bukan admin/superadmin) }
 *       404: { description: Tidak ditemukan }
 */

export default router;
