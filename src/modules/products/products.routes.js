import { Router } from 'express';
import {
  sync,
  triggerSync,
  getAdminList,
  toggleVisibility,
  updateCategory,
  updateCategoryGroup,
  getUserList,
  getDetails,
} from './products.controller.js';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../constants/roles.js';

const router = Router();

// User / Public routes
router.get('/', getUserList);
router.get('/sync-now', triggerSync);
router.post('/sync-now', triggerSync);
router.get('/:id/details', getDetails);

// Admin-only protected routes
router.use(authenticate, authorize(ROLES.ADMIN));

router.post('/sync', sync);
router.get('/admin', getAdminList);
router.patch('/category-group', updateCategoryGroup);
router.patch('/:id/toggle-visibility', toggleVisibility);
router.patch('/:id/category', updateCategory);

export default router;
