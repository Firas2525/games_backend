import crypto from 'crypto';
import { Banner, BannerImage } from './banners.model.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { cloudinaryService } from '../../services/cloudinary.service.js';

// Default starter banners if none exist yet
const DEFAULT_BANNERS = [
  {
    title: 'عروض حصرية وشحن فوري لجميع الألعاب',
    imageUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80',
    link: '',
    order: 1,
    isActive: true,
  },
  {
    title: 'بطاقات الهدايا والشحن الرقمي المباشر',
    imageUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1200&q=80',
    link: '',
    order: 2,
    isActive: true,
  },
  {
    title: 'أفضل أسعار العملات الرقمية واشتراكات البث',
    imageUrl: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80',
    link: '',
    order: 3,
    isActive: true,
  },
];

export const getBanners = async (req, res, next) => {
  try {
    const { placement, category } = req.query;

    // Handle category / sub-banner placement with automatic fallback
    if (placement === 'category') {
      const placementFilter = {
        isActive: true,
        $or: [{ placement: 'category' }, { placement: 'all' }],
      };

      if (category && category.trim()) {
        const catKey = category.trim();

        // 1. Try finding specific sub-banners for this category
        const specificBanners = await Banner.find({
          ...placementFilter,
          categoryKey: catKey,
        }).sort({ order: 1, createdAt: -1 });

        if (specificBanners.length > 0) {
          return ApiResponse.success(res, specificBanners, 'تم جلب إعلانات القسم بنجاح');
        }

        // 2. Fallback: Category has no specific banners -> look for general sub-banner (categoryKey is '' or 'all' or unset)
        const generalCategoryBanners = await Banner.find({
          ...placementFilter,
          $or: [
            { categoryKey: '' },
            { categoryKey: 'all' },
            { categoryKey: null },
            { categoryKey: { $exists: false } },
          ],
        }).sort({ order: 1, createdAt: -1 });

        return ApiResponse.success(res, generalCategoryBanners, 'تم جلب الإعلان الفرعي العام');
      }

      // No specific category queried -> return general category banners
      const generalBanners = await Banner.find({
        ...placementFilter,
        $or: [
          { categoryKey: '' },
          { categoryKey: 'all' },
          { categoryKey: null },
          { categoryKey: { $exists: false } },
        ],
      }).sort({ order: 1, createdAt: -1 });

      return ApiResponse.success(res, generalBanners, 'تم جلب الإعلانات الفرعية العامة');
    }

    const filter = { isActive: true };
    if (placement === 'home') {
      filter.$or = [
        { placement: 'home' },
        { placement: 'all' },
        { placement: { $exists: false } },
      ];
    } else if (placement) {
      filter.placement = placement;
    }

    const banners = await Banner.find(filter).sort({ order: 1, createdAt: -1 });
    return ApiResponse.success(res, banners, 'تم جلب الإعلانات بنجاح');
  } catch (error) {
    next(error);
  }
};

export const getAllBannersAdmin = async (req, res, next) => {
  try {
    const { placement } = req.query;
    const filter = {};
    if (placement === 'category') {
      filter.placement = 'category';
    } else if (placement === 'home') {
      filter.$or = [{ placement: 'home' }, { placement: { $exists: false } }];
    } else if (placement) {
      filter.placement = placement;
    }

    const banners = await Banner.find(filter).sort({ order: 1, createdAt: -1 });
    return ApiResponse.success(res, banners, 'تم جلب جميع الإعلانات');
  } catch (error) {
    next(error);
  }
};

export const createBanner = async (req, res, next) => {
  try {
    const { imageUrl, title, link, order, isActive, placement, categoryKey } = req.body;

    if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim()) {
      return ApiResponse.error(res, 'رابط الصورة مطلوب', 400);
    }

    const banner = await Banner.create({
      imageUrl: imageUrl.trim(),
      title: title?.trim() || '',
      link: link?.trim() || '',
      order: Number(order) || 0,
      isActive: isActive !== undefined ? isActive : true,
      placement: placement || 'home',
      categoryKey: categoryKey?.trim() || '',
    });

    return ApiResponse.success(res, banner, 'تمت إضافة الإعلان بنجاح', 201);
  } catch (error) {
    next(error);
  }
};

