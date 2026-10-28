import { Router } from 'express';
import {
  toggleFavoriteHandler,
  getMyFavoritesHandler,
  getMyFavoriteIdsHandler,
  removeFavoriteHandler,
} from './favorites.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';

const router = Router();

// All favorites routes require authentication
router.use(authenticate);

router.get('/', getMyFavoritesHandler);
router.get('/ids', getMyFavoriteIdsHandler);
router.post('/toggle', toggleFavoriteHandler);
router.post('/toggle/:productId', toggleFavoriteHandler);
router.delete('/:productId', removeFavoriteHandler);

export default router;
