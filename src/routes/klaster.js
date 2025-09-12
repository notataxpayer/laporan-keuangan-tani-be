// src/routes/klaster.js
import express from 'express';
import { authRequired, roleGuard } from '../middlewares/auth.js';
import {
  create, list, myCluster, detail, update, remove, kickMember
} from '../controllers/klaster_controller.js';

const router = express.Router();

// hanya admin/superadmin boleh create/update/delete
router.post('/',          authRequired, roleGuard('admin','superadmin'), create);
router.patch('/:id',      authRequired, roleGuard('admin','superadmin'), update);
router.delete('/:id',     authRequired, roleGuard('admin','superadmin'), remove);

// semua user: lihat klaster miliknya
router.get('/me',         authRequired, myCluster);

// admin/superadmin: list semua; user biasa: server akan balikin punyaknya saja
router.get('/',           authRequired, list);

// detail klaster: admin bebas; user biasa hanya klasternya sendiri
router.get('/:id',        authRequired, detail);

// Kick Member
router.delete('/:id/members/:userId', authRequired, roleGuard('admin','superadmin'), kickMember);

export default router;

/**
 * @openapi
 * tags:
 *   - name: Klaster
 *
 * /klaster:
 *   get:
 *     summary: List klaster (admin semua; user hanya punyaknya)
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Klaster]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, minimum: 1, maximum: 100 }
 *     responses:
 *       200: { description: OK }
 *   post:
 *     summary: Buat klaster (admin/superadmin)
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Klaster]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nama_klaster]
 *             properties:
 *               nama_klaster: { type: string, example: "Poktan Maju Jaya" }
 *     responses:
 *       201: { description: Klaster dibuat }
 *       403: { description: Forbidden }
 *
 * /klaster/me:
 *   get:
 *     summary: Info klaster saya + anggota
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Klaster]
 *
 * /klaster/{id}:
 *   get:
 *     summary: Detail klaster + anggota
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Klaster]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *   patch:
 *     summary: Update klaster (admin/superadmin)
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Klaster]
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
 *               nama_klaster: { type: string, example: "Poktan Maju Jaya 2" }
 *   delete:
 *     summary: Hapus klaster (admin/superadmin)
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Klaster]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 */
