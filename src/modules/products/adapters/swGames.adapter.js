import { detectMainCategory } from '../utils/categorizer.js';

export const normalizeSwGamesImage = (item = {}) => {
  const outerKeys = [
    'image',
    'gameImage',
    'game_image',
    'gameImg',
    'game_img',
    'categoryImage',
    'category_image',
    'categoryImg',
    'category_img',
    'appImage',
    'app_image',
    'cover',
    'coverImage',
    'cover_image',
    'banner',
    'icon',
    'logo',
  ];

  let rawImg = '';
  for (const k of outerKeys) {
    if (item[k] && typeof item[k] === 'string' && item[k].trim()) {
      rawImg = item[k].trim();
      break;
    }
  }

  if (!rawImg) return '';

  rawImg = rawImg.replaceAll('\\', '/');
  if (rawImg.startsWith('http://127.0.0.1:8000')) {
    return rawImg.replace('http://127.0.0.1:8000', 'https://sw-games.net');
  }
  if (rawImg.startsWith('https://127.0.0.1:8000')) {
    return rawImg.replace('https://127.0.0.1:8000', 'https://sw-games.net');
  }
  if (rawImg.startsWith('/')) {
    return `https://sw-games.net${rawImg}`;
  }
  return rawImg;
};

export const normalizeSwGamesProduct = (
  item,
  sourceKey = 'roya_usd',
  sourceName = 'رؤيا دولار'
) => {
  const minCount = item.minCount ? parseInt(item.minCount) : 1;
  const maxCount = item.maxCount ? parseInt(item.maxCount) : null;
  const rawQtyValues = item.qty_values || item.qtyValues || null;
  const qtyValues = Array.isArray(rawQtyValues)
    ? rawQtyValues.map((v) => Number(v)).filter((v) => !isNaN(v))
    : null;

  const requiredFields = (item.daynamicFields || []).map((f) => ({
    name: f.name || 'Player_ID',
    label: f.label || 'ID Player',
    type: f.type || 'text',
    placeholder: f.placeholder || 'يرجى إدخال ايدي اللاعب هنا',
    required: f.required !== false,
  }));

  // Fallback if no dynamic fields provided
  if (requiredFields.length === 0) {
    requiredFields.push({
      name: 'Player_ID',
      label: 'ايدي اللاعب (Player ID)',
      type: 'text',
      placeholder: 'يرجى إدخال ايدي الحساب أو اللاعب',
      required: true,
    });
  }

  const rawPrice = item.price !== undefined && item.price !== null ? String(item.price) : '0';
  const priceNum = parseFloat(rawPrice) || 0;
  const name = item.name || 'بدون اسم';
  const category = item.gameName || 'ألعاب رؤيا';
  const mainCategory = detectMainCategory(name, category, sourceKey);
  const image = normalizeSwGamesImage(item);

  return {
    externalId: String(item.id),
    source: sourceKey,
    sourceName,
    name,
    category,
    mainCategory,
    price: priceNum,
    originalPrice: priceNum,
    currency: item.currency || '$',
    image,
    isAvailable: item.isActive === 1,
    minCount,
    maxCount,
    qtyValues: qtyValues && qtyValues.length > 0 ? qtyValues : null,
    requiredFields,
    rawPayload: item,
  };
};
