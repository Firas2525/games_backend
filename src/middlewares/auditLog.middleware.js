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

const truncateForLog = (data) => {
  if (!data) return data;
  if (typeof data === 'object') {
    // If it's an array of items (e.g. list of products or users), summarize it
    if (Array.isArray(data)) {
      return {
        _summary: `قائمة تحتوي على ${data.length} عنصر`,
        sample: data.slice(0, 2),
      };
    }
    // If it's a paginated wrapper like { success: true, data: [...] }
    if (data.data && Array.isArray(data.data)) {
      return {
        ...data,
        data: {
          _summary: `قائمة تحتوي على ${data.data.length} عنصر`,
          sample: data.data.slice(0, 2),
        },
      };
    }
    // If stringified length > 15KB, truncate
    try {
      const str = JSON.stringify(data);
      if (str.length > 15000) {
        return {
          _truncated: true,
          preview: str.slice(0, 2000),
          totalLength: str.length,
        };
      }
    } catch (_) {}
  }
  return data;
};

export const auditLogMiddleware = (req, res, next) => {
  const url = req.originalUrl || req.url || '';

  // Skip non-API routes, health checks, or logs endpoint itself to prevent recursion and log bombs
  if (
    !url ||
    url.includes('/favicon.ico') ||
    url.includes('/health') ||
    url.includes('/logs')
  ) {
    return next();
  }

  const startTime = Date.now();
  const originalSend = res.send;
  let responseBody = null;

  res.send = function (body) {
    try {
      if (typeof body === 'string') {
        if (body.length < 50000) {
          responseBody = JSON.parse(body);
        } else {
          responseBody = { _preview: body.slice(0, 1000), length: body.length };
        }
      } else {
        responseBody = body;
      }
    } catch (_) {
      responseBody = typeof body === 'string' && body.length > 500 ? body.slice(0, 500) + '...' : body;
    }
    return originalSend.apply(this, arguments);
  };

  res.on('finish', async () => {
    try {
      const durationMs = Date.now() - startTime;
      const statusCode = res.statusCode || 200;
      const isSuccess = statusCode >= 200 && statusCode < 400;

      // Extract user info if authenticated
      const user = req.user;
      const userId = user?._id || user?.id || null;
      const userName = user?.name || '';
      const userEmail = user?.email || '';
      const userRole = user?.role || '';

      const sanitizedHeaders = sanitizeData(req.headers);
      const sanitizedBody = sanitizeData(req.body);
      const sanitizedQuery = sanitizeData(req.query);
      const sanitizedRes = sanitizeData(truncateForLog(responseBody));

      let errorMessage = '';
      if (!isSuccess && sanitizedRes && typeof sanitizedRes === 'object') {
        errorMessage = sanitizedRes.message || sanitizedRes.error || '';
      }

      await ApiLog.create({
        type: 'INTERNAL_HTTP',
        direction: 'INCOMING',
        method: req.method,
        endpoint: req.originalUrl || req.url,
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
        responseBody: sanitizedRes,
        durationMs,
        isSuccess,
        errorMessage,
        ip: req.ip || req.headers['x-forwarded-for'] || '',
      });
    } catch (err) {
      // Non-blocking error
      console.warn('Audit log write error:', err.message);
    }
  });

  next();
};
