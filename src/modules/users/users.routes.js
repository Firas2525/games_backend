import { Router } from 'express';
import {
  getUsers,
  getUser,
  toggleStatus,
  deposit,
  deduct,
  getTransactions,
  getMyTransactions,
  getMyFinancialSummary,
  getAllTransactionsHandler,
  changePassword,
  updateLevel,
} from './users.controller.js';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { balanceOperationSchema } from './users.validation.js';
import { ROLES } from '../../constants/roles.js';

const router = Router();

// Endpoints for any logged-in user to see their balance history and financial overview
router.get('/me/transactions', authenticate, getMyTransactions);
router.get('/me/financial-summary', authenticate, getMyFinancialSummary);

// Admin-only routes
router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/transactions/all', getAllTransactionsHandler);
router.get('/', getUsers);
router.get('/:id', getUser);
router.patch('/:id/toggle-status', toggleStatus);
router.patch('/:id/password', changePassword);
router.patch('/:id/level', updateLevel);

// Balance management routes
router.post('/:id/balance/deposit', validate(balanceOperationSchema), deposit);
router.post('/:id/balance/deduct', validate(balanceOperationSchema), deduct);
router.get('/:id/transactions', getTransactions);

export default router;
