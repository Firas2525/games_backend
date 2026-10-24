import { Router } from 'express';
import { purchase, getMyOrders, getAdminOrders, getFinancialStats } from './orders.controller.js';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../constants/roles.js';

const router = Router();

// User purchase and order history (Requires user authentication)
router.post('/purchase', authenticate, purchase);
router.get('/my-orders', authenticate, getMyOrders);

// Admin financial orders and statistics
router.get('/admin', authenticate, authorize(ROLES.ADMIN), getAdminOrders);
router.get('/admin/stats', authenticate, authorize(ROLES.ADMIN), getFinancialStats);

export default router;
