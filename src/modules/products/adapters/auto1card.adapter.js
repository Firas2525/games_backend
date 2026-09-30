export const normalizeAuto1CardProduct = (item) => {
  const minCount = item.min_count || item.minCount ? parseInt(item.min_count || item.minCount) : 1;
  const maxCount = item.max_count || item.maxCount ? parseInt(item.max_count || item.maxCount) : null;
  const rawQtyValues = item.qty_values || item.qtyValues || null;
  const qtyValues = Array.isArray(rawQtyValues)
    ? rawQtyValues.map((v) => Number(v)).filter((v) => !isNaN(v))
    : null;

  const requiredFields = (item.params || []).map((paramName, idx) => ({
    name: `field_${idx}`,
    label: paramName || 'المعرف / الايدي',
    type: 'text',
    placeholder: `يرجى إدخال ${paramName}`,
    required: true,
  }));

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
    source: 'auto1card',
    sourceName: 'Auto 1 Card',
    name: item.name || 'بدون اسم',
    category: item.category_name || item.description || 'بطاقات متنوعة',
    price: priceNum,
    originalPrice: priceNum,
    currency: '$',
    image: '',
    isAvailable: item.available === true,
    minCount,
    maxCount,
    qtyValues: qtyValues && qtyValues.length > 0 ? qtyValues : null,
    requiredFields,
    rawPayload: item,
  };
};

