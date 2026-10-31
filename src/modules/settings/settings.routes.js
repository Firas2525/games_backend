import { Router } from 'express';
import {
  getSettings,
  updateSettings,
  getTicker,
  updateTicker,
  getLevels,
  updateLevelBadge,
} from './settings.controller.js';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../constants/roles.js';

const router = Router();

// Public / Authenticated read
router.get('/', getSettings);
router.get('/ticker', getTicker);
router.get('/levels', getLevels);

// Admin-only update
router.patch('/', authenticate, authorize(ROLES.ADMIN), updateSettings);
router.post('/', authenticate, authorize(ROLES.ADMIN), updateSettings);
router.patch('/ticker', authenticate, authorize(ROLES.ADMIN), updateTicker);
router.post('/ticker', authenticate, authorize(ROLES.ADMIN), updateTicker);
router.patch('/levels/badge', authenticate, authorize(ROLES.ADMIN), updateLevelBadge);
router.post('/levels/badge', authenticate, authorize(ROLES.ADMIN), updateLevelBadge);

export default router;
