import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import authRoutes from './modules/auth/auth.routes.js';
import gamesRoutes from './modules/games/games.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import productsRoutes from './modules/products/products.routes.js';
import bannersRoutes from './modules/banners/banners.routes.js';
import settingsRoutes from './modules/settings/settings.routes.js';
import ordersRoutes from './modules/orders/orders.routes.js';
import logsRoutes from './modules/logs/logs.routes.js';
import depositsRoutes from './modules/deposits/deposits.routes.js';
import { auditLogMiddleware } from './middlewares/auditLog.middleware.js';
import { notFoundHandler, globalErrorHandler } from './middlewares/error.middleware.js';
import { ApiResponse } from './utils/apiResponse.js';
import { syncAllProducts } from './modules/products/products.service.js';

const app = express();

// Security and utility middlewares
app.use(helmet());
app.use(cors({ origin: '*' })); // Allows Flutter Web, Mobile, and Admin to connect
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health Check endpoint (ideal for Render zero-downtime health checking)
app.get('/health', (req, res) => {
  return ApiResponse.success(res, { status: 'healthy', timestamp: new Date() }, 'API is up and running');
});

// Outgoing IP diagnostic endpoint
app.get('/server-ip', async (req, res) => {
  try {
    const ipRes = await fetch('https://api.ipify.org?format=json');
    const data = await ipRes.json();
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Live test for Brand One Card integration
app.get('/test-brand', async (req, res) => {
  try {
    const token =
      process.env.BRAND1CARD_API_TOKEN ||
      '3cf13f069cf8786bc75ed75794641e9cf34e467f6fe6ed892a9ff227941ea0b8';
    const apiUrl =
      process.env.BRAND1CARD_API_URL ||
      'https://api.brand-one-card.com/client/api/products';
    const ipRes = await fetch('https://api.ipify.org?format=json')
      .then((r) => r.json())
      .catch(() => ({ ip: 'unknown' }));

    const brandRes = await fetch(apiUrl, {
      headers: {
        'api-token': token,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
    });

    const status = brandRes.status;
    const bodyText = await brandRes.text();
    let bodyJson = null;
    try {
      bodyJson = JSON.parse(bodyText);
    } catch (_) {}

    return res.json({
      serverOutgoingIp: ipRes.ip,
      brandStatus: status,
      isOk: brandRes.ok,
      itemCount: Array.isArray(bodyJson) ? bodyJson.length : 0,
      sampleOrError: Array.isArray(bodyJson) ? bodyJson.slice(0, 2) : bodyJson || bodyText,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

import { handleRoyaWebhook } from './modules/orders/orders.service.js';

// Dedicated Webhook endpoint for SW Games / Roya (Instant order completion and failure refunds)
app.all(['/roya_webhook', '/api/v1/orders/webhook/roya'], async (req, res) => {
  try {
    if (req.method === 'GET') {
      return res.status(200).json({
        ok: true,
        status: 'active',
        message: 'Roya Webhook endpoint is live and responding perfectly',
      });
    }
    const result = await handleRoyaWebhook(req.body);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[Roya Webhook Error]:', err);
    return res.status(200).json({ ok: false, error: err.message });
  }
});

// Audit logging middleware for every API operation
app.use('/api/v1', auditLogMiddleware);

// API Routes (version 1)
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/games', gamesRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/products', productsRoutes);
app.use('/api/v1/banners', bannersRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/orders', ordersRoutes);
app.use('/api/v1/logs', logsRoutes);
app.use('/api/v1/deposits', depositsRoutes);

// Error handlers
app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;
