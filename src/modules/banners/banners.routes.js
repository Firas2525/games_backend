import { Router } from 'express';
import {
  getBanners,
  getAllBannersAdmin,
  createBanner,
  deleteBanner,
  uploadBannerImage,
  serveBannerImage,
  migrateBannerImagesToCloudinary,
  getMigrationStatus,
} from './banners.controller.js';

const router = Router();

// Public: user app banner list and direct image serving (Supports instant 302 redirect to Cloudinary CDN)
router.get('/', getBanners);
router.get('/images/:id', serveBannerImage);

// Admin: full list, creation, deletion, Cloudinary upload & Zero-Downtime Migration
router.get('/admin', getAllBannersAdmin);
router.post('/upload', uploadBannerImage);
router.post('/admin/migrate-to-cloudinary', migrateBannerImagesToCloudinary);
router.get('/admin/migration-status', getMigrationStatus);
router.post('/', createBanner);
router.delete('/:id', deleteBanner);

export default router;
