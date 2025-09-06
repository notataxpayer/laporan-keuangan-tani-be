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
  getNeraca
} from '../controllers/finance_controller.js';

const router = express.Router();

router.post('/laporan', authRequired, createLaporan);
router.get('/laporan', authRequired, listLaporanController);
router.get('/laporan/:id', authRequired, getLaporanDetail);
router.delete('/laporan/:id', authRequired, deleteLaporanController);
router.get('/laba-rugi', authRequired, getLabaRugi);
router.get('/arus-kas', authRequired, getArusKas);
router.get('/neraca', authRequired, getNeraca);

// swagger docs
/**
 * @openapi
 * /keuangan/laporan:
 *   get:
 *     summary: List laporan keuangan
 *     description: User biasa hanya melihat laporannya sendiri. Admin/Superadmin dapat memfilter dengan id_user.
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Keuangan]
 *     parameters:
 *       - in: query
 *         name: id_user
 *         schema: { type: string, format: uuid }
 *         description: Hanya untuk admin/superadmin; filter laporan milik user tertentu.
 *       - in: query
 *         name: jenis
 *         schema: { type: string, enum: [pemasukan, pengeluaran] }
 *       - in: query
 *         name: kategori_id
 *         schema: { type: integer }
 *       - in: query
 *         name: start
 *         schema: { type: string, example: '2025-08-01' }
 *         description: Filter created_at >= start (ISO/tanggal).
 *       - in: query
 *         name: end
 *         schema: { type: string, example: '2025-09-01' }
 *         description: Filter created_at < end (exclusive).
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
 *                 total: { type: integer, example: 3 }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/LaporanKeuangan' }
 *       401: { description: Unauthorized }
 *   post:
 *     summary: Buat laporan keuangan (debit=pemasukan, kredit=pengeluaran)
 *     description: Jika mengirim items, total subtotal harus sama dengan nilai debit/kredit sesuai jenis.
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
 *               jenis: { type: string, enum: [pemasukan, pengeluaran] }
 *               kategori_id: { type: integer, example: 7 }
 *               deskripsi: { type: string, example: "Penjualan beras 10kg" }
 *               debit:  { type: integer, example: 120000, description: "Isi untuk pemasukan; kredit=0" }
 *               kredit: { type: integer, example: 0, description: "Isi untuk pengeluaran; debit=0" }
 *               items:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/DetailLaporanItem'
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
 *       400: { description: Validasi gagal }
 *       401: { description: Unauthorized }
 */

/**
 * @openapi
 * /keuangan/laporan/{id}:
 *   get:
 *     summary: Detail laporan (dengan item barang jika ada)
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
 *                   items: { $ref: '#/components/schemas/DetailLaporanItem' }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden (bukan pemilik & bukan admin) }
 *       404: { description: Tidak ditemukan }
 *   delete:
 *     summary: Hapus laporan
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Keuangan]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Laporan dihapus
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Laporan dihapus" }
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
 *         description: Hanya untuk admin/superadmin; hitung milik user tertentu.
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
 *                 total_pemasukan:  { type: integer, example: 350000 }
 *                 total_pengeluaran:{ type: integer, example: 220000 }
 *                 laba_rugi:        { type: integer, example: 130000 }
 *                 per_kategori:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 *                     properties:
 *                       pemasukan:  { type: integer, example: 120000 }
 *                       pengeluaran:{ type: integer, example: 80000 }
 *       401: { description: Unauthorized }
 */

