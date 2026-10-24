import { ApiLog } from './apiLog.model.js';

// Auto-cleanup any bloated /logs or /products records from earlier tests on service load
(async () => {
  try {
    await ApiLog.deleteMany({
      $or: [
        { endpoint: { $regex: '/logs' } },
        { endpoint: { $regex: '/products' } },
      ],
    });
  } catch (_) {}
})();

export const getLogs = async (query = {}) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 30));
  const skip = (page - 1) * limit;

  const filter = {};

  if (query.type && query.type !== 'all') {
    filter.type = query.type;
  }
  if (query.direction && query.direction !== 'all') {
    filter.direction = query.direction;
  }
  if (query.provider && query.provider !== 'all') {
    filter.provider = query.provider;
  }
  if (query.isSuccess !== undefined && query.isSuccess !== null && query.isSuccess !== 'all') {
    filter.isSuccess = query.isSuccess === 'true' || query.isSuccess === true;
  }
  if (query.search) {
    const s = query.search.trim();
    filter.$or = [
      { endpoint: { $regex: s, $options: 'i' } },
      { orderId: { $regex: s, $options: 'i' } },
      { userName: { $regex: s, $options: 'i' } },
      { userEmail: { $regex: s, $options: 'i' } },
      { productName: { $regex: s, $options: 'i' } },
      { provider: { $regex: s, $options: 'i' } },
      { errorMessage: { $regex: s, $options: 'i' } },
    ];
  }

  // Fast, light queries with strict timeouts
  const [rawLogs, total, providerCount, errorCount] = await Promise.all([
    ApiLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .maxTimeMS(6000)
      .lean(),
    ApiLog.countDocuments(filter).maxTimeMS(4000).catch(() => 0),
    ApiLog.countDocuments({ type: 'PROVIDER_DISPATCH' }).maxTimeMS(4000).catch(() => 0),
    ApiLog.countDocuments({ isSuccess: false }).maxTimeMS(4000).catch(() => 0),
  ]);

  // Sanitize and ensure no single log document exceeds 10KB
  const logs = rawLogs.map((log) => {
    let res = log.responseBody;
    if (res && typeof res === 'object') {
      try {
        const s = JSON.stringify(res);
        if (s.length > 8000) {
          res = {
            _truncated: true,
            summary: `رد مختصر (${Math.round(s.length / 1024)} KB)`,
            preview: s.slice(0, 1500) + '...',
          };
        }
      } catch (_) {}
    }
    return {
      ...log,
      responseBody: res,
    };
  });

  const summary = {
    totalCount: total,
    providerDispatches: providerCount,
    internalHttp: Math.max(0, total - providerCount),
    errors: errorCount,
  };

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
    summary,
  };
};

export const getLogDetails = async (id) => {
  const log = await ApiLog.findById(id).maxTimeMS(5000).lean();
  if (!log) {
    throw new Error('Log entry not found');
  }
  return log;
};

export const clearOldLogs = async () => {
  // Keep last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await ApiLog.deleteMany({ createdAt: { $lt: thirtyDaysAgo } });
  return { deletedCount: result.deletedCount };
};
