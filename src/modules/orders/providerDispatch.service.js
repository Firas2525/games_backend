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

  const msg = String(
    result.msg ||
      result.message ||
      result.error_message ||
      result.description ||
      result.data?.message ||
      ''
  ).toLowerCase();

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

    if (source === 'brand1card') {
      // Brand One Card response protocol:
      // { status: 'OK', data: { order_id: 123, status: 'accept' | 'wait' | 'reject' } }
      if (responseData?.status === 'OK' && responseData?.data) {
        const itemStatus = String(responseData.data.status || '').toLowerCase();
        if (itemStatus === 'accept') {
          isSuccess = true;
          finalStatus = 'completed';
        } else if (itemStatus === 'wait') {
          isSuccess = true;
          finalStatus = 'processing';
        } else {
          isSuccess = false;
          finalStatus = 'failed';
          errorMessage = responseData.data.message || responseData.msg || 'تم رفض الطلب من براند كارد';
        }
      } else {
        isSuccess = false;
        finalStatus = 'failed';
        errorMessage =
          responseData?.msg ||
          responseData?.message ||
          responseData?.error ||
          'فشل إرسال الطلب إلى براند كارد';
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
        errorMessage =
          responseData?.msg ||
          responseData?.message ||
          responseData?.error ||
          responseData?.data?.message ||
          (statusCode >= 400 ? `خطأ مزود الخدمة (${statusCode})` : 'رفض المزود الطلب');
      }
    }
  } catch (err) {
    statusCode = 504;
    isSuccess = false;
    finalStatus = 'failed';
    errorMessage = `تعذر الاتصال بالمزود: ${err.message}`;
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
    errorMessage,
  });

  return {
    success: isSuccess,
    status: finalStatus,
    providerPayload: { targetUrl, params, headers: sanitizedHeaders },
    providerResponse: responseData,
    providerOrderId: String(providerOrderId),
    errorMessage: isSuccess ? '' : errorMessage,
  };
};

/**
 * Checks external order status from provider API (mirroring goldsm_sync_pending_order)
 */
export const checkExternalOrderStatus = async (order) => {
  if (!order || !order.providerOrderId) {
    return { changed: false, status: order?.status };
  }

  const source = order.source;
  const providerOrderId = order.providerOrderId;

  try {
    // 1. SW Games / Roya check
    if (source === 'roya_usd' || source === 'roya_syp' || source === 'sw_games') {
      const isSyp = source === 'roya_syp';
      const token = isSyp
        ? (process.env.SW_GAMES_SYP_TOKEN || 'yzhm54xr2dh6778klm34c5y21')
        : (process.env.SW_GAMES_USD_TOKEN || 'i1zz8ajhxca9419asucqcmj6z6');

      const url = `https://sw-games.net/api/fastapi/checkorders?order_ids=${providerOrderId}`;
      const res = await fetch(url, {
        headers: { apiToken: token, Accept: 'application/json', 'User-Agent': BROWSER_USER_AGENT },
      });
      if (res.ok) {
        const data = await res.json();
        const ordersList = Array.isArray(data) ? data : data?.data || data?.orders || [];
        const item = ordersList.find((o) => String(o.order_id || o.order_number || o.id) === String(providerOrderId)) || ordersList[0];
        if (item) {
          const raw = String(item.status || item.order_status || item.status_name || '').toLowerCase();
          if (['1', 'true', 'completed', 'done', 'success', 'accepted', 'تم', 'منجز', 'مكتمل'].includes(raw)) {
            return { changed: true, status: 'completed', rawData: item };
          }
          if (
            ['2', '3', 'failed', 'fail', 'error', 'rejected', 'refused', 'cancelled', 'canceled', 'cancel', 'ملغي', 'فشل', 'مرفوض'].includes(raw) ||
            item.error ||
            item.ok === false
          ) {
            return { changed: true, status: 'failed', rawData: item };
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
          if (['reject', 'rejected', 'failed', 'error', 'canceled'].includes(st) || item.error) {
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
