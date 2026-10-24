import { Router } from 'express';
import { listLogs, getLog, purgeOldLogs } from './logs.controller.js';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../constants/roles.js';

const router = Router();

// Protected admin routes for reviewing all operations
router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/', listLogs);
router.get('/:id', getLog);
router.delete('/purge', purgeOldLogs);

export default router;
