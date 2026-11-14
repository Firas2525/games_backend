import app from './app.js';
import { connectDB } from './config/db.js';
import { ENV } from './config/env.js';
import { autoSyncOnStartup } from './modules/products/products.service.js';
import { ensureShortUserCodes } from './modules/users/users.service.js';
import { startBackgroundOrderSyncWorker } from './modules/orders/orders.service.js';
import { runBannerImagesMigration } from './modules/banners/banners.controller.js';

const startServer = async () => {
  // Connect to Database
  await connectDB();

  // Ensure all users have short unique 6-digit codes
  ensureShortUserCodes();

  // Run catalog synchronization & categorization on startup
  autoSyncOnStartup();

  // Start background order sync worker for real-time order completion
  startBackgroundOrderSyncWorker();

  // Zero-Downtime background migration of remaining legacy binary images to Cloudinary
  setTimeout(() => {
    runBannerImagesMigration().catch((e) =>
      console.warn('[Startup Cloudinary Migration Warning]:', e.message)
    );
  }, 10000);

  // Listen on PORT (Render sets process.env.PORT automatically)
  const server = app.listen(ENV.PORT, () => {
    console.log(`===============================================`);
    console.log(`🚀 Games Backend Server is running!`);
    console.log(`📡 URL: http://localhost:${ENV.PORT}`);
    console.log(`🏥 Health Check: http://localhost:${ENV.PORT}/health`);
    console.log(`⚙️  Environment: ${ENV.NODE_ENV}`);
    console.log(`===============================================`);
  });

  // Graceful shutdown handling
  const shutdown = () => {
    console.log('\n🛑 Gracefully shutting down...');
    server.close(() => {
      console.log('💥 Process terminated');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

startServer();
