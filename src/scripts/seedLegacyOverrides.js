import fs from 'fs';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Product } from '../modules/products/products.model.js';

dotenv.config();

export const seedLegacyOverrides = async () => {
  const oldDbPath =
    'H:/GOLD_SM_MYSITE_TEST_CODE/mysite_test/db_ROLLBACK_BEFORE_PROD_V5_11_MANUAL_RESET.json';

  if (!fs.existsSync(oldDbPath)) {
    console.log('Legacy database file not found at:', oldDbPath);
    return;
  }

  const oldDb = JSON.parse(fs.readFileSync(oldDbPath, 'utf8'));
  const overrides = oldDb.roya_category_overrides || {};

  console.log(`Found ${Object.keys(overrides).length} legacy category overrides to apply...`);

  let appliedCount = 0;
  for (const [key, category] of Object.entries(overrides)) {
    // Keys can be "1114" or "usd|1030" or "syp|131"
    const externalId = key.includes('|') ? key.split('|')[1] : key;

    // Map legacy category names if needed
    let mainCategory = category;
    if (category === 'bills') mainCategory = 'payment';
    if (category === 'exchange') mainCategory = 'payment';

    const result = await Product.updateMany(
      { externalId: String(externalId) },
      {
        $set: {
          mainCategory,
          isCategoryOverridden: true,
        },
      }
    );

    if (result.matchedCount > 0) {
      appliedCount += result.modifiedCount;
    }
  }

  console.log(`✅ Successfully applied ${appliedCount} legacy category overrides to MongoDB products.`);
};

// If run directly via node
if (process.argv[1]?.endsWith('seedLegacyOverrides.js')) {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/games_hub';
  mongoose
    .connect(mongoUri)
    .then(async () => {
      console.log('Connected to MongoDB');
      await seedLegacyOverrides();
      await mongoose.disconnect();
      console.log('Done!');
    })
    .catch((err) => {
      console.error('Error seeding legacy overrides:', err);
      process.exit(1);
    });
}
