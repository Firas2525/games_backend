export const normalizeSwGamesProduct = (item) => {
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

  return {
    externalId: String(item.id),
    source: 'sw_games',
    sourceName: 'SW Games',
    name: item.name || 'بدون اسم',
    category: item.gameName || 'ألعاب SW',
    price: priceNum,
    originalPrice: priceNum,
    currency: item.currency || '$',
    image: item.image || '',
    isAvailable: item.isActive === 1,
    minCount,
    maxCount,
    qtyValues: qtyValues && qtyValues.length > 0 ? qtyValues : null,
    requiredFields,
    rawPayload: item,
  };
};
