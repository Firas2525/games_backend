import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import authRoutes from './modules/auth/auth.routes.js';
import gamesRoutes from './modules/games/games.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import productsRoutes from './modules/products/products.routes.js';
import { notFoundHandler, globalErrorHandler } from './middlewares/error.middleware.js';
import { ApiResponse } from './utils/apiResponse.js';

const app = express();

// Security and utility middlewares
app.use(helmet());
app.use(cors({ origin: '*' })); // Allows Flutter Web, Mobile, and Admin to connect
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check endpoint (ideal for Render zero-downtime health checking)
app.get('/health', (req, res) => {
  return ApiResponse.success(res, { status: 'healthy', timestamp: new Date() }, 'API is up and running');
});

// API Routes (version 1)
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/games', gamesRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/products', productsRoutes);

// Error handlers
app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;
