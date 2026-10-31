import { Router } from 'express';
import {
  submitVerificationRequest,
  getMyVerificationStatus,
  getAdminVerificationRequests,
  updateVerificationStatus,
} from './verification.controller.js';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../constants/roles.js';

const router = Router();

// User routes (Authenticated)
router.post('/request', authenticate, submitVerificationRequest);
router.get('/my-status', authenticate, getMyVerificationStatus);

// Admin routes (Admin only)
router.get('/admin/requests', authenticate, authorize(ROLES.ADMIN), getAdminVerificationRequests);
router.patch('/admin/requests/:id/status', authenticate, authorize(ROLES.ADMIN), updateVerificationStatus);

export default router;
