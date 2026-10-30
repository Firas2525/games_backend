import { ApiLog } from '../logs/apiLog.model.js';

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/**
 * Extracts order ID / order number from provider responses (mirroring goldsm_provider_response_order_number)
 */
export function extractProviderOrderId(result) {
  if (!result || typeof result !== 'object') return null;

  const strongKeys = [
    'order_number',
    'order_id',
    'orderNumber',
    'orderNo',
    'number',
    'uuid',
  ];
  const priorityContainers = [
    'data',
    'order',
    'orders',
    'item',
    'items',
    'result',
    'results',
    'record',
    'records',
    'payload',
    'response',
  ];
  const seen = new Set();

  function scalar(v) {
    if (v === null || v === undefined || v === false || v === true) return '';
    if (typeof v === 'string' || typeof v === 'number') {
      const s = String(v).trim();
      if (s && s.length <= 180) return s;
    }
    return '';
  }

  function walk(obj, depth = 0) {
    if (depth > 6 || !obj) return '';
    if (typeof obj === 'object') {
      if (seen.has(obj)) return '';
      seen.add(obj);
    }

    if (Array.isArray(obj)) {
      for (const item of obj) {
        const res = walk(item, depth + 1);
        if (res) return res;
      }
      return '';
    }

    if (typeof obj === 'object') {
      for (const k of strongKeys) {
        const val = scalar(obj[k]);
        if (val) return val;
      }

      const genericId = scalar(obj.id);
      if (
        genericId &&
        (obj.status ||
          String(genericId).toUpperCase().startsWith('ORD-') ||
          depth > 0)
      ) {
        return genericId;
      }

      for (const c of priorityContainers) {
        if (obj[c]) {
          const val = walk(obj[c], depth + 1);
          if (val) return val;
        }
      }

      for (const k of Object.keys(obj)) {
        if (typeof obj[k] === 'object') {
          const val = walk(obj[k], depth + 1);
          if (val) return val;
        }
      }
    }
    return '';
  }

  return walk(result) || null;
}

/**
 * Extracts all raw error text from a provider response (including Brand1Card replay_api arrays & Roya messages)
 */
export function extractRawProviderErrorText(result) {
  if (!result || typeof result !== 'object') return '';

  const parts = [];
  const pushStr = (v) => {
    if (typeof v === 'string' && v.trim()) {
      parts.push(v.trim());
    }
  };

  pushStr(result.msg);
  pushStr(result.message);
  pushStr(result.detail);
  pushStr(result.error_message);
  pushStr(result.description);
  if (typeof result.error === 'string') pushStr(result.error);

  if (result.data && typeof result.data === 'object') {
    pushStr(result.data.msg);
    pushStr(result.data.message);
    pushStr(result.data.detail);
    pushStr(result.data.error_message);

    // Brand One Card replay_api: e.g. [{ replay: ["Invalid Player ID"] }]
    const replayApi = result.data.replay_api || result.replay_api;
    if (Array.isArray(replayApi)) {
      for (const item of replayApi) {
        if (typeof item === 'string') {
          pushStr(item);
        } else if (item && typeof item === 'object') {
          if (Array.isArray(item.replay)) {
            item.replay.forEach(pushStr);
          } else {
            pushStr(item.replay);
            pushStr(item.message);
            pushStr(item.msg);
          }
        }
      }
    }
  }

  return Array.from(new Set(parts)).join(' | ');
}

/**
 * Maps any provider error response to a standardized, safe user-facing Arabic message:
 * 1. Insufficient provider balance -> 'حدث خطأ تواصل مع الدعم و حاول لاحقا'
 * 2. Invalid input / Player ID / User not found / Quantity out of range -> 'حدث خطأ تحقق من مدخلاتك و حاول مجددا'
 * 3. Any other error -> 'حدث خطأ حاول لاحقا'
 */
