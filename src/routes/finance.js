// src/routes/finance.js
import express from 'express';
import { authRequired } from '../middlewares/auth.js';
import {
  createLaporan,
  listLaporanController,
  getLaporanDetail,
  deleteLaporanController,
  getLabaRugi,
  getArusKas,
  getNeraca,
  getArusKasByAkun
} from '../controllers/finance_controller.js';

const router = express.Router();

router.post('/laporan', authRequired, createLaporan);
router.get('/laporan', authRequired, listLaporanController);
router.get('/laporan/:id', authRequired, getLaporanDetail);
router.delete('/laporan/:id', authRequired, deleteLaporanController);
router.get('/laba-rugi', authRequired, getLabaRugi);
router.get('/arus-kas', authRequired, getArusKas);
router.get('/neraca', authRequired, getNeraca);
router.get('/arus-kas/akun', authRequired, getArusKasByAkun);

export default router;

/**
 * @openapi
 * components:
 *   schemas:
 *     DetailLaporanItem:
 *       type: object
 *       properties:
 *         produk_id:    { type: integer, example: 3 }
 *         jumlah:       { type: integer, example: 10 }
 *         harga_satuan: { type: integer, example: 12000, nullable: true }
 *         subtotal:     { type: integer, example: 120000, nullable: true }
 *     LaporanKeuangan:
 *       type: object
 *       properties:
 *         id_laporan:  { type: string, format: uuid }
 *         id_user:     { type: string, format: uuid }
 *         akun_id:     { type: integer, nullable: true }
 *         created_at:  { type: string }
 *         jenis:       { type: string, enum: [pemasukan, pengeluaran] }
 *         kategori_id: { type: integer }
 *         deskripsi:   { type: string, nullable: true }
 *         debit:       { type: integer }
 *         kredit:      { type: integer }
 */

/**
 * @openapi
 * /keuangan/laporan:
 *   get:
 *     summary: List laporan keuangan
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Keuangan]
 *     parameters:
 *       - in: query
 *         name: id_user
 *         schema: { type: string, format: uuid }
 *         description: Hanya admin/superadmin; filter milik user tertentu.
 *       - in: query
 *         name: jenis
 *         schema: { type: string, enum: [pemasukan, pengeluaran] }
 *       - in: query
 *         name: kategori_id
 *         schema: { type: integer }
 *       - in: query
 *         name: akun_id
 *         schema: { type: integer }
 *         description: Filter berdasarkan akun kas.
 *       - in: query
 *         name: start
 *         schema: { type: string, example: '2025-08-01' }
 *       - in: query
 *         name: end
 *         schema: { type: string, example: '2025-09-01' }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, minimum: 1, maximum: 100 }
 *     responses:
 *       200:
 *         description: OK
 *   post:
 *     summary: Buat laporan keuangan (debit=pemasukan, kredit=pengeluaran)
 *     description: |
 *       - Jenis pemasukan → isi `debit` > 0, `kredit` = 0.  
 *       - Jenis pengeluaran → isi `kredit` > 0, `debit` = 0.  
 *       - Items boleh kirim `harga_satuan` atau langsung `subtotal`. Total items harus sama dengan nilai debit/kredit.
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Keuangan]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [jenis, kategori_id]
 *             properties:
 *               akun_id:    { type: integer, nullable: true, example: 2 }
 *               jenis:      { type: string, enum: [pemasukan, pengeluaran] }
 *               kategori_id:{ type: integer, example: 7 }
 *               deskripsi:  { type: string, example: "Penjualan beras 10kg" }
 *               debit:      { type: integer, example: 200000 }
 *               kredit:     { type: integer, example: 0 }
 *               items:
 *                 type: array
 *                 items: { $ref: '#/components/schemas/DetailLaporanItem' }
 *     responses:
 *       201: { description: Laporan dibuat }
 */

/**
 * @openapi
 * /keuangan/laporan/{id}:
 *   get:
 *     summary: Detail laporan + items
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Keuangan]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *   delete:
 *     summary: Hapus laporan (reversal saldo akun otomatis)
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Keuangan]
 */

/**
 * @openapi
 * /keuangan/laba-rugi:
 *   get:
 *     summary: Laporan laba-rugi (debit=pemasukan, kredit=pengeluaran)
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Keuangan]
 *     parameters:
 *       - in: query
 *         name: start
 *         schema: { type: string, example: '2025-08-01' }
 *       - in: query
 *         name: end
 *         schema: { type: string, example: '2025-09-01' }
 *       - in: query
 *         name: id_user
 *         schema: { type: string, format: uuid }
 */

/**
 * @openapi
 * /keuangan/arus-kas/akun:
 *   get:
 *     summary: Arus kas per akun (gabungan masuk & keluar)
 *     description: |
 *       Mengembalikan dua set data dalam satu response:
 *       - **masuk** (pemasukan/debit)
 *       - **keluar** (pengeluaran/kredit)
 *       Hanya untuk akun kas yang dimiliki user atau klasternya (atau admin/superadmin).
 *     security:
 *       - BearerAuth: []
 *     tags:
 *       - Keuangan
 *     parameters:
 *       - in: query
 *         name: akun_id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: id_user
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Khusus admin/superadmin; batasi ke user tertentu.
 *       - in: query
 *         name: start
 *         schema:
 *           type: string
 *           example: "2025-08-01"
 *       - in: query
 *         name: end
 *         schema:
 *           type: string
 *           example: "2025-09-01"
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
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 meta:
 *                   type: object
 *                   properties:
 *                     akun_id:        { type: integer, example: 2 }
 *                     periode:
 *                       type: object
 *                       properties:
 *                         start:       { type: string, nullable: true }
 *                         end:         { type: string, nullable: true }
 *                     page:           { type: integer, example: 1 }
 *                     limit:          { type: integer, example: 10 }
 *                     total_rows_masuk:  { type: integer, example: 3 }
 *                     total_rows_keluar: { type: integer, example: 2 }
 *                     total_masuk:    { type: integer, example: 350000 }
 *                     total_keluar:   { type: integer, example: 220000 }
 *                     net:            { type: integer, example: 130000 }
 *                 masuk:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/LaporanKeuangan' }
 *                 keluar:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/LaporanKeuangan' }
 *       400: { description: akun_id tidak valid }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden (bukan pemilik/klaster/admin) }
 *       404: { description: Akun kas tidak ditemukan }
 *

/**
 * @openapi
 * /keuangan/neraca:
 *   get:
 *     summary: Neraca sederhana (range kategori → aset/kewajiban)
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Keuangan]
 */
