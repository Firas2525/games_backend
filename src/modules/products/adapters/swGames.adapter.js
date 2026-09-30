export const normalizeSwGamesProduct = (item) => {
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

  return {
    externalId: String(item.id),
    source: 'sw_games',
    sourceName: 'SW Games',
    name: item.name || 'بدون اسم',
    category: item.gameName || 'ألعاب SW',
    originalPrice: parseFloat(item.price) || 0,
    currency: item.currency || '$',
    image: item.image || '',
    isAvailable: item.isActive === 1,
    requiredFields,
    rawPayload: item,
  };
};