export function mapProviderUserErrorMessage(rawErrorText = '', result = null) {
  const combined = `${rawErrorText} ${extractRawProviderErrorText(result)}`.toLowerCase();
  const code = Number(result?.code);

  // 1. Insufficient Provider Balance
  const balanceKeywords = [
    'insufficient balance',
    'insufficient',
    'not enough balance',
    'الرصيد غير كاف',
    'رصيدك غير كاف',
    'رصيد غير كاف',
    'عدم كفاية الرصيد',
    'balance',
  ];
  if (code === 100 || balanceKeywords.some((kw) => combined.includes(kw))) {
    return 'حدث خطأ تواصل مع الدعم و حاول لاحقا';
  }

  // 2. Invalid Input / Player ID / User Not Found / Quantity Range
  const inputKeywords = [
    'invalid player',
    'player id',
    'playerid',
    'player_id',
    'invalid id',
    'wrong id',
    'user not found',
    'player not found',
    'account not found',
    'not found',
    'invalid',
    'مستخدم غير موجود',
    'اللاعب غير موجود',
    'الحساب غير موجود',
    'غير موجود',
    'الكمية يجب أن تكون',
    'الكمية',
    'quantity',
    'أقل كمية',
    'أقصى كمية',
    'غير صحيح',
    'غير صالح',
    'خاطئ',
    'مدخلات',
    'آيدي',
    'ايدي',
  ];
  if (inputKeywords.some((kw) => combined.includes(kw))) {
    return 'حدث خطأ تحقق من مدخلاتك و حاول مجددا';
  }

  // 3. Any Other Error
  return 'حدث خطأ حاول لاحقا';
}

/**
 * Checks if a response indicates a clear failure (mirroring goldsm_provider_clear_failure)
 */
export function isProviderClearFailure(result, statusCode) {
  if (statusCode && (statusCode >= 400 || statusCode === 0)) {
    return true;
  }
  if (!result || typeof result !== 'object') return false;
  if (result.error || result.ok === false) return true;

  const status = String(
    result.status || result.code || result.data?.status || ''
  ).toLowerCase();
  if (['error', 'failed', 'fail', 'rejected', 'reject'].includes(status)) {
    return true;
  }

  const msg = extractRawProviderErrorText(result).toLowerCase();

  const failureKeywords = [
    'insufficient',
    'not enough',
    'غير كاف',
    'غير كافي',
    'موقوف',
    'غير متوفر',
    'غير موجود',
    'not found',
    'invalid',
    'error',
    'failed',
    'refused',
    'مرفوض',
    'player',
    'unauthorized',
    'token',
    'balance',
    'الكمية يجب أن تكون',
  ];

  if (failureKeywords.some((kw) => msg.includes(kw))) {
    return true;
  }

  return false;
}

