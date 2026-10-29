import { Router } from 'express';
import {
  getActiveSalaryServices,
  submitSalaryWithdrawal,
  getMySalaryWithdrawals,
  getAllSalaryServicesAdmin,
  createSalaryService,
  updateSalaryService,
  deleteSalaryService,
  getAllSalaryWithdrawalsAdmin,
  updateSalaryWithdrawalStatus,
} from './salaryWithdrawal.controller.js';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../constants/roles.js';

const router = Router();

// ==================== USER ROUTES ====================
router.get('/services', authenticate, getActiveSalaryServices);
router.post('/requests', authenticate, submitSalaryWithdrawal);
router.get('/my-requests', authenticate, getMySalaryWithdrawals);

// ==================== ADMIN ROUTES ====================
// Services management
router.get('/admin/services', authenticate, authorize(ROLES.ADMIN), getAllSalaryServicesAdmin);
router.post('/admin/services', authenticate, authorize(ROLES.ADMIN), createSalaryService);
router.put('/admin/services/:id', authenticate, authorize(ROLES.ADMIN), updateSalaryService);
router.delete('/admin/services/:id', authenticate, authorize(ROLES.ADMIN), deleteSalaryService);

// Requests management
router.get('/admin/requests', authenticate, authorize(ROLES.ADMIN), getAllSalaryWithdrawalsAdmin);
router.patch('/admin/requests/:id/status', authenticate, authorize(ROLES.ADMIN), updateSalaryWithdrawalStatus);

export default router;

