import { ApiLog } from '../modules/logs/apiLog.model.js';

// Purge all stored API logs from database to free memory and disk
(async () => {
  try {
    await ApiLog.deleteMany({});
    console.log('[AuditLog] Cleaned up legacy API logs. Persistent API logging is disabled.');
  } catch (_) {}
})();

/**
 * Disabled API logging middleware - avoids storing requests in DB or memory.
 */
export const auditLogMiddleware = (req, res, next) => {
  next();
};

export default auditLogMiddleware;