export const dispatchProviderOrder = async ({
  product,
  orderId,
  targetId,
  quantity = 1,
  extraFields = {},
  user,
}) => {
  const source = product?.source || 'custom';
  const externalId = product?.externalId;
  const startTime = Date.now();

  let targetUrl = '';
  let headers = {};
  let method = 'GET';
  let providerName = source;

  // Prepare standard params
  const orderUuid = `${orderId}-${Date.now().toString().slice(-4)}`;
  const params = {
    order_uuid: orderUuid,
    qty: quantity,
    ...(extraFields || {}),
  };
  if (targetId) {
    params.playerId = targetId;
    params.Player_ID = targetId;
    params.player_id = targetId;
  }

  // 1. SW Games (رؤيا دولار - ROYA_USD / رؤيا ليرة - ROYA_SYP)
  if (source === 'roya_usd' || source === 'roya_syp' || source === 'sw_games') {
    const isSyp = source === 'roya_syp';
    const token = isSyp
      ? (process.env.SW_GAMES_SYP_TOKEN || 'yzhm54xr2dh6778klm34c5y21')
      : (process.env.SW_GAMES_USD_TOKEN || 'i1zz8ajhxca9419asucqcmj6z6');

    providerName = isSyp ? 'roya_syp (رؤيا ليرة)' : 'roya_usd (رؤيا دولار)';
    const swParams = {
      ...params,
      uuid: orderUuid,
      order_uuid: orderUuid,
      qty: quantity,
    };
    if (targetId) {
      swParams.playerId = targetId;
      swParams.Player_ID = targetId;
      swParams.player_id = targetId;
    }
    const queryString = new URLSearchParams(swParams).toString();
    targetUrl = `https://sw-games.net/api/fastapi/requestorder/${externalId}/params?${queryString}`;
    headers = {
      apiToken: token,
      Accept: 'application/json',
      'User-Agent': BROWSER_USER_AGENT,
    };
  }
  // 2. Brand One Card (براند ون كارد)
  else if (source === 'brand1card') {
    const token =
      process.env.BRAND1CARD_API_TOKEN ||
      '3cf13f069cf8786bc75ed75794641e9cf34e467f6fe6ed892a9ff227941ea0b8';
    providerName = 'brand1card (براند ون كارد)';
    const brandParams = {
      ...params,
      order_uuid: orderUuid,
      qty: quantity,
    };
    if (targetId) {
      brandParams.playerId = targetId;
      brandParams.Player_ID = targetId;
      brandParams.player_id = targetId;
    }
    const queryString = new URLSearchParams(brandParams).toString();
    targetUrl = `https://api.brand-one-card.com/client/api/newOrder/${externalId}/params?${queryString}`;
    headers = {
      'api-token': token,
      Accept: 'application/json',
      'User-Agent': BROWSER_USER_AGENT,
    };
  }
  // 3. Syria Card / Auto1Card
  else if (source === 'syria_card' || source === 'auto1card') {
    const token =
      process.env.AUTO1CARD_API_TOKEN ||
      'vXxwuG4VVYkw9XGS7FCoOjshKTxr4-xV_Wfd7mPp4Sw-p_Q6h8T7hbxSeO11148N';
    providerName = 'syria_card (سيريا كارد)';
    const queryString = new URLSearchParams(params).toString();
    targetUrl = `https://api.auto1card.com/client/api/newOrder/${externalId}/params?${queryString}`;
    headers = {
      'api-token': token,
      Cookie: 'auto1card_v1=a5prjhmv2kpou405uj1bbua91b',
      Accept: 'application/json',
      'User-Agent': BROWSER_USER_AGENT,
    };
  }
  // 4. Custom / Manual
  else {
    const responsePayload = {
      success: true,
      status: 'completed',
      message: 'تم تسجيل الطلب للتنفيذ اليدوي في لوحة الإدارة',
      orderId,
    };

    await ApiLog.create({
      type: 'PROVIDER_DISPATCH',
      direction: 'OUTGOING',
      method: 'INTERNAL',
      endpoint: `[CUSTOM_FULFILLMENT]/${externalId || 'manual'}`,
      provider: 'custom',
      userId: user?._id || user?.id,
      userName: user?.name || '',
      userEmail: user?.email || '',
      userRole: user?.role || '',
      orderId,
      productName: product?.name || '',
      requestBody: params,
      statusCode: 200,
      responseBody: responsePayload,
      durationMs: 5,
      isSuccess: true,
    });

    return {
      success: true,
      status: 'completed',
      providerPayload: { targetUrl: 'internal://manual', params },
      providerResponse: responsePayload,
      providerOrderId: orderUuid,
    };
  }

  // Execute outgoing HTTP call to the provider API
  let statusCode = 500;
  let responseData = null;
  let isSuccess = false;
  let finalStatus = 'processing';
  let errorMessage = '';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35000);

    const res = await fetch(targetUrl, {
      method,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    statusCode = res.status;
    const text = await res.text();
    try {
      responseData = JSON.parse(text);
    } catch (_) {
      responseData = { raw: text };
    }

    // Extract provider order ID
    const extractedOrderId = extractProviderOrderId(responseData);
    const clearFailure = isProviderClearFailure(responseData, statusCode);

    let rawErrorText = '';

    if (source === 'brand1card') {
      // Brand One Card response protocol:
      // { status: 'OK', data: { order_id: 123, status: 'accept' | 'wait' | 'reject', replay_api: [...] } }
      if (responseData?.status === 'OK' && responseData?.data) {
        const itemStatus = String(responseData.data.status || '').toLowerCase();
        if (itemStatus === 'accept' || itemStatus === 'done' || itemStatus === 'completed') {
          isSuccess = true;
          finalStatus = 'completed';
        } else if (itemStatus === 'wait' || itemStatus === 'pending' || itemStatus === 'processing') {
          isSuccess = true;
          finalStatus = 'processing';
        } else {
          isSuccess = false;
          finalStatus = 'failed';
          rawErrorText =
            extractRawProviderErrorText(responseData) ||
            'تم رفض الطلب من براند كارد';
          errorMessage = mapProviderUserErrorMessage(rawErrorText, responseData);
        }
      } else {
        isSuccess = false;
        finalStatus = 'failed';
        rawErrorText =
          extractRawProviderErrorText(responseData) ||
          'فشل إرسال الطلب إلى براند كارد';
        errorMessage = mapProviderUserErrorMessage(rawErrorText, responseData);
      }
    } else {
      // SW Games (Roya) & Auto1Card
      if (!clearFailure && (extractedOrderId || res.ok)) {
        isSuccess = true;
        const rawStatus = String(responseData?.status || responseData?.data?.status || '').toLowerCase();
        if (['1', 'true', 'completed', 'complete', 'done', 'success', 'accepted'].includes(rawStatus)) {
          finalStatus = 'completed';
        } else {
          finalStatus = 'processing'; // Legacy default: ⏳ قيد التنفيذ
        }
      } else {
        isSuccess = false;
        finalStatus = 'failed';
        rawErrorText =
          extractRawProviderErrorText(responseData) ||
          (statusCode >= 400 ? `خطأ مزود الخدمة (${statusCode})` : 'رفض المزود الطلب');
        errorMessage = mapProviderUserErrorMessage(rawErrorText, responseData);
      }
    }
  } catch (err) {
    statusCode = 504;
    isSuccess = false;
    finalStatus = 'failed';
    errorMessage = 'حدث خطأ حاول لاحقا';
    responseData = { error: err.message };
  }

  const durationMs = Date.now() - startTime;

  // Mask sensitive tokens in logs
  const sanitizedHeaders = { ...headers };
  if (sanitizedHeaders.apiToken) sanitizedHeaders.apiToken = '***MASKED***';
  if (sanitizedHeaders['api-token']) sanitizedHeaders['api-token'] = '***MASKED***';
  if (sanitizedHeaders.Cookie) sanitizedHeaders.Cookie = '***MASKED***';

  const providerOrderId = extractProviderOrderId(responseData) || orderUuid;

  // Record audit log for OUTGOING provider API call
  await ApiLog.create({
    type: 'PROVIDER_DISPATCH',
    direction: 'OUTGOING',
    method,
    endpoint: targetUrl,
    provider: source,
    userId: user?._id || user?.id,
    userName: user?.name || '',
    userEmail: user?.email || '',
    userRole: user?.role || '',
    orderId,
    productName: product?.name || '',
    requestHeaders: sanitizedHeaders,
    requestBody: params,
    statusCode,
    responseBody: responseData,
    durationMs,
    isSuccess,
    errorMessage: isSuccess ? '' : (extractRawProviderErrorText(responseData) || errorMessage),
  });

  return {
    success: isSuccess,
    status: finalStatus,
    providerPayload: { targetUrl, params, headers: sanitizedHeaders },
    providerResponse: responseData,
    providerOrderId: String(providerOrderId),
    errorMessage: isSuccess ? '' : (errorMessage || 'حدث خطأ حاول لاحقا'),
    userMessage: isSuccess ? 'تم استقبال الطلب بنجاح' : (errorMessage || 'حدث خطأ حاول لاحقا'),
  };
};

