import { Router } from 'express';
import {
  getBanners,
  getAllBannersAdmin,
  createBanner,
  deleteBanner,
  uploadBannerImage,
  serveBannerImage,
} from './banners.controller.js';

const router = Router();

// Public: user app banner list and direct image serving
router.get('/', getBanners);
router.get('/images/:id', serveBannerImage);

// Admin: full list, creation, deletion, Cloudinary upload
router.get('/admin', getAllBannersAdmin);
router.post('/upload', uploadBannerImage);
router.post('/', createBanner);
router.delete('/:id', deleteBanner);

export default router;
