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
    });
  }
  return settings;
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