/**
 * Checks external order status from provider API (mirroring goldsm_sync_pending_order)
 */
export const checkExternalOrderStatus = async (order) => {
  if (!order) {
    return { changed: false, status: order?.status };
  }

  const source = order.source;
  const providerOrderId = order.providerOrderId || order.providerPayload?.params?.order_uuid || order.orderId;

  if (!providerOrderId) {
    return { changed: false, status: order.status };
  }

  try {
    // 1. SW Games / Roya check
    if (source === 'roya_usd' || source === 'roya_syp' || source === 'sw_games') {
      const isSyp = source === 'roya_syp';
      const token = isSyp
        ? (process.env.SW_GAMES_SYP_TOKEN || 'yzhm54xr2dh6778klm34c5y21')
        : (process.env.SW_GAMES_USD_TOKEN || 'i1zz8ajhxca9419asucqcmj6z6');

      // First check using single order direct endpoint: /order/{id_or_uuid}
      try {
        const singleUrl = `https://sw-games.net/api/fastapi/order/${providerOrderId}`;
        const singleRes = await fetch(singleUrl, {
          headers: { apiToken: token, Accept: 'application/json', 'User-Agent': BROWSER_USER_AGENT },
        });

        if (singleRes.ok) {
          const singleData = await singleRes.json();
          const orderObj = singleData?.data?.order || singleData?.order;
          if (orderObj) {
            const raw = String(orderObj.status || '').toLowerCase();
            if (['1', 'true', 'completed', 'complete', 'done', 'success', 'accepted', 'تم', 'منجز', 'مكتمل'].includes(raw)) {
              return { changed: true, status: 'completed', rawData: orderObj };
            }
            if (['2', '3', 'cancelled', 'canceled', 'cancel', 'failed', 'fail', 'error', 'rejected', 'refused', 'ملغي', 'فشل', 'مرفوض'].includes(raw) || orderObj.error) {
              return { changed: true, status: 'failed', rawData: orderObj };
            }
            if (['0', 'processing', 'pending', 'wait', 'waiting', 'inprogress'].includes(raw)) {
              return { changed: order.status !== 'processing', status: 'processing', rawData: orderObj };
            }
          }
        }
      } catch (_) {}

      // Fallback to /checkorders endpoint
      const url = `https://sw-games.net/api/fastapi/checkorders?order_ids=${providerOrderId}`;
      const res = await fetch(url, {
        headers: { apiToken: token, Accept: 'application/json', 'User-Agent': BROWSER_USER_AGENT },
      });
      if (res.ok) {
        const data = await res.json();
        const ordersList = Array.isArray(data?.data?.orders)
          ? data.data.orders
          : Array.isArray(data?.orders)
          ? data.orders
          : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data)
          ? data
          : [];

        const item = ordersList.find((o) => {
          const keys = [o.order_id, o.order_number, o.id, o.uuid].filter(Boolean).map(String);
          return keys.includes(String(providerOrderId));
        }) || ordersList[0];

        if (item) {
          const raw = String(item.status || item.order_status || item.status_name || '').toLowerCase();
          if (['1', 'true', 'completed', 'complete', 'done', 'success', 'accepted', 'تم', 'منجز', 'مكتمل'].includes(raw)) {
            return { changed: true, status: 'completed', rawData: item };
          }
          if (
            ['2', '3', 'cancelled', 'canceled', 'cancel', 'failed', 'fail', 'error', 'rejected', 'refused', 'ملغي', 'فشل', 'مرفوض'].includes(raw) ||
            item.error ||
            item.ok === false
          ) {
            return { changed: true, status: 'failed', rawData: item };
          }
          if (['0', 'processing', 'pending', 'wait', 'waiting'].includes(raw)) {
            return { changed: order.status !== 'processing', status: 'processing', rawData: item };
          }
        } else if (data?.ok === false || data?.error) {
          return { changed: true, status: 'failed', rawData: data };
        }
      } else if (res.status === 400 || res.status === 401 || res.status === 404) {
        return { changed: true, status: 'failed', rawData: { error: `HTTP ${res.status}` } };
      }
    }
    // 2. Brand One Card check
    else if (source === 'brand1card') {
      const token =
        process.env.BRAND1CARD_API_TOKEN ||
        '3cf13f069cf8786bc75ed75794641e9cf34e467f6fe6ed892a9ff227941ea0b8';
      const url = `https://api.brand-one-card.com/client/api/check?orders=[${providerOrderId}]`;
      const res = await fetch(url, {
        headers: { 'api-token': token, Accept: 'application/json', 'User-Agent': BROWSER_USER_AGENT },
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data?.data) ? data.data : [];
        const item = list.find((o) => String(o.order_id) === String(providerOrderId)) || list[0];
        if (item) {
          const st = String(item.status || '').toLowerCase();
          if (['accept', 'completed', 'done', 'success'].includes(st)) {
            return { changed: true, status: 'completed', rawData: item };
          }
          if (['reject', 'rejected', 'failed', 'error', 'canceled', 'cancelled'].includes(st) || item.error) {
            return { changed: true, status: 'failed', rawData: item };
          }
        }
      }
    }
  } catch (err) {
    console.error('Check external order status error:', err);
  }

  return { changed: false, status: order.status };
};

