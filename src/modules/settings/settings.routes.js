import { Router } from 'express';
import { getSettings, updateSettings } from './settings.controller.js';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../constants/roles.js';

const router = Router();

// Public / Authenticated read
router.get('/', getSettings);

// Admin-only update
router.patch('/', authenticate, authorize(ROLES.ADMIN), updateSettings);
router.post('/', authenticate, authorize(ROLES.ADMIN), updateSettings);

export default router;
