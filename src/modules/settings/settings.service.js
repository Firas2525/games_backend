import { Settings } from './settings.model.js';
import { LEVEL_CONFIG, LEVELS } from '../../constants/levels.js';

export const getSettings = async () => {
  let settings = await Settings.findOne({ key: 'system_settings' });
  if (!settings) {
    settings = await Settings.create({
      key: 'system_settings',
      profitPercentage: 0,
      tickerText: 'أهلاً بكم في متجر الألعاب! شحن فوري وآلي لكافة الألعاب والبطاقات الرقمية على مدار الساعة.',
      isTickerActive: true,
      cashbackPercentage: 5,
      coinsPerDollar: 100,
      isCashbackActive: true,
      isMaintenance: false,
      maintenanceTitle: 'أعمال صيانة وتحديث',
      maintenanceMessage: 'نقوم حالياً ببعض أعمال الصيانة والتحسينات الدورية لنقدم لكم تجربة أفضل وأسرع. سنعود للعمل قريباً جداً، نشكر تفهمكم!',
    });
  }
  return settings;
};

/**
 * Returns effective exchange rates:
 * - buyRate: lower rate, used when user receives SYP (e.g. deposit into SYP account, salary withdrawal to SYP, USD->SYP conversion).
 * - sellRate: higher rate, used when user buys goods or buys USD with SYP (e.g. products priced in SYP, SYP->USD deposit/conversion).
 */
export const getEffectiveExchangeRates = (settings = {}) => {
  const baseRate = Number(settings?.exchangeRateUsdToSyp) || 15000;
  const buyRate = Number(settings?.exchangeRateUsdToSypBuy) > 0 ? Number(settings.exchangeRateUsdToSypBuy) : baseRate;
  const sellRate = Number(settings?.exchangeRateUsdToSypSell) > 0 ? Number(settings.exchangeRateUsdToSypSell) : baseRate;
  return { buyRate, sellRate, baseRate };
};

export const updateSettings = async (data = {}) => {
  let settings = await Settings.findOne({ key: 'system_settings' });
  if (!settings) {
    settings = new Settings({ key: 'system_settings' });
  }
  if (data.profitPercentage !== undefined) {
    settings.profitPercentage = Math.max(0, Number(data.profitPercentage) || 0);
  }
  if (data.tickerText !== undefined) {
    settings.tickerText = String(data.tickerText || '').trim();
  }
  if (data.isTickerActive !== undefined) {
    settings.isTickerActive = Boolean(data.isTickerActive);
  }
  if (data.exchangeRateUsdToSyp !== undefined) {
    settings.exchangeRateUsdToSyp = Math.max(1, Number(data.exchangeRateUsdToSyp) || 15000);
    // If specific buy/sell rates are not yet set or not provided, keep them in sync with base rate
    if (data.exchangeRateUsdToSypBuy === undefined && !settings.exchangeRateUsdToSypBuy) {
      settings.exchangeRateUsdToSypBuy = settings.exchangeRateUsdToSyp;
    }
    if (data.exchangeRateUsdToSypSell === undefined && !settings.exchangeRateUsdToSypSell) {
      settings.exchangeRateUsdToSypSell = settings.exchangeRateUsdToSyp;
    }
  }
  if (data.exchangeRateUsdToSypBuy !== undefined) {
    settings.exchangeRateUsdToSypBuy = Math.max(1, Number(data.exchangeRateUsdToSypBuy) || settings.exchangeRateUsdToSyp || 15000);
  }
  if (data.exchangeRateUsdToSypSell !== undefined) {
    settings.exchangeRateUsdToSypSell = Math.max(1, Number(data.exchangeRateUsdToSypSell) || settings.exchangeRateUsdToSyp || 15000);
  }
  if (data.whatsappSupport !== undefined) {
    settings.whatsappSupport = String(data.whatsappSupport || '').trim();
  }
  if (data.telegramChannel !== undefined) {
    settings.telegramChannel = String(data.telegramChannel || '').trim();
  }
  if (data.cashbackPercentage !== undefined) {
    settings.cashbackPercentage = Math.max(0, Number(data.cashbackPercentage) || 0);
  }
  if (data.coinsPerDollar !== undefined) {
    settings.coinsPerDollar = Math.max(1, Math.round(Number(data.coinsPerDollar)) || 100);
  }
  if (data.isCashbackActive !== undefined) {
    settings.isCashbackActive = Boolean(data.isCashbackActive);
  }
  await settings.save();
  return settings;
};

