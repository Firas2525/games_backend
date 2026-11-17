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

  // By default, strictly isolate to OUTGOING calls to external providers (Purchases, Checks, Probes)
  const filter = {
    direction: 'OUTGOING',
    type: { $in: ['PROVIDER_DISPATCH', 'PROVIDER_CHECK'] },
  };

  if (query.operation && query.operation !== 'all') {
    filter.operation = query.operation;
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
      { 'requestBody.playerId': { $regex: s, $options: 'i' } },
      { 'requestBody.Player_ID': { $regex: s, $options: 'i' } },
      { 'requestBody.player_id': { $regex: s, $options: 'i' } },
      { 'requestBody.order_uuid': { $regex: s, $options: 'i' } },
    ];
  }

  // Fast, light queries with strict timeouts
  const [rawLogs, total, errorCount] = await Promise.all([
    ApiLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .maxTimeMS(6000)
      .lean(),
    ApiLog.countDocuments(filter).maxTimeMS(4000).catch(() => 0),
    ApiLog.countDocuments({ ...filter, isSuccess: false }).maxTimeMS(4000).catch(() => 0),
  ]);

  // Sanitize and ensure no single log document exceeds 15KB
  const logs = rawLogs.map((log) => {
    let res = log.responseBody;
    if (res && typeof res === 'object') {
      try {
        const s = JSON.stringify(res);
        if (s.length > 12000) {
          res = {
            _truncated: true,
            summary: `رد مختصر (${Math.round(s.length / 1024)} KB)`,
            preview: s.slice(0, 3000) + '...',
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
    successCount: Math.max(0, total - errorCount),
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

export const deleteLogsBatch = async (ids = []) => {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { deletedCount: 0 };
  }
  const result = await ApiLog.deleteMany({ _id: { $in: ids } });
  return { deletedCount: result.deletedCount };
};

export const deleteSingleLog = async (id) => {
  const result = await ApiLog.findByIdAndDelete(id);
  return { deletedCount: result ? 1 : 0 };
};

export const deleteAllProviderLogs = async () => {
  const result = await ApiLog.deleteMany({
    $or: [
      { direction: 'OUTGOING' },
      { type: { $in: ['PROVIDER_DISPATCH', 'PROVIDER_CHECK'] } },
    ],
  });
  return { deletedCount: result.deletedCount };
};

export const clearOldLogs = async () => {
  // Keep last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await ApiLog.deleteMany({ createdAt: { $lt: thirtyDaysAgo } });
  return { deletedCount: result.deletedCount };
};
