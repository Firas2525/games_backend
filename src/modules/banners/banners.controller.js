import crypto from 'crypto';
import { Banner, BannerImage } from './banners.model.js';
import { ApiResponse } from '../../utils/apiResponse.js';

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
    const filter = { isActive: true };

    if (placement === 'category') {
      filter.$or = [{ placement: 'category' }, { placement: 'all' }];
      if (category) {
        filter.$and = [
          {
            $or: [
              { categoryKey: category },
              { categoryKey: '' },
              { categoryKey: { $exists: false } },
            ],
          },
        ];
      }
    } else if (placement === 'home') {
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
    if (!imageDoc || !imageDoc.data) {
      return res.status(404).send('Image not found');
    }
    res.setHeader('Content-Type', imageDoc.contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    return res.send(imageDoc.data);
  } catch (err) {
    next(err);
  }
};

export const uploadBannerImage = async (req, res, next) => {
  try {
    const { file, uploadPreset, apiSecret } = req.body;

    if (!file) {
      return ApiResponse.error(res, 'بيانات الصورة مطلوبة للرفع (file/base64)', 400);
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'neevw5vw';
    const apiKey = process.env.CLOUDINARY_API_KEY || '484589243988533';
    const secret = apiSecret || process.env.CLOUDINARY_API_SECRET || '';
    const preset = uploadPreset || process.env.CLOUDINARY_UPLOAD_PRESET || '';

    try {
      const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
      const formData = new FormData();
      formData.append('file', file);

      if (secret) {
        const timestamp = Math.round(Date.now() / 1000);
        const stringToSign = `timestamp=${timestamp}${secret}`;
        const signature = crypto.createHash('sha1').update(stringToSign).digest('hex');

        formData.append('timestamp', timestamp.toString());
        formData.append('api_key', apiKey);
        formData.append('signature', signature);
      } else if (preset) {
        formData.append('upload_preset', preset);
      } else {
        formData.append('upload_preset', 'ml_default');
      }

      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok && (data.secure_url || data.url)) {
        return ApiResponse.success(
          res,
          {
            url: data.secure_url || data.url,
            publicId: data.public_id,
            format: data.format,
            width: data.width,
            height: data.height,
          },
          'تم رفع الصورة إلى Cloudinary بنجاح'
        );
      }
    } catch (cloudErr) {
      console.warn('Cloudinary upload failed, falling back to database storage:', cloudErr.message);
    }

    // Fallback: If Cloudinary fails (e.g. preset not configured), store image directly in DB and serve via backend URL
    const matches = file.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    const contentType = matches ? matches[1] : 'image/jpeg';
    const base64Data = matches ? matches[2] : file;
    const buffer = Buffer.from(base64Data, 'base64');

    const imageDoc = await BannerImage.create({
      data: buffer,
      contentType,
    });

    const host = req.get('host');
    const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : req.protocol;
    const directUrl = `${protocol}://${host}/api/v1/banners/images/${imageDoc._id}`;

    return ApiResponse.success(
      res,
      {
        url: directUrl,
        publicId: imageDoc._id.toString(),
      },
      'تم حفظ الصورة بنجاح'
    );
  } catch (error) {
    next(error);
  }
};
