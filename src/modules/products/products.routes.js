import { Router } from 'express';
import {
  sync,
  triggerSync,
  getAdminList,
  getStats,
  toggleVisibility,
  updateCategory,
  updateCategoryGroup,
  bulkUpdateCategory,
  getCategories,
  addCategory,
  editCategory,
  removeCategory,
  getUserList,
  getDetails,
} from './products.controller.js';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../constants/roles.js';

const router = Router();

// User / Public routes
router.get('/', getUserList);
router.get('/categories', getCategories);
router.get('/stats', getStats);
router.get('/sync-now', triggerSync);
router.post('/sync-now', triggerSync);
router.get('/:id/details', getDetails);

// Admin-only protected routes
router.use(authenticate, authorize(ROLES.ADMIN));

router.post('/sync', sync);
router.get('/admin', getAdminList);
router.post('/categories', addCategory);
router.patch('/categories/:id', editCategory);
router.delete('/categories/:id', removeCategory);
router.patch('/bulk-category', bulkUpdateCategory);
router.patch('/category-group', updateCategoryGroup);
router.patch('/:id/toggle-visibility', toggleVisibility);
router.patch('/:id/category', updateCategory);

export default router;

