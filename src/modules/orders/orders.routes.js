import { Router } from 'express';
import {
  purchase,
  getMyOrders,
  getAdminOrders,
  getFinancialStats,
  checkOrderStatus,
  syncOrders,
  getCustomOrders,
  completeCustomOrder,
  rejectCustomOrder,
  cancelCustomOrder,
} from './orders.controller.js';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../constants/roles.js';

const router = Router();

// User purchase and order history (Requires user authentication)
router.post('/purchase', authenticate, purchase);
router.get('/my-orders', authenticate, getMyOrders);

// Admin financial orders and statistics
router.get('/admin', authenticate, authorize(ROLES.ADMIN), getAdminOrders);
router.get('/admin/stats', authenticate, authorize(ROLES.ADMIN), getFinancialStats);
router.post('/admin/sync-pending', authenticate, authorize(ROLES.ADMIN), syncOrders);

// Admin dedicated routes for "مزودي الخاص" (Custom Provider manual processing)
router.get('/admin/custom-orders', authenticate, authorize(ROLES.ADMIN), getCustomOrders);
router.post('/admin/custom-orders/:orderId/complete', authenticate, authorize(ROLES.ADMIN), completeCustomOrder);
router.post('/admin/custom-orders/:orderId/reject', authenticate, authorize(ROLES.ADMIN), rejectCustomOrder);
router.post('/admin/custom-orders/:orderId/cancel', authenticate, authorize(ROLES.ADMIN), cancelCustomOrder);

router.post('/:orderId/check-status', authenticate, checkOrderStatus);

export default router;