export const deleteBanner = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id || id.startsWith('def_')) {
      return ApiResponse.success(res, { id }, 'تم حذف الإعلان بنجاح');
    }

    const deleted = await Banner.findByIdAndDelete(id);

    if (!deleted) {
      // Even if not in DB or already deleted, return success so client syncs smoothly
      return ApiResponse.success(res, { id }, 'تم حذف الإعلان بنجاح');
    }

    return ApiResponse.success(res, { id }, 'تم حذف الإعلان بنجاح');
  } catch (error) {
    next(error);
  }
};

export const serveBannerImage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const imageDoc = await BannerImage.findById(id);
    if (!imageDoc) {
      return res.status(404).send('Image not found');
    }

    // 1. Zero-Downtime: If migrated to Cloudinary, issue an instant 302 redirect to Cloudinary CDN
    if (imageDoc.secureUrl) {
      return res.redirect(302, imageDoc.secureUrl);
    }

    // 2. Legacy fallback: serve binary buffer if image has not been migrated yet
    if (imageDoc.data) {
      res.setHeader('Content-Type', imageDoc.contentType || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      return res.send(imageDoc.data);
    }

    return res.status(404).send('Image data not found');
  } catch (err) {
    next(err);
  }
};

export const uploadBannerImage = async (req, res, next) => {
  try {
    const { file, folder } = req.body;

    if (!file) {
      return ApiResponse.error(res, 'بيانات الصورة مطلوبة للرفع (file/base64)', 400);
    }

    // 1. Upload directly to Cloudinary using isolated service
    const targetFolder = folder || 'games-platform/banners';
    const uploadResult = await cloudinaryService.uploadImage({
      file,
      folder: targetFolder,
    });

    // 2. Store metadata (URL & publicId) in MongoDB without any binary data
    const imageDoc = await BannerImage.create({
      secureUrl: uploadResult.url,
      publicId: uploadResult.publicId,
      format: uploadResult.format,
      bytes: uploadResult.bytes || 0,
      data: null, // ZERO binary storage in DB!
    });

    return ApiResponse.success(
      res,
      {
        url: uploadResult.url,
        publicId: uploadResult.publicId,
        format: uploadResult.format,
        width: uploadResult.width,
        height: uploadResult.height,
        imageId: imageDoc._id.toString(),
      },
      'تم رفع الصورة إلى Cloudinary بنجاح'
    );
  } catch (error) {
    next(error);
  }
};

let isMigrationRunning = false;
let migrationStats = {
  status: 'idle',
  total: 0,
  processed: 0,
  migrated: 0,
  failed: 0,
  bytesFreed: 0,
  startedAt: null,
  finishedAt: null,
  sampleUrls: [],
  errors: [],
};

/**
 * Check current migration progress & MongoDB binary data status
 */
export const getMigrationStatus = async (req, res) => {
  try {
    const remainingWithData = await BannerImage.countDocuments({ data: { $exists: true, $ne: null } });
    const totalInDb = await BannerImage.countDocuments();
    const withCloudinary = await BannerImage.countDocuments({ secureUrl: { $regex: 'cloudinary' } });

    return ApiResponse.success(res, {
      ...migrationStats,
      dbLive: {
        totalBannerImages: totalInDb,
        withCloudinaryUrl: withCloudinary,
        remainingWithBinaryData: remainingWithData,
      },
    });
  } catch (err) {
    return ApiResponse.error(res, err.message, 500);
  }
};

/**
 * Core function to run migration of all BannerImages to Cloudinary and free MongoDB binary buffer
 */