/**
 * Batch checks status for multiple SW Games orders in a single API call (mirroring checkorders?order_ids=...)
 */
export const checkSwGamesOrdersBatch = async (orders, isSyp = false) => {
  if (!orders || orders.length === 0) return new Map();

  const token = isSyp
    ? (process.env.SW_GAMES_SYP_TOKEN || 'yzhm54xr2dh6778klm34c5y21')
    : (process.env.SW_GAMES_USD_TOKEN || 'i1zz8ajhxca9419asucqcmj6z6');

  const idToOrder = new Map();
  const allIds = new Set();

  for (const o of orders) {
    const ids = [
      o.providerOrderId,
      o.providerResponse?.data?.order?.order_number,
      o.providerResponse?.order_number,
      o.providerResponse?.data?.order?.uuid,
      o.providerResponse?.uuid,
      o.providerResponse?.data?.order?.id,
      o.providerPayload?.params?.order_uuid,
      o.providerPayload?.params?.uuid,
      o.orderId,
    ].filter(Boolean);

    for (const id of ids) {
      const s = String(id).trim();
      allIds.add(s);
      idToOrder.set(s, o);
    }
  }

  if (allIds.size === 0) return new Map();

  const results = new Map(); // order._id -> { status, rawData }

  try {
    const idsString = Array.from(allIds).join(',');
    const url = `https://sw-games.net/api/fastapi/checkorders?order_ids=${idsString}`;
    const res = await fetch(url, {
      headers: { apiToken: token, Accept: 'application/json', 'User-Agent': BROWSER_USER_AGENT },
    });

    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data?.data?.orders)
        ? data.data.orders
        : Array.isArray(data?.orders)
        ? data.orders
        : Array.isArray(data?.data)
        ? data.data
        : [];

      for (const item of list) {
        const itemKeys = [
          item.order_number,
          item.order_id,
          item.id,
          item.uuid,
        ].filter(Boolean).map(String);

        let matchedOrder = null;
        for (const k of itemKeys) {
          if (idToOrder.has(k)) {
            matchedOrder = idToOrder.get(k);
            break;
          }
        }

        if (!matchedOrder && orders.length === 1) {
          matchedOrder = orders[0];
        }

        if (matchedOrder) {
          const raw = String(item.status || item.order_status || item.status_name || '').toLowerCase();
          let resolvedStatus = 'processing';

          if (['1', 'true', 'completed', 'complete', 'done', 'success', 'accepted', 'تم', 'مكتمل'].includes(raw)) {
            resolvedStatus = 'completed';
          } else if (
            ['2', '3', 'cancelled', 'canceled', 'cancel', 'failed', 'fail', 'error', 'rejected', 'refused', 'ملغي', 'فشل', 'مرفوض'].includes(raw) ||
            item.error ||
            item.ok === false
          ) {
            resolvedStatus = 'failed';
          }

          results.set(matchedOrder._id.toString(), {
            status: resolvedStatus,
            providerOrderNumber: item.order_number || matchedOrder.providerOrderId,
            rawData: item,
          });
        }
      }
    }
  } catch (err) {
    console.error('Batch check SW Games orders error:', err);
  }

  // Fallback for any order not resolved by checkorders, OR completed without reply/card details: use /order/{id}
  for (const o of orders) {
    const key = o._id.toString();
    const existingRes = results.get(key);
    const hasReplyDetails =
      existingRes?.rawData &&
      (existingRes.rawData.reply ||
        existingRes.rawData.replay ||
        existingRes.rawData.code ||
        existingRes.rawData.pin ||
        existingRes.rawData.serial ||
        existingRes.rawData.cards);

    if (!existingRes || (existingRes.status === 'completed' && !hasReplyDetails)) {
      const singleId =
        existingRes?.providerOrderNumber ||
        o.providerOrderId ||
        o.providerPayload?.params?.order_uuid ||
        o.orderId;
      if (singleId) {
        try {
          const singleUrl = `https://sw-games.net/api/fastapi/order/${singleId}`;
          const singleRes = await fetch(singleUrl, {
            headers: { apiToken: token, Accept: 'application/json', 'User-Agent': BROWSER_USER_AGENT },
          });
          if (singleRes.ok) {
            const singleData = await singleRes.json();
            const orderObj = singleData?.data?.order || singleData?.order;
            if (orderObj) {
              const raw = String(orderObj.status || '').toLowerCase();
              let resolvedStatus = existingRes?.status || 'processing';
              if (['1', 'true', 'completed', 'complete', 'done', 'success', 'accepted'].includes(raw)) {
                resolvedStatus = 'completed';
              } else if (['2', '3', 'cancelled', 'canceled', 'cancel', 'failed', 'fail', 'error', 'rejected', 'refused'].includes(raw)) {
                resolvedStatus = 'failed';
              }
              results.set(key, {
                status: resolvedStatus,
                providerOrderNumber: orderObj.order_number || o.providerOrderId,
                rawData: { ...(existingRes?.rawData || {}), ...orderObj },
              });
            }
          }
        } catch (_) {}
      }
    }
  }

  return results;
};

