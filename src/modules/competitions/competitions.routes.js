import express from 'express';
import {
  getCompetitions,
  updateCompetitionBanner,
  removeCompetitionBanner,
} from './competitions.controller.js';
import {
  authenticate,
  optionalAuthenticate,
  authorize,
} from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../constants/roles.js';

const router = express.Router();

// Public / User endpoint (uses optional auth so admin gets extra details when requested)
router.get('/', optionalAuthenticate, getCompetitions);

// Admin-only endpoints to set or delete the competition image
router.post(
  '/banner',
  authenticate,
  authorize(ROLES.ADMIN),
  updateCompetitionBanner
);

router.delete(
  '/banner',
  authenticate,
  authorize(ROLES.ADMIN),
  removeCompetitionBanner
);

export default router;