export const runBannerImagesMigration = async () => {
  if (isMigrationRunning) {
    console.log('[Cloudinary Migration] Already running in background.');
    return migrationStats;
  }

  const docs = await BannerImage.find({
    data: { $exists: true, $ne: null },
  });

  const total = docs.length;
  if (total === 0) {
    console.log('[Cloudinary Migration] No binary images found in MongoDB. Database is fully optimized.');
    return { status: 'completed', total: 0, message: 'All images already in Cloudinary' };
  }

  isMigrationRunning = true;
  migrationStats = {
    status: 'running',
    total,
    processed: 0,
    migrated: 0,
    failed: 0,
    bytesFreed: 0,
    startedAt: new Date(),
    finishedAt: null,
    sampleUrls: [],
    errors: [],
  };

  (async () => {
    try {
      console.log(`[Cloudinary Migration] >>> Starting migration of ${total} images to Cloudinary...`);

      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        try {
          if (!doc.data || doc.data.length === 0) {
            await BannerImage.updateOne({ _id: doc._id }, { $unset: { data: 1 } });
            migrationStats.processed++;
            continue;
          }

          const bytes = doc.data.length;
          const mimeType = doc.contentType || 'image/jpeg';
          const base64Data = doc.data.toString('base64');
          const dataUrl = `data:${mimeType};base64,${base64Data}`;

          // Upload to Cloudinary under organized folder games-platform/banners
          const uploadRes = await cloudinaryService.uploadImage({
            file: dataUrl,
            folder: 'games-platform/banners',
            publicId: `banner_${doc._id.toString()}`,
          });

          // Update MongoDB: set secureUrl & publicId, and UNSET data buffer!
          await BannerImage.updateOne(
            { _id: doc._id },
            {
              $set: {
                secureUrl: uploadRes.url,
                publicId: uploadRes.publicId,
                format: uploadRes.format,
                bytes: uploadRes.bytes || bytes,
              },
              $unset: { data: 1 },
            }
          );

          migrationStats.migrated++;
          migrationStats.bytesFreed += bytes;

          if (migrationStats.sampleUrls.length < 5) {
            migrationStats.sampleUrls.push({ id: doc._id.toString(), url: uploadRes.url });
          }

          // Update direct references in banners collection
          const directApiPattern = new RegExp(`/api/v1/banners/images/${doc._id.toString()}`);
          await Banner.updateMany(
            { imageUrl: directApiPattern },
            { $set: { imageUrl: uploadRes.url } }
          );

          console.log(`[Cloudinary Migration] (${i + 1}/${total}) Migrated image ${doc._id} -> ${uploadRes.url} (${(bytes / 1024).toFixed(1)} KB freed)`);
        } catch (err) {
          console.error(`[Cloudinary Migration] Failed image ${doc._id}:`, err.message);
          migrationStats.failed++;
          if (migrationStats.errors.length < 10) {
            migrationStats.errors.push({ id: doc._id.toString(), error: err.message });
          }
        } finally {
          migrationStats.processed++;
        }
      }

      // Update references across other collections
      try {
        const { Category } = await import('../products/categories.model.js');
        const { SubCategory } = await import('../products/subcategories.model.js');
        const { Product } = await import('../products/products.model.js');

        const allMigrated = await BannerImage.find({ secureUrl: { $regex: 'cloudinary' } }, { _id: 1, secureUrl: 1 }).lean();
        for (const m of allMigrated) {
          const regex = new RegExp(`/api/v1/banners/images/${m._id}`);
          await Category.updateMany({ imageUrl: regex }, { $set: { imageUrl: m.secureUrl } });
          await SubCategory.updateMany({ imageUrl: regex }, { $set: { imageUrl: m.secureUrl } });
          await Product.updateMany({ image: regex }, { $set: { image: m.secureUrl } });
          await Product.updateMany({ customImage: regex }, { $set: { customImage: m.secureUrl } });
          await Product.updateMany({ subCategoryImage: regex }, { $set: { subCategoryImage: m.secureUrl } });
        }
      } catch (refErr) {
        console.warn('[Cloudinary Migration] Reference sync warning:', refErr.message);
      }

      // Physical disk storage reclamation: rebuild collection to drop Storage Size from 41 MB down to ~80 KB
      try {
        await rebuildBannerImagesStorage();
      } catch (compactErr) {
        console.warn('[Cloudinary Migration] Compact warning:', compactErr.message);
      }

      migrationStats.status = 'completed';
      migrationStats.finishedAt = new Date();
      console.log(`[Cloudinary Migration] ✅ Migration completed! Migrated: ${migrationStats.migrated}/${total}, Freed: ${(migrationStats.bytesFreed / (1024 * 1024)).toFixed(2)} MB`);
    } catch (fatalErr) {
      migrationStats.status = 'error';
      migrationStats.errors.push({ fatal: fatalErr.message });
      console.error('[Cloudinary Migration] Fatal error:', fatalErr);
    } finally {
      isMigrationRunning = false;
    }
  })();

  return migrationStats;
};

/**
 * Rebuild collection to force WiredTiger to deallocate empty pre-allocated disk space
 */