/**
 * @openapi
 * /keuangan/arus-kas:
 *   get:
 *     summary: Arus kas (masuk/keluar)
 *     description: |
 *       Mengembalikan daftar baris lapkeuangan sesuai arah.
 *       Aturan: masuk = pemasukan (debit), keluar = pengeluaran (kredit).
 *       Tanggal opsional; gunakan pagination bila tanpa tanggal.
 *     security:
 *       - BearerAuth: []
 *     tags:
 *       - Keuangan
 *     parameters:
 *       - in: query
 *         name: arah
 *         required: true
 *         schema:
 *           type: string
 *           enum: [masuk, keluar]
 *         description: "masuk = pemasukan (debit), keluar = pengeluaran (kredit)"
 *       - in: query
 *         name: id_user
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Hanya admin/superadmin; filter milik user tertentu.
 *       - in: query
 *         name: kategori_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: start
 *         schema:
 *           type: string
 *           example: "2025-08-01"
 *         description: Filter created_at >= start.
 *       - in: query
 *         name: end
 *         schema:
 *           type: string
 *           example: "2025-09-01"
 *         description: Filter created_at < end (exclusive).
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
 *                     arah:
 *                       type: string
 *                       example: masuk
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 10
 *                     total_rows:
 *                       type: integer
 *                       example: 3
 *                     total_nilai:
 *                       type: integer
 *                       example: 350000
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/LaporanKeuangan'
 *       400:
 *         description: Parameter arah tidak valid / tidak diisi
 */

/**
 * @openapi
 * /keuangan/neraca:
 *   get:
 *     summary: Neraca (kelompok berdasarkan neraca_identifier)
 *     description: |
 *       Mengelompokkan saldo berdasarkan rentang **neraca_identifier**:
 *       - **aset_lancar**: 0–2599  
 *       - **aset_tetap** : 2600–3599  
 *       - **kewajiban**  : 4000–5000  
 *       - **lainnya**    : di luar rentang di atas
 *
 *       Nilai **debit** dianggap pemasukan (menambah aset), **kredit** dianggap pengeluaran.
 *       Response juga memuat daftar **produk** yang jatuh pada masing-masing kelompok (berdasarkan kategori produknya).
 *     security:
 *       - BearerAuth: []
 *     tags:
 *       - Keuangan
 *     parameters:
 *       - in: query
 *         name: start
 *         schema:
 *           type: string
 *           example: "2025-08-01"
 *         description: Filter created_at >= start (ISO / tanggal).
 *       - in: query
 *         name: end
 *         schema:
 *           type: string
 *           example: "2025-09-01"
 *         description: Filter created_at < end (exclusive).
 *       - in: query
 *         name: id_user
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Hanya untuk admin/superadmin; hitung neraca milik user tertentu.
 *       - in: query
 *         name: created_by
 *         schema:
 *           type: string
 *           format: uuid
 *         description: (Opsional) Filter **produk_by_kelompok** hanya produk yang dibuat oleh user tertentu.
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
 *                     start:
 *                       type: string
 *                       nullable: true
 *                     end:
 *                       type: string
 *                       nullable: true
 *                 kelompok:
 *                   type: object
 *                   properties:
 *                     aset_lancar:
 *                       $ref: '#/components/schemas/NeracaKelompok'
 *                     aset_tetap:
 *                       $ref: '#/components/schemas/NeracaKelompok'
 *                     kewajiban:
 *                       $ref: '#/components/schemas/NeracaKelompok'
 *                     lainnya:
 *                       $ref: '#/components/schemas/NeracaKelompok'
 *                 ringkasan:
 *                   $ref: '#/components/schemas/NeracaRingkasan'
 *                 produk_by_kelompok:
 *                   type: object
 *                   properties:
 *                     aset_lancar:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ProdukNeracaItem'
 *                     aset_tetap:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ProdukNeracaItem'
 *                     kewajiban:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ProdukNeracaItem'
 *                     lainnya:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ProdukNeracaItem'
 *       401:
 *         description: Unauthorized
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     NeracaKelompok:
 *       type: object
 *       properties:
 *         debit:
 *           type: integer
 *           example: 15000000
 *         kredit:
 *           type: integer
 *           example: 13000000
 *     NeracaRingkasan:
 *       type: object
 *       properties:
 *         total_debit:
 *           type: integer
 *           example: 17000000
 *         total_kredit:
 *           type: integer
 *           example: 16500000
 *         seimbang:
 *           type: boolean
 *           example: false
 *     ProdukNeracaItem:
 *       type: object
 *       properties:
 *         produk_id:
 *           type: integer
 *           example: 3
 *         nama:
 *           type: string
 *           example: "Beras IR64"
 *         harga:
 *           type: integer
 *           example: 12000
 *         kategori_id:
 *           type: integer
 *           example: 7
 *         created_by:
 *           type: string
 *           format: uuid
 */

export default router;
