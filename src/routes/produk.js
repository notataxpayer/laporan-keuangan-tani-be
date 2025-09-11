// src/routes/produk.js
import express from 'express';
import { authRequired, roleGuard } from '../middlewares/auth.js';
import { create, list, detail, update, remove, listMyProducts, listByUser } from '../controllers/product_controller.js';

const router = express.Router();

// Semua produk (scope otomatis: admin lihat semua, user lihat miliknya)
router.get('/', authRequired, list);

// Produk milik user yang sedang login
router.get('/saya', authRequired, listMyProducts);

// Produk milik user tertentu (param userId)
router.get('/users/:userId/produk', authRequired, listByUser);

// Detail produk
router.get('/:id', authRequired, detail);

// Tambah produk
router.post('/', authRequired, create);

// Update produk
router.patch('/:id', authRequired, update);

// Hapus produk
router.delete('/:id', authRequired, remove);

// swagger docs
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
 *     description: |
 *       Membuat produk baru.  
 *       - Jika **kategori_id** tidak dikirim, Anda bisa kirim **kategori_nama**.  
 *       - Jika **kategori_nama** juga tidak ada, sistem akan **cari** kategori berdasarkan **nama produk**; bila belum ada maka **dibuat otomatis** (auto-create) memakai rules klasifikasi (aset lancar/tetap/kewajiban).
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Produk]
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
 *                 example: "Panen Kentang"
 *               kategori_id:
 *                 type: integer
 *                 nullable: true
 *                 example: 1
 *               kategori_nama:
 *                 type: string
 *                 description: Bila tidak mengirim kategori_id, sistem akan pakai nama ini untuk mencari/auto-create kategori.
 *                 example: "Persediaan Panen"
 *           examples:
 *             simple:
 *               summary: Auto kategori dari nama produk
 *               value: { "nama": "Panen Kentang" }
 *             withKategoriNama:
 *               summary: Pakai kategori_nama (auto-create jika belum ada)
 *               value: { "nama": "Cicilan Traktor", "kategori_nama": "Utang Investasi Alat" }
 *             withKategoriId:
 *               summary: Langsung rujuk kategori_id
 *               value: { "nama": "Pupuk Urea 50kg", "kategori_id": 5 }
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
 *       400:
 *         description: Validasi gagal
 *         content:
 *           application/json:
 *             examples:
 *               namaKosong:
 *                 value: { "message": "Validasi gagal", "errors": ["nama wajib diisi"] }
 *               kategoriNamaKosong:
 *                 value: { "message": "Validasi gagal", "errors": ["kategori_nama tidak boleh string kosong"] }
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
 *     description: |
 *       Update sebagian field produk.  
 *       - Bisa mengubah kategori via **kategori_id** atau **kategori_nama**.  
 *       - Jika **kategori_nama** belum ada, kategori akan **dibuat otomatis** berdasarkan rules.
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
 *               nama:
 *                 type: string
 *                 example: "Beras IR64 Premium 5kg"
 *               kategori_id:
 *                 type: integer
 *                 nullable: true
 *                 example: 1
 *               kategori_nama:
 *                 type: string
 *                 example: "Utang Dagang Supplier"
 *           examples:
 *             renameOnly:
 *               summary: Ubah nama saja
 *               value: { "nama": "Pupuk Kompos Organik" }
 *             moveById:
 *               summary: Pindah kategori via ID
 *               value: { "kategori_id": 3 }
 *             moveByName:
 *               summary: Pindah kategori via nama (auto-create jika belum ada)
 *               value: { "kategori_nama": "Lahan Sawah" }
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
 *       400:
 *         description: Validasi gagal / ID tidak valid / tidak ada field yang diupdate
 *         content:
 *           application/json:
 *             examples:
 *               idInvalid:
 *                 value: { "message": "Param id tidak valid" }
 *               noField:
 *                 value: { "message": "Tidak ada field yang diupdate" }
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