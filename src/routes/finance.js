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
 *         harga_satuan: { type: integer, example: 12000, nullable: true, description: "Alternatif dari subtotal. Jika diisi, subtotal = jumlah * harga_satuan." }
 *         subtotal:     { type: integer, example: 120000, nullable: true, description: "Alternatif dari harga_satuan. Salah satu harus ada." }
 *     LaporanKeuangan:
 *       type: object
 *       properties:
 *         id_laporan:  { type: string, format: uuid }
 *         id_user:     { type: string, format: uuid }
 *         akun_id:     { type: integer, nullable: true }
 *         created_at:  { type: string }
 *         jenis:       { type: string, enum: [pemasukan, pengeluaran] }
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
 *         description: Khusus admin/superadmin; filter milik user tertentu.
 *       - in: query
 *         name: jenis
 *         schema: { type: string, enum: [pemasukan, pengeluaran] }
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 page:  { type: integer, example: 1 }
 *                 limit: { type: integer, example: 10 }
 *                 total: { type: integer, example: 23 }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/LaporanKeuangan' }
 *   post:
 *     summary: Buat laporan keuangan (debit=pemasukan, kredit=pengeluaran)
 *     description: |
 *       - **pemasukan** → `debit` > 0 dan `kredit` = 0  
 *       - **pengeluaran** → `kredit` > 0 dan `debit` = 0  
 *       - `items[].harga_satuan` **atau** `items[].subtotal` (pilih salah satu).  
 *       - Jumlah `subtotal` semua item **harus sama** dengan nilai `debit`/`kredit` sesuai `jenis`.  
 *       - Jika `akun_id` diisi, saldo akun otomatis disesuaikan.
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Keuangan]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [jenis]
 *             properties:
 *               akun_id:    { type: integer, nullable: true, example: 2 }
 *               jenis:      { type: string, enum: [pemasukan, pengeluaran] }
 *               deskripsi:  { type: string, example: "Penjualan beras 10kg" }
 *               debit:      { type: integer, example: 200000 }
 *               kredit:     { type: integer, example: 0 }
 *               items:
 *                 type: array
 *                 items: { $ref: '#/components/schemas/DetailLaporanItem' }
 *           examples:
 *             pemasukan_harga_satuan:
 *               summary: Pemasukan dengan harga_satuan
 *               value:
 *                 jenis: pemasukan
 *                 akun_id: 1
 *                 debit: 100000
 *                 kredit: 0
 *                 items: [{ produk_id: 7, jumlah: 5, harga_satuan: 20000 }]
 *             pengeluaran_subtotal:
 *               summary: Pengeluaran dengan subtotal
 *               value:
 *                 jenis: pengeluaran
 *                 akun_id: 1
 *                 debit: 0
 *                 kredit: 75000
 *                 items: [{ produk_id: 9, jumlah: 3, subtotal: 75000 }]
 *     responses:
 *       201:
 *         description: Laporan dibuat
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Laporan dibuat" }
 *                 data:    { $ref: '#/components/schemas/LaporanKeuangan' }
 *       400: { description: Validasi gagal (jenis/debit-kredit/items) }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden (akun kas bukan milik/klaster) }
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
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 header:  { $ref: '#/components/schemas/LaporanKeuangan' }
 *                 details:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/DetailLaporanItem'
 *                       - type: object
 *                         properties:
 *                           harga_satuan: { type: integer, nullable: true, example: 20000, description: "Diturunkan otomatis dari subtotal/jumlah jika memungkinkan." }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden (bukan pemilik & bukan admin) }
 *       404: { description: Tidak ditemukan }
 *   delete:
 *     summary: Hapus laporan (reversal saldo akun otomatis)
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Keuangan]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Laporan dihapus (saldo akun direversal) }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden (bukan pemilik & bukan admin) }
 *       404: { description: Tidak ditemukan }
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
 *         description: Khusus admin/superadmin; filter milik user tertentu.
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 periode:
 *                   type: object
 *                   properties:
 *                     start: { type: string, nullable: true }
 *                     end:   { type: string, nullable: true }
 *                 total_pemasukan:  { type: integer, example: 5000000 }
 *                 total_pengeluaran:{ type: integer, example: 3200000 }
 *                 laba_rugi:        { type: integer, example: 1800000 }
 *       401: { description: Unauthorized }
 */

