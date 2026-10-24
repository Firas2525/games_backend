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
  getSubCategoriesList,
  addSubCategory,
  editSubCategory,
  removeSubCategory,
  bulkAssignSubCategory,
  getUserList,
  getDetails,
  updateDiscount,
} from './products.controller.js';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../constants/roles.js';

const router = Router();

// User / Public routes
router.get('/', getUserList);
router.get('/categories', getCategories);
router.get('/subcategories', getSubCategoriesList);
router.get('/stats', getStats);
router.get('/sync-now', triggerSync);
router.post('/sync-now', triggerSync);
router.get('/:id/details', getDetails);

// Admin-only protected routes
router.use(authenticate, authorize(ROLES.ADMIN));

router.post('/sync', sync);
router.get('/admin', getAdminList);
router.patch('/discount', updateDiscount);
router.patch('/:id/discount', updateDiscount);
router.post('/categories', addCategory);
router.patch('/categories/:id', editCategory);
router.delete('/categories/:id', removeCategory);
router.post('/subcategories', addSubCategory);
router.patch('/subcategories/:id', editSubCategory);
router.delete('/subcategories/:id', removeSubCategory);
router.patch('/bulk-subcategory', bulkAssignSubCategory);
router.patch('/bulk-category', bulkUpdateCategory);
router.patch('/category-group', updateCategoryGroup);
router.patch('/:id/toggle-visibility', toggleVisibility);
router.patch('/:id/category', updateCategory);

export default router;