/**
 * Returns effective exchange rates:
 * - buyRate: lower rate, used when user receives SYP (e.g. deposit into SYP account, salary withdrawal to SYP, USD->SYP conversion).
 * - sellRate: higher rate, used when user buys goods or buys USD with SYP (e.g. products priced in SYP, SYP->USD deposit/conversion).
 */
export const getEffectiveExchangeRates = (settings = {}) => {
  const baseRate = Number(settings?.exchangeRateUsdToSyp) || 15000;
  const buyRate = Number(settings?.exchangeRateUsdToSypBuy) > 0 ? Number(settings.exchangeRateUsdToSypBuy) : baseRate;
  const sellRate = Number(settings?.exchangeRateUsdToSypSell) > 0 ? Number(settings.exchangeRateUsdToSypSell) : baseRate;
  return { buyRate, sellRate, baseRate };
};

export const getTickerSettings = async () => {
  const settings = await getSettings();
  return {
    tickerText: settings.tickerText || '',
    isTickerActive: settings.isTickerActive !== false,
  };
};

export const updateTickerSettings = async ({ tickerText, isTickerActive }) => {
  return await updateSettings({ tickerText, isTickerActive });
};

export const getLevelSettings = async () => {
  const settings = await getSettings();
  const badgesMap = settings.levelBadges || new Map();

  const getBadge = (key) => {
    if (badgesMap instanceof Map) return badgesMap.get(key) || '';
    if (typeof badgesMap === 'object') return badgesMap[key] || '';
    return '';
  };

  const levels = LEVEL_CONFIG.map((tier) => ({
    ...tier,
    badgeUrl: getBadge(tier.key),
  }));

  const badges = {};
  for (const tier of LEVEL_CONFIG) {
    badges[tier.key] = getBadge(tier.key);
  }

  return {
    levels,
    badges,
  };
};

export const updateLevelBadge = async ({ levelKey, badgeUrl }) => {
  if (!levelKey || !Object.values(LEVELS).includes(levelKey)) {
    throw new Error('مفتاح المستوى غير صالح');
  }

  const settings = await getSettings();
  if (!settings.levelBadges) {
    settings.levelBadges = new Map();
  }

  const cleanUrl = badgeUrl ? String(badgeUrl).trim() : '';
  if (cleanUrl) {
    if (settings.levelBadges instanceof Map) {
      settings.levelBadges.set(levelKey, cleanUrl);
    } else {
      settings.levelBadges[levelKey] = cleanUrl;
    }
  } else {
    if (settings.levelBadges instanceof Map) {
      settings.levelBadges.delete(levelKey);
    } else {
      delete settings.levelBadges[levelKey];
    }
  }

  settings.markModified('levelBadges');
  await settings.save();

  return await getLevelSettings();
};

export const getMaintenanceSettings = async () => {
  const settings = await getSettings();
  return {
    isMaintenance: Boolean(settings.isMaintenance),
    maintenanceTitle: settings.maintenanceTitle || 'أعمال صيانة وتحديث',
    maintenanceMessage: settings.maintenanceMessage || 'نقوم حالياً ببعض أعمال الصيانة والتحسينات الدورية لنقدم لكم تجربة أفضل وأسرع. سنعود للعمل قريباً جداً، نشكر تفهمكم!',
    updatedAt: settings.updatedAt,
  };
};