export const rebuildBannerImagesStorage = async () => {
  const mongoose = (await import('mongoose')).default;
  const db = mongoose.connection.db;

  console.log('[Compaction] Starting physical disk reclamation for bannerimages...');
  const docs = await BannerImage.find({}).lean();

  const tempColName = 'bannerimages_clean_' + Date.now();
  const tempCol = db.collection(tempColName);

  if (docs.length > 0) {
    await tempCol.insertMany(docs);
  }

  // Drop bloated collection file on disk (frees 41.20 MB physical storage immediately)
  await db.collection('bannerimages').drop();

  // Rename clean collection to bannerimages
  await tempCol.rename('bannerimages');

  const stats = await db.command({ collStats: 'bannerimages' });
  console.log(`[Compaction] ✅ Complete! Storage Size: ${(stats.storageSize / 1024).toFixed(2)} KB (Data Size: ${(stats.size / 1024).toFixed(2)} KB)`);

  return {
    storageSizeKB: (stats.storageSize / 1024).toFixed(2),
    dataSizeKB: (stats.size / 1024).toFixed(2),
    count: stats.count,
  };
};

/**
 * HTTP endpoint to manually trigger physical disk storage reclamation
 */
export const compactBannerImages = async (req, res, next) => {
  try {
    const result = await rebuildBannerImagesStorage();
    return ApiResponse.success(
      res,
      {
        message: 'تم تفريغ مساحة القرص فيزيائياً بنجاح وتقليص مساحة التخزين في MongoDB Atlas',
        ...result,
      },
      200
    );
  } catch (err) {
    next(err);
  }
};

/**
 * Get exact breakdown of current database consumption across all collections
 */
export const getDbDetailedStats = async (req, res, next) => {
  try {
    const mongoose = (await import('mongoose')).default;
    const db = mongoose.connection.db;

    const dbStats = await db.stats();
    const collections = await db.listCollections().toArray();
    const breakdown = [];

    for (const col of collections) {
      try {
        const stats = await db.command({ collStats: col.name });
        breakdown.push({
          collection: col.name,
          docs: stats.count,
          dataSizeMB: +(stats.size / (1024 * 1024)).toFixed(3),
          storageSizeMB: +(stats.storageSize / (1024 * 1024)).toFixed(3),
          indexSizeMB: +(stats.totalIndexSize / (1024 * 1024)).toFixed(3),
          totalMB: +((stats.storageSize + stats.totalIndexSize) / (1024 * 1024)).toFixed(3),
          indexesCount: stats.nindexes,
        });
      } catch (_) {}
    }

    breakdown.sort((a, b) => b.totalMB - a.totalMB);

    return ApiResponse.success(res, {
      overall: {
        dbName: db.databaseName,
        totalDataSizeMB: +(dbStats.dataSize / (1024 * 1024)).toFixed(2),
        totalStorageSizeMB: +(dbStats.storageSize / (1024 * 1024)).toFixed(2),
        totalIndexSizeMB: +(dbStats.indexSize / (1024 * 1024)).toFixed(2),
        totalPhysicalClusterConsumptionMB: +((dbStats.storageSize + dbStats.indexSize) / (1024 * 1024)).toFixed(2),
        collectionsCount: dbStats.collections,
        objectsCount: dbStats.objects,
      },
      collectionsBreakdown: breakdown,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * HTTP endpoint to manually trigger migration
 */
export const migrateBannerImagesToCloudinary = async (req, res, next) => {
  try {
    if (isMigrationRunning) {
      return ApiResponse.error(res, 'عملية الترحيل قيد التشغيل بالفعل حالياً', 409);
    }

    await cloudinaryService.ping();

    const count = await BannerImage.countDocuments({ data: { $exists: true, $ne: null } });
    if (count === 0) {
      return ApiResponse.success(res, { message: 'جميع الصور منقولة إلى Cloudinary بالفعل ولا توجد صور Binary في قاعدة البيانات' });
    }

    runBannerImagesMigration();

    return ApiResponse.success(
      res,
      {
        message: 'بدأت عملية الترحيل في الخلفية بنجاح إلى Cloudinary',
        totalImagesToMigrate: count,
        checkStatusUrl: '/api/v1/banners/admin/migration-status',
      },
      202
    );
  } catch (error) {
    next(error);
  }
};
