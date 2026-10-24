import { ApiLog } from '../modules/logs/apiLog.model.js';

const sanitizeData = (data) => {
  if (!data || typeof data !== 'object') return data;
  try {
    const clone = JSON.parse(JSON.stringify(data));
    const mask = (obj) => {
      for (const k of Object.keys(obj)) {
        if (/password|secret|token|authorization/i.test(k) && typeof obj[k] === 'string') {
          obj[k] = '***MASKED***';
        } else if (obj[k] && typeof obj[k] === 'object') {
          mask(obj[k]);
        }
      }
    };
    mask(clone);
    return clone;
  } catch (_) {
    return data;
  }
};

/**
 * Safe, completely non-blocking audit logging middleware.
 * NEVER monkey-patches res.send or interferes with response streams.
 */
export const auditLogMiddleware = (req, res, next) => {
  const url = req.originalUrl || req.url || '';

  // Skip noise, health checks, or logs viewing to avoid recursion
  if (
    !url ||
    url.includes('/favicon.ico') ||
    url.includes('/health') ||
    url.includes('/logs') ||
    req.method === 'OPTIONS'
  ) {
    return next();
  }

  const startTime = Date.now();

  res.on('finish', () => {
    // Run asynchronously in next tick so client response is NEVER delayed or blocked
    setImmediate(async () => {
      try {
        const durationMs = Date.now() - startTime;
        const statusCode = res.statusCode || 200;
        const isSuccess = statusCode >= 200 && statusCode < 400;

        const user = req.user;
        const userId = user?._id || user?.id || null;
        const userName = user?.name || '';
        const userEmail = user?.email || '';
        const userRole = user?.role || '';

        const sanitizedHeaders = sanitizeData(req.headers);
        const sanitizedBody = sanitizeData(req.body);
        const sanitizedQuery = sanitizeData(req.query);

        await ApiLog.create({
          type: 'INTERNAL_HTTP',
          direction: 'INCOMING',
          method: req.method,
          endpoint: url,
          provider: 'internal',
          userId,
          userName,
          userEmail,
          userRole,
          orderId: req.body?.orderId || '',
          productName: req.body?.productName || '',
          requestHeaders: sanitizedHeaders,
          requestBody: sanitizedBody,
          queryParams: sanitizedQuery,
          statusCode,
          durationMs,
          isSuccess,
          errorMessage: isSuccess ? '' : `HTTP ${statusCode}`,
          ip: req.ip || req.headers['x-forwarded-for'] || '',
        });
      } catch (err) {
        // Silently ignore log write errors so they never affect the app
      }
    });
  });

  next();
};
