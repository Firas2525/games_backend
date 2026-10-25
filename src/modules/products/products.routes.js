import { Router } from 'express';
import {
  sync,
  triggerSync,
  reclassify,
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
import { authenticate, authorize, optionalAuthenticate } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../constants/roles.js';

const router = Router();

// User / Public routes (with optional authentication to detect user currency)
router.get('/', optionalAuthenticate, getUserList);
router.get('/categories', optionalAuthenticate, getCategories);
router.get('/subcategories', optionalAuthenticate, getSubCategoriesList);
router.get('/stats', getStats);
router.get('/sync-now', triggerSync);
router.post('/sync-now', triggerSync);
router.get('/reclassify', reclassify);
router.post('/reclassify', reclassify);
router.get('/:id/details', optionalAuthenticate, getDetails);

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

