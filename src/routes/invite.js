// src/routes/invite.js
import express from 'express';
import { authRequired } from '../middlewares/auth.js';
import {
  createClusterInvite,
  listClusterInvites,
  listMyInvites,
  previewInvite,
  acceptInvite,
  rejectInvite,
  revokeInvite,
} from '../controllers/invite_controller.js';

const router = express.Router();

// Admin/Owner – undang & kelola undangan di klaster
router.post('/klaster/:klasterId/invites', authRequired, createClusterInvite);
router.get('/klaster/:klasterId/invites', authRequired, listClusterInvites);
router.post('/klaster/:klasterId/invites/:inviteId/revoke', authRequired, revokeInvite);

// User – undangan saya & aksi
router.get('/me/invites', authRequired, listMyInvites);
router.get('/invites/preview', previewInvite); // boleh tanpa login (untuk link), tapi untuk accept/reject tetap butuh login
router.post('/invites/accept', authRequired, acceptInvite);
router.post('/invites/reject', authRequired, rejectInvite);

export default router;

/**
 * @openapi
 * tags:
 *   - name: Klaster - Invite
 *
 * /klaster/{klasterId}/invites:
 *   post:
 *     summary: Buat undangan (owner/admin)
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Klaster - Invite]
 *     parameters:
 *       - in: path
 *         name: klasterId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: string, format: email }
 *               phone: { type: string, example: "+62812xxxx" }
 *               role:  { type: string, enum: [owner, admin, member], default: member }
 *               expires_at: { type: string, format: date-time }
 *     responses:
 *       201: { description: Undangan dibuat }
 *       403: { description: Forbidden (bukan owner/admin) }
 *   get:
 *     summary: List undangan klaster (owner/admin)
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Klaster - Invite]
 *     parameters:
 *       - in: path
 *         name: klasterId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: OK }
 *
 * /klaster/{klasterId}/invites/{inviteId}/revoke:
 *   post:
 *     summary: Revoke undangan (owner/admin)
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Klaster - Invite]
 *     parameters:
 *       - in: path
 *         name: klasterId
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: inviteId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Undangan dibatalkan }
 *
 * /me/invites:
 *   get:
 *     summary: Undangan untuk saya (butuh login)
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Klaster - Invite]
 *     responses:
 *       200: { description: OK }
 *
 * /invites/preview:
 *   get:
 *     summary: Preview undangan via token (public)
 *     tags: [Klaster - Invite]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Not found }
 *
 * /invites/accept:
 *   post:
 *     summary: Terima undangan (butuh login)
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Klaster - Invite]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token: { type: string }
 *               invite_id: { type: string, format: uuid }
 *     responses:
 *       200: { description: Bergabung berhasil }
 *
 * /invites/reject:
 *   post:
 *     summary: Tolak undangan (butuh login)
 *     security: [ { BearerAuth: [] } ]
 *     tags: [Klaster - Invite]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token: { type: string }
 *               invite_id: { type: string, format: uuid }
 *     responses:
 *       200: { description: Undangan ditolak }
 */
