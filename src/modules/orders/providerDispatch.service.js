import { ApiLog } from '../logs/apiLog.model.js';

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

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
  let queryParams = {};
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
    // In SW Games, both 'uuid' and 'order_uuid' are sent, plus 'qty'
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

    // Log the custom order execution
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

    // Check if provider accepted the order
    if (res.ok) {
      const isReject =
        responseData &&
        (responseData.status === 'ERROR' ||
          responseData.status === 'reject' ||
          responseData.data?.status === 'reject' ||
          responseData.ok === false ||
          responseData.error);

      if (isReject) {
        isSuccess = false;
        errorMessage =
          responseData.msg ||
          responseData.message ||
          responseData.error ||
          responseData.data?.message ||
          'رفض مزود الخدمة تنفيذ الطلب';
      } else {
        isSuccess = true;
      }
    } else {
      isSuccess = false;
      errorMessage = `خطأ استجابة المزود (${statusCode}): ${responseData?.msg || responseData?.message || responseData?.error || text.slice(0, 200)}`;
    }
  } catch (err) {
    statusCode = 504;
    isSuccess = false;
    errorMessage = `تعذر الاتصال بالمزود: ${err.message}`;
    responseData = { error: err.message };
  }

  const durationMs = Date.now() - startTime;

  // Mask tokens in logged headers
  const sanitizedHeaders = { ...headers };
  if (sanitizedHeaders.apiToken) sanitizedHeaders.apiToken = '***MASKED***';
  if (sanitizedHeaders['api-token']) sanitizedHeaders['api-token'] = '***MASKED***';
  if (sanitizedHeaders.Cookie) sanitizedHeaders.Cookie = '***MASKED***';

  // Extract external provider order number if available
  let providerOrderId =
    responseData?.data?.order_id ||
    responseData?.order_id ||
    responseData?.data?.id ||
    responseData?.id ||
    null;

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
    status: isSuccess ? 'completed' : 'processing', // If error, keep in processing so admin can re-dispatch or review
    providerPayload: { targetUrl, params, headers: sanitizedHeaders },
    providerResponse: responseData,
    providerOrderId: providerOrderId ? String(providerOrderId) : orderUuid,
    errorMessage: isSuccess ? '' : errorMessage,
  };
};
