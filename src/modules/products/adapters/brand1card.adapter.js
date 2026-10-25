import { detectMainCategory } from '../utils/categorizer.js';

export const normalizeBrand1CardProduct = (item) => {
  let minCount = 1;
  let maxCount = null;
  let qtyValues = null;

  if (item.qty_values && typeof item.qty_values === 'object' && !Array.isArray(item.qty_values)) {
    minCount = item.qty_values.min ? parseInt(item.qty_values.min) : 1;
    maxCount = item.qty_values.max ? parseInt(item.qty_values.max) : null;
  } else if (Array.isArray(item.qty_values)) {
    qtyValues = item.qty_values.map((v) => Number(v)).filter((v) => !isNaN(v));
    if (qtyValues.length > 0) {
      minCount = Math.min(...qtyValues);
      maxCount = Math.max(...qtyValues);
    }
  } else if (item.qty_values === null || item.qty_values === undefined) {
    minCount = 1;
    maxCount = 1;
  }

  // Also support min_count / max_count if present
  if (item.min_count || item.minCount) {
    minCount = parseInt(item.min_count || item.minCount);
  }
  if (item.max_count || item.maxCount) {
    maxCount = parseInt(item.max_count || item.maxCount);
  }

  let requiredFields = [];
  if (Array.isArray(item.params_info) && item.params_info.length > 0) {
    requiredFields = item.params_info.map((info) => ({
      name: info.key || 'playerId',
      label: info.label || info.key || 'ايدي اللاعب (Player ID)',
      type: 'text',
      placeholder: `يرجى إدخال ${info.label || info.key || 'المعرف'}`,
      required: info.required !== false,
    }));
  } else if (Array.isArray(item.params) && item.params.length > 0) {
    requiredFields = item.params.map((paramName, idx) => ({
      name: `field_${idx}`,
      label: paramName || 'المعرف / الايدي',
      type: 'text',
      placeholder: `يرجى إدخال ${paramName}`,
      required: true,
    }));
  }

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
  const category = item.category_name || item.description || 'بطاقات وخدمات';
  const mainCategory = detectMainCategory(name, category, 'brand1card');

  let image = '';
  if (item.category_img) {
    image = item.category_img.startsWith('http')
      ? item.category_img
      : `https://api.brand-one-card.com/${item.category_img.replace(/^\/+/, '')}`;
  }

  return {
    externalId: String(item.id),
    source: 'brand1card',
    sourceName: 'براند ون كارد',
    name,
    category,
    mainCategory,
    price: priceNum,
    originalPrice: priceNum,
    currency: item.currency === 'SYP' ? 'ل.س' : '$',
    image,
    isAvailable: item.available === true,
    minCount,
    maxCount,
    qtyValues: qtyValues && qtyValues.length > 0 ? qtyValues : null,
    requiredFields,
    rawPayload: item,
  };
};
