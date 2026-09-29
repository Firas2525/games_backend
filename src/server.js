import app from './app.js';
import { connectDB } from './config/db.js';
import { ENV } from './config/env.js';

const startServer = async () => {
  // Connect to Database
  await connectDB();

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
