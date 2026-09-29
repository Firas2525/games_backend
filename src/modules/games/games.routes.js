import { Router } from 'express';
import {
  getGames,
  getGame,
  createGame,
  updateGame,
  deleteGame,
  play,
} from './games.controller.js';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { createGameSchema, updateGameSchema } from './games.validation.js';
import { ROLES } from '../../constants/roles.js';

const router = Router();

// Public / User routes
router.get('/', getGames);
router.get('/:id', getGame);
router.post('/:id/play', authenticate, play);

// Admin-only protected routes
router.post(
  '/',
  authenticate,
  authorize(ROLES.ADMIN),
  validate(createGameSchema),
  createGame
);
router.put(
  '/:id',
  authenticate,
  authorize(ROLES.ADMIN),
  validate(updateGameSchema),
  updateGame
);
router.delete(
  '/:id',
  authenticate,
  authorize(ROLES.ADMIN),
  deleteGame
);

export default router;
