// src/routes/akun_kas.js
import express from 'express';
import { authRequired } from '../middlewares/auth.js';
import { create, list, remove, update } from '../controllers/akun_kas_controller.js';

const router = express.Router();

// CREATE akun kas (login)
// body: { nama, deskripsi?, saldo_awal?, saldo_akhir? }
router.post('/', authRequired, create);

// LIST akun kas yang visible (milik user/klaster) — login
// query: ?page=&limit=&search=
router.get('/', authRequired, list);

// DELETE akun kas by id (owner/klaster/admin)
router.delete('/:id', authRequired, remove);

// Patch
router.patch('/:id', authRequired, update);


export default router;

/**
 * @openapi
 * components:
 *   schemas:
 *     AkunKas:
 *       type: object
 *       properties:
 *         akun_id:
 *           type: integer
 *           example: 2
 *         nama:
 *           type: string
 *           example: Kas Besar
 *         deskripsi:
 *           type: string
 *           nullable: true
 *           example: Laci toko utama
 *         saldo_awal:
 *           type: integer
 *           example: 1500000
 *         saldo_akhir:
 *           type: integer
 *           example: 1700000
 *         user_id:
 *           type: string
 *           format: uuid
 *           nullable: true
 *         klaster_id:
 *           type: integer
 *           nullable: true
 *         created_at:
 *           type: string
 *           example: 2025-09-07T03:21:00.000Z
 */

/**
 * @openapi
 * /akun-kas:
 *   get:
 *     summary: List akun kas (scoped ke user/klaster)
 *     description: Mengembalikan daftar akun kas yang dimiliki user atau klasternya.
 *     security:
 *       - BearerAuth: []
 *     tags:
 *       - Akun Kas
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 100
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           example: kas
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 total:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AkunKas'
 *       401:
 *         description: Unauthorized
 *   post:
 *     summary: Buat akun kas
 *     security:
 *       - BearerAuth: []
 *     tags:
 *       - Akun Kas
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nama]
 *             properties:
 *               nama:
 *                 type: string
 *                 example: Kas Besar
 *               deskripsi:
 *                 type: string
 *                 nullable: true
 *                 example: Laci toko utama
 *               saldo_awal:
 *                 type: integer
 *                 example: 1500000
 *               saldo_akhir:
 *                 type: integer
 *                 description: Jika tidak diisi, otomatis diset sama dengan saldo_awal
 *                 example: 1500000
 *     responses:
 *       201:
 *         description: Akun kas dibuat
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Akun kas dibuat
 *                 data:
 *                   $ref: '#/components/schemas/AkunKas'
 *       400:
 *         description: Validasi gagal
 *       401:
 *         description: Unauthorized
 */

/**
 * @openapi
 * /akun-kas/{id}:
 *   delete:
 *     summary: Hapus akun kas
 *     description: Hanya pemilik/klaster terkait atau admin/superadmin yang dapat menghapus.
 *     security:
 *       - BearerAuth: []
 *     tags:
 *       - Akun Kas
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           example: 2
 *     responses:
 *       200:
 *         description: Akun kas dihapus
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Akun kas dihapus
 *       400:
 *         description: Param id tidak valid
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (bukan pemilik/klaster/admin)
 *       404:
 *         description: Tidak ditemukan
 */
