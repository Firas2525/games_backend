import { Router } from 'express';
import {
  sync,
  getAdminList,
  toggleVisibility,
  getUserList,
  getDetails,
} from './products.controller.js';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../constants/roles.js';

const router = Router();

// User / Public routes
router.get('/', getUserList);
router.get('/:id/details', getDetails);

// Admin-only protected routes
router.use(authenticate, authorize(ROLES.ADMIN));

router.post('/sync', sync);
router.get('/admin', getAdminList);
router.patch('/:id/toggle-visibility', toggleVisibility);

export default router;
