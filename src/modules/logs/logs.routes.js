import { Router } from 'express';
import {
  listLogs,
  getLog,
  deleteBatchLogs,
  deleteSingleLog,
  deleteAllLogs,
  purgeOldLogs,
} from './logs.controller.js';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../constants/roles.js';

const router = Router();

// Protected admin routes for reviewing all operations
router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/', listLogs);
router.delete('/batch', deleteBatchLogs);
router.delete('/all', deleteAllLogs);
router.delete('/purge', purgeOldLogs);
router.get('/:id', getLog);
router.delete('/:id', deleteSingleLog);

export default router;
