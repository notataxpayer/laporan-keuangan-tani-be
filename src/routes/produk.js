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

export default router;
