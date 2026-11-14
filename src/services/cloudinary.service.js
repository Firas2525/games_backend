import crypto from 'crypto';

/**
 * Independent Cloudinary Management Service
 * Reads credentials strictly from process.env (never exposed to client).
 */
class CloudinaryService {
  constructor() {
    this.cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
    this.apiKey = process.env.CLOUDINARY_API_KEY || '';
    this.apiSecret = process.env.CLOUDINARY_API_SECRET || '';
    this.defaultFolder = 'games-platform/banners';
  }

  /**
   * Refresh credentials in case process.env changed dynamically
   */
  _getCredentials() {
    return {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || this.cloudName,
      apiKey: process.env.CLOUDINARY_API_KEY || this.apiKey,
      apiSecret: process.env.CLOUDINARY_API_SECRET || this.apiSecret,
    };
  }

  /**
   * Health check / ping Cloudinary API
   */
  async ping() {
    const { cloudName, apiKey, apiSecret } = this._getCredentials();
    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error('Cloudinary credentials incomplete in environment variables');
    }
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/ping`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    return await res.json();
  }

  /**
   * Upload an image (base64 string, Buffer, or URL) to Cloudinary
   * @param {Object} params
   * @param {string|Buffer} params.file - Base64 string (data:image/... or raw), Buffer, or URL
   * @param {string} [params.folder] - Target folder in Cloudinary
   * @param {string} [params.publicId] - Optional custom public ID
   * @returns {Promise<{url: string, publicId: string, format: string, width: number, height: number, bytes: number}>}
   */
  async uploadImage({ file, folder = this.defaultFolder, publicId = null }) {
    const { cloudName, apiKey, apiSecret } = this._getCredentials();

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error('بيانات اعتماد Cloudinary غير متوفرة في متغيرات البيئة (CLOUDINARY_*)');
    }

    if (!file) {
      throw new Error('ملف الصورة مطلوب للرفع');
    }

    // Format file payload for upload
    let uploadFilePayload = file;
    if (Buffer.isBuffer(file)) {
      uploadFilePayload = `data:image/jpeg;base64,${file.toString('base64')}`;
    } else if (typeof file === 'string' && !file.startsWith('data:') && !file.startsWith('http://') && !file.startsWith('https://')) {
      uploadFilePayload = `data:image/jpeg;base64,${file}`;
    }

    const timestamp = Math.round(Date.now() / 1000);

    // Build params for signature
    const paramsToSign = {};
    if (folder) paramsToSign.folder = folder;
    if (publicId) paramsToSign.public_id = publicId;
    paramsToSign.timestamp = timestamp;

    // Cloudinary signature requires parameters sorted alphabetically: key1=val1&key2=val2...
    const sortedKeys = Object.keys(paramsToSign).sort();
    const stringToSign = sortedKeys.map((k) => `${k}=${paramsToSign[k]}`).join('&') + apiSecret;
    const signature = crypto.createHash('sha1').update(stringToSign).digest('hex');

    const formData = new FormData();
    formData.append('file', uploadFilePayload);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp.toString());
    formData.append('signature', signature);
    if (folder) formData.append('folder', folder);
    if (publicId) formData.append('public_id', publicId);

    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      const errMsg = data.error?.message || `فشل الرفع إلى Cloudinary (Status: ${response.status})`;
      throw new Error(errMsg);
    }

    return {
      url: data.secure_url || data.url,
      publicId: data.public_id,
      format: data.format,
      width: data.width,
      height: data.height,
      bytes: data.bytes,
    };
  }

  /**
   * Delete an image from Cloudinary by publicId
   * @param {string} publicId
   */
  async deleteImage(publicId) {
    if (!publicId) return null;
    const { cloudName, apiKey, apiSecret } = this._getCredentials();
    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error('Cloudinary credentials missing');
    }

    const timestamp = Math.round(Date.now() / 1000);
    const stringToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(stringToSign).digest('hex');

    const formData = new FormData();
    formData.append('public_id', publicId);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp.toString());
    formData.append('signature', signature);

    const destroyUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`;
    const res = await fetch(destroyUrl, {
      method: 'POST',
      body: formData,
    });
    return await res.json();
  }
}

export const cloudinaryService = new CloudinaryService();
export default cloudinaryService;
