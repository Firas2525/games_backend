import { Router } from 'express';
import {
  sync,
  getAdminList,
  toggleVisibility,
  getUserList,
} from './products.controller.js';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../constants/roles.js';

const router = Router();

// User / Public route
router.get('/', getUserList);

// Admin-only protected routes
router.use(authenticate, authorize(ROLES.ADMIN));

router.post('/sync', sync);
router.get('/admin', getAdminList);
router.patch('/:id/toggle-visibility', toggleVisibility);

export default router;
