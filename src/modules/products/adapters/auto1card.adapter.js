export const normalizeAuto1CardProduct = (item) => {
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

  return {
    externalId: String(item.id),
    source: 'auto1card',
    sourceName: 'Auto 1 Card',
    name: item.name || 'بدون اسم',
    category: item.category_name || item.description || 'بطاقات متنوعة',
    originalPrice: parseFloat(item.price) || 0,
    currency: '$',
    image: '',
    isAvailable: item.available === true,
    requiredFields,
    rawPayload: item,
  };
};
