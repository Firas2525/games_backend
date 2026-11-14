import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { Banner, BannerImage } from '../modules/banners/banners.model.js';
import { cloudinaryService } from '../services/cloudinary.service.js';

async function migrate() {
  console.log('=== Cloudinary Zero-Downtime Migration CLI ===');
  console.log('Verifying Cloudinary connection...');
  const ping = await cloudinaryService.ping();
  console.log('Cloudinary status:', ping.status);

  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  console.log('Connected to DB:', mongoose.connection.db.databaseName);

  const docs = await BannerImage.find({
    data: { $exists: true, $ne: null },
  });

  console.log(`Found ${docs.length} images with binary buffer in MongoDB.`);
  if (docs.length === 0) {
    console.log('No binary images to migrate. Database is already clean!');
    await mongoose.disconnect();
    return;
  }

  let migrated = 0;
  let failed = 0;
  let bytesFreed = 0;

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    try {
      if (!doc.data || doc.data.length === 0) {
        await BannerImage.updateOne({ _id: doc._id }, { $unset: { data: 1 } });
        continue;
      }

      const bytes = doc.data.length;
      const mimeType = doc.contentType || 'image/jpeg';
      const base64Data = doc.data.toString('base64');
      const dataUrl = `data:${mimeType};base64,${base64Data}`;

      const uploadRes = await cloudinaryService.uploadImage({
        file: dataUrl,
        folder: 'games-platform/banners',
        publicId: `banner_${doc._id.toString()}`,
      });

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

      // Update in banners
      const directApiPattern = new RegExp(`/api/v1/banners/images/${doc._id.toString()}`);
      await Banner.updateMany(
        { imageUrl: directApiPattern },
        { $set: { imageUrl: uploadRes.url } }
      );

      migrated++;
      bytesFreed += bytes;
      console.log(`[${i + 1}/${docs.length}] Migrated ${doc._id} -> ${uploadRes.url} (+${(bytes / 1024).toFixed(1)} KB freed)`);
    } catch (e) {
      failed++;
      console.error(`[${i + 1}/${docs.length}] Failed ${doc._id}:`, e.message);
    }
  }

  console.log('\n=======================================');
  console.log(`Migration Complete!`);
  console.log(`Migrated: ${migrated}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total space freed: ${(bytesFreed / (1024 * 1024)).toFixed(2)} MB`);
  console.log('=======================================');

  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('Fatal error during migration:', err);
  process.exit(1);
});