/**
 * @openapi
 * /keuangan/arus-kas:
 *   get:
 *     summary: Arus kas (satu arah)
 *     description: Ambil arus kas **masuk** (debit) atau **keluar** (kredit) dengan pagination.
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Keuangan]
 *     parameters:
 *       - in: query
 *         name: arah
 *         required: true
 *         schema: { type: string, enum: [masuk, keluar] }
 *       - in: query
 *         name: akun_id
 *         schema: { type: integer }
 *         description: Filter berdasarkan akun kas tertentu.
 *       - in: query
 *         name: id_user
 *         schema: { type: string, format: uuid }
 *         description: Khusus admin/superadmin; filter milik user tertentu.
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 meta:
 *                   type: object
 *                   properties:
 *                     arah:       { type: string, example: "masuk" }
 *                     page:       { type: integer, example: 1 }
 *                     limit:      { type: integer, example: 10 }
 *                     total_rows: { type: integer, example: 12 }
 *                     total_nilai:{ type: integer, example: 750000 }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/LaporanKeuangan' }
 *       400: { description: Param arah invalid }
 *       401: { description: Unauthorized }
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
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Keuangan]
 *     parameters:
 *       - in: query
 *         name: akun_id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: id_user
 *         schema: { type: string, format: uuid }
 *         description: Khusus admin/superadmin; batasi ke user tertentu.
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
 *       400: { description: akun_id tidak valid }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden (bukan pemilik/klaster/admin) }
 *       404: { description: Akun kas tidak ditemukan }
 */

/**
 * @openapi
 * /keuangan/neraca:
 *   get:
 *     summary: Neraca sederhana (berdasarkan neraca_identifier dari detail items)
 *     description: |
 *       Mengelompokkan saldo ke:
 *       - **aset_lancar** (0–2599)  
 *       - **aset_tetap**  (2600–3599)  
 *       - **kewajiban**   (4000–4999)  
 *       Perhitungan: `saldo = debit - kredit` per kelompok.
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Keuangan]
 *     parameters:
 *       - in: query
 *         name: id_user
 *         schema: { type: string, format: uuid }
 *         description: Khusus admin/superadmin; filter milik user tertentu.
 *       - in: query
 *         name: start
 *         schema: { type: string, example: '2025-08-01' }
 *       - in: query
 *         name: end
 *         schema: { type: string, example: '2025-09-01' }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 periode:
 *                   type: object
 *                   properties:
 *                     start: { type: string, nullable: true }
 *                     end:   { type: string, nullable: true }
 *                 aset_lancar:
 *                   type: object
 *                   properties:
 *                     debit:  { type: integer, example: 3200000 }
 *                     kredit: { type: integer, example: 500000 }
 *                     saldo:  { type: integer, example: 2700000 }
 *                 aset_tetap:
 *                   type: object
 *                   properties:
 *                     debit:  { type: integer, example: 1200000 }
 *                     kredit: { type: integer, example: 0 }
 *                     saldo:  { type: integer, example: 1200000 }
 *                 kewajiban:
 *                   type: object
 *                   properties:
 *                     debit:  { type: integer, example: 0 }
 *                     kredit: { type: integer, example: 1500000 }
 *                     saldo:  { type: integer, example: -1500000, description: "Saldo = debit - kredit; bisa negatif untuk kewajiban." }
 *                 total_aset:      { type: integer, example: 3900000 }
 *                 total_kewajiban: { type: integer, example: -1500000 }
 *                 seimbang:        { type: boolean, example: false }
 *       401: { description: Unauthorized }
 */