export const updateMaintenanceSettings = async ({ isMaintenance, maintenanceTitle, maintenanceMessage }) => {
  let settings = await Settings.findOne({ key: 'system_settings' });
  if (!settings) {
    settings = new Settings({ key: 'system_settings' });
  }
  if (isMaintenance !== undefined) {
    settings.isMaintenance = Boolean(isMaintenance);
  }
  if (maintenanceTitle !== undefined) {
    settings.maintenanceTitle = String(maintenanceTitle || '').trim();
  }
  if (maintenanceMessage !== undefined) {
    settings.maintenanceMessage = String(maintenanceMessage || '').trim();
  }
  await settings.save();
  return {
    isMaintenance: Boolean(settings.isMaintenance),
    maintenanceTitle: settings.maintenanceTitle,
    maintenanceMessage: settings.maintenanceMessage,
    updatedAt: settings.updatedAt,
  };
};

function compareSemver(v1, v2) {
  const p1 = String(v1 || '0').split('.').map((x) => parseInt(x, 10) || 0);
  const p2 = String(v2 || '0').split('.').map((x) => parseInt(x, 10) || 0);
  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const a = p1[i] || 0;
    const b = p2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

export const getAppUpdateSettings = async (clientQuery = {}) => {
  const settings = await getSettings();
  const latestVersion = settings.appVersion || '1.0.0';
  const latestBuildNumber = Number(settings.appBuildNumber) || 1;
  const isForceUpdate = Boolean(settings.isForceUpdate);
  const updateTitle = settings.updateTitle || 'تحديث جديد متوفر 🚀';
  const updateNotes =
    settings.updateNotes ||
    'يتوفر إصدار جديد يحتوي على تحسينات هامة وسرعة أكبر في تنفيذ الطلبات وإصلاحات عامة.';
  const appDownloadUrl =
    settings.appDownloadUrl || 'https://games-backend-c0h7.onrender.com/download';

  const clientVersion = clientQuery.currentVersion || clientQuery.version || '';
  const clientBuild = parseInt(clientQuery.currentBuildNumber || clientQuery.buildNumber, 10);

  let hasUpdate = false;
  if (!isNaN(clientBuild) && clientBuild > 0) {
    hasUpdate = latestBuildNumber > clientBuild;
  } else if (clientVersion) {
    hasUpdate = compareSemver(latestVersion, clientVersion) > 0;
  }

  return {
    hasUpdate,
    isForceUpdate,
    latestVersion,
    latestBuildNumber,
    updateTitle,
    updateNotes,
    appDownloadUrl,
    updatedAt: settings.updatedAt,
  };
};

export const updateAppUpdateSettings = async ({
  appVersion,
  appBuildNumber,
  isForceUpdate,
  updateTitle,
  updateNotes,
  appDownloadUrl,
}) => {
  let settings = await Settings.findOne({ key: 'system_settings' });
  if (!settings) {
    settings = new Settings({ key: 'system_settings' });
  }

  if (appVersion !== undefined) settings.appVersion = String(appVersion || '').trim();
  if (appBuildNumber !== undefined) settings.appBuildNumber = Number(appBuildNumber) || 1;
  if (isForceUpdate !== undefined) settings.isForceUpdate = Boolean(isForceUpdate);
  if (updateTitle !== undefined) settings.updateTitle = String(updateTitle || '').trim();
  if (updateNotes !== undefined) settings.updateNotes = String(updateNotes || '').trim();
  if (appDownloadUrl !== undefined) settings.appDownloadUrl = String(appDownloadUrl || '').trim();

  await settings.save();

  return {
    appVersion: settings.appVersion,
    appBuildNumber: settings.appBuildNumber,
    isForceUpdate: Boolean(settings.isForceUpdate),
    updateTitle: settings.updateTitle,
    updateNotes: settings.updateNotes,
    appDownloadUrl: settings.appDownloadUrl,
    updatedAt: settings.updatedAt,
  };
};



