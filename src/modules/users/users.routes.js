import { Router } from 'express';
import { getUsers, getUser, toggleStatus } from './users.controller.js';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../constants/roles.js';

const router = Router();

// Only admin can manage users
router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/', getUsers);
router.get('/:id', getUser);
router.patch('/:id/toggle-status', toggleStatus);

export default router;
