import { Router } from 'express';
import {
  getActiveMethods,
  submitDeposit,
  getMyDeposits,
  getAdminDeposits,
  acceptDeposit,
  rejectDeposit,
  getAllMethodsAdmin,
  createMethod,
  updateMethod,
  toggleMethod,
  deleteMethod,
} from './deposits.controller.js';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../constants/roles.js';

const router = Router();

// User endpoints
router.get('/methods', authenticate, getActiveMethods);
router.post('/', authenticate, submitDeposit);
router.get('/my-deposits', authenticate, getMyDeposits);

// Admin deposit request review & processing
router.get('/admin', authenticate, authorize(ROLES.ADMIN), getAdminDeposits);
router.post('/admin/:id/accept', authenticate, authorize(ROLES.ADMIN), acceptDeposit);
router.post('/admin/:id/reject', authenticate, authorize(ROLES.ADMIN), rejectDeposit);

// Admin deposit payment methods CRUD
router.get('/admin/methods', authenticate, authorize(ROLES.ADMIN), getAllMethodsAdmin);
router.post('/admin/methods', authenticate, authorize(ROLES.ADMIN), createMethod);
router.put('/admin/methods/:id', authenticate, authorize(ROLES.ADMIN), updateMethod);
router.patch('/admin/methods/:id/toggle', authenticate, authorize(ROLES.ADMIN), toggleMethod);
router.delete('/admin/methods/:id', authenticate, authorize(ROLES.ADMIN), deleteMethod);

export default router;
