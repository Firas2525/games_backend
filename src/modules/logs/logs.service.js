import { ApiLog } from './apiLog.model.js';

export const getLogs = async (query = {}) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(query.limit) || 50));
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

  const [logs, total, stats] = await Promise.all([
    ApiLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ApiLog.countDocuments(filter),
    ApiLog.aggregate([
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
          providerDispatches: {
            $sum: { $cond: [{ $eq: ['$type', 'PROVIDER_DISPATCH'] }, 1, 0] },
          },
          internalHttp: {
            $sum: { $cond: [{ $eq: ['$type', 'INTERNAL_HTTP'] }, 1, 0] },
          },
          errors: {
            $sum: { $cond: [{ $eq: ['$isSuccess', false] }, 1, 0] },
          },
        },
      },
    ]),
  ]);

  const summary = stats[0] || {
    totalCount: total,
    providerDispatches: 0,
    internalHttp: 0,
    errors: 0,
  };

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    summary,
  };
};

export const getLogDetails = async (id) => {
  const log = await ApiLog.findById(id).lean();
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