/**
 * Extracts card details, PINs, voucher codes, or fulfillment replies ONLY for completed orders.
 * Supports Brand1Card (replay_api, cards, code), Roya/SW Games (reply, code, pin, serial, cards),
 * and Custom Provider (adminNote, responseData).
 */
export function extractOrderDeliveryDetails(order) {
  if (!order || order.status !== 'completed') return '';
  const resp = order.providerResponse;
  if (!resp || typeof resp !== 'object') return '';

  const lines = [];
  const ignoredPhrases = new Set([
    'ok',
    'success',
    'accept',
    'completed',
    'done',
    'true',
    '1',
    'تم تسجيل الطلب للتنفيذ اليدوي في لوحة الإدارة',
    'طلب قيد المعالجة اليدوية من قبل إدارة المتجر',
  ]);

  const addLine = (val, label = '') => {
    if (val === null || val === undefined) return;
    if (typeof val === 'string' || typeof val === 'number') {
      const s = String(val).trim();
      if (!s || ignoredPhrases.has(s.toLowerCase())) return;
      lines.push(label ? `${label}: ${s}` : s);
    }
  };

  // 1. Custom Provider (مزودي الخاص)
  if (resp.adminNote) addLine(resp.adminNote);
  if (resp.responseData) {
    if (typeof resp.responseData === 'string') {
      addLine(resp.responseData);
    } else if (typeof resp.responseData === 'object') {
      for (const [k, v] of Object.entries(resp.responseData)) {
        addLine(v, k);
      }
    }
  }

  // 2. Brand One Card (replay_api inside root or data)
  const replayArrays = [resp.replay_api, resp.data?.replay_api].filter(Array.isArray);
  for (const arr of replayArrays) {
    for (const item of arr) {
      if (typeof item === 'string') {
        addLine(item);
      } else if (item && typeof item === 'object') {
        if (Array.isArray(item.replay)) {
          item.replay.forEach((r) => addLine(r));
        } else {
          addLine(item.replay);
          addLine(item.code);
          addLine(item.pin);
          addLine(item.serial);
          addLine(item.card);
        }
      }
    }
  }

  // 3. Roya / SW Games & general card/voucher fields
  const containers = [resp, resp.data, resp.data?.order, resp.order].filter(
    (c) => c && typeof c === 'object'
  );

  for (const c of containers) {
    addLine(c.reply);
    if (typeof c.replay === 'string') addLine(c.replay);
    addLine(c.code, 'الكود');
    addLine(c.pin, 'PIN');
    addLine(c.serial, 'الرقم التسلسلي');
    addLine(c.voucher, 'القسيمة');
    addLine(c.card_number || c.cardNumber, 'رقم البطاقة');
    addLine(c.cvv || c.cvc, 'CVV');
    addLine(c.expiry || c.exp_date || c.expiration, 'تاريخ الانتهاء');
    addLine(c.note);

    if (Array.isArray(c.cards)) {
      for (const card of c.cards) {
        if (typeof card === 'string') {
          addLine(card);
        } else if (card && typeof card === 'object') {
          for (const [k, v] of Object.entries(card)) {
            addLine(v, k);
          }
        }
      }
    }
  }

  return Array.from(new Set(lines)).join('\n');
}

/**
 * Formats order execution duration in clean Arabic text
 */
export function formatDurationArabic(seconds) {
  if (seconds === null || seconds === undefined || isNaN(seconds) || seconds < 0) {
    return '';
  }
  const sec = Math.round(seconds);
  if (sec <= 2) return 'فوري (أقل من ثانيتين)';
  if (sec < 60) return `${sec} ثانية`;
  const mins = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (mins < 60) {
    const minStr = mins === 1 ? 'دقيقة' : mins === 2 ? 'دقيقتين' : `${mins} دقائق`;
    return remSec > 0 ? `${minStr} و ${remSec} ثانية` : minStr;
  }
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  const hrStr = hours === 1 ? 'ساعة' : hours === 2 ? 'ساعتين' : `${hours} ساعات`;
  return remMins > 0 ? `${hrStr} و ${remMins} دقيقة` : hrStr;
}
