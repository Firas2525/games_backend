import { Router } from 'express';
import {
  submitVerificationRequest,
  getMyVerificationStatus,
  getAdminVerificationRequests,
  updateVerificationStatus,
  getVerificationFields,
  updateVerificationFields,
} from './verification.controller.js';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../constants/roles.js';

const router = Router();

// User routes (Authenticated)
router.get('/fields', authenticate, getVerificationFields);
router.post('/request', authenticate, submitVerificationRequest);
router.get('/my-status', authenticate, getMyVerificationStatus);

// Admin routes (Admin only)
router.get('/admin/fields', authenticate, authorize(ROLES.ADMIN), getVerificationFields);
router.post('/admin/fields', authenticate, authorize(ROLES.ADMIN), updateVerificationFields);
router.put('/admin/fields', authenticate, authorize(ROLES.ADMIN), updateVerificationFields);
router.get('/admin/requests', authenticate, authorize(ROLES.ADMIN), getAdminVerificationRequests);
router.patch('/admin/requests/:id/status', authenticate, authorize(ROLES.ADMIN), updateVerificationStatus);

export default router;

