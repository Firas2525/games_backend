import { Settings } from './settings.model.js';

export const getSettings = async () => {
  let settings = await Settings.findOne({ key: 'system_settings' });
  if (!settings) {
    settings = await Settings.create({ key: 'system_settings', profitPercentage: 0 });
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
  await settings.save();
  return settings;
};
