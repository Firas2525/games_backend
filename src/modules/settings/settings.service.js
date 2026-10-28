import { Settings } from './settings.model.js';

export const getSettings = async () => {
  let settings = await Settings.findOne({ key: 'system_settings' });
  if (!settings) {
    settings = await Settings.create({
      key: 'system_settings',
      profitPercentage: 0,
      tickerText: 'أهلاً بكم في متجر الألعاب! شحن فوري وآلي لكافة الألعاب والبطاقات الرقمية على مدار الساعة.',
      isTickerActive: true,
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

