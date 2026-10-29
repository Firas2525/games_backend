export const LEVELS = {
  BRONZE: 'bronze',
  SILVER: 'silver',
  GOLD: 'gold',
  DIAMOND: 'diamond',
  VIP: 'vip',
};

export const LEVEL_CONFIG = [
  {
    key: 'bronze',
    name: 'برونزي',
    nameEn: 'Bronze',
    min: 0,
    max: 51,
    next: 'silver',
  },
  {
    key: 'silver',
    name: 'فضي',
    nameEn: 'Silver',
    min: 51,
    max: 101,
    next: 'gold',
  },
  {
    key: 'gold',
    name: 'ذهبي',
    nameEn: 'Gold',
    min: 101,
    max: 501,
    next: 'diamond',
  },
  {
    key: 'diamond',
    name: 'ماسي',
    nameEn: 'Diamond',
    min: 501,
    max: 1001,
    next: 'vip',
  },
  {
    key: 'vip',
    name: 'VIP',
    nameEn: 'VIP',
    min: 1001,
    max: null,
    next: null,
  },
];

export const calculateLevelInfo = (totalSpent = 0, manualLevel = 'auto') => {
  const spent = Math.max(0, Number(totalSpent) || 0);

  let currentKey = 'bronze';
  if (manualLevel && manualLevel !== 'auto' && Object.values(LEVELS).includes(manualLevel)) {
    currentKey = manualLevel;
  } else {
    if (spent >= 1001) {
      currentKey = 'vip';
    } else if (spent >= 501) {
      currentKey = 'diamond';
    } else if (spent >= 101) {
      currentKey = 'gold';
    } else if (spent >= 51) {
      currentKey = 'silver';
    } else {
      currentKey = 'bronze';
    }
  }

  const currentTier = LEVEL_CONFIG.find((l) => l.key === currentKey) || LEVEL_CONFIG[0];
  const nextTier = currentTier.next ? LEVEL_CONFIG.find((l) => l.key === currentTier.next) : null;

  let remaining = 0;
  let progress = 1.0;

  if (nextTier) {
    const target = currentTier.max; // e.g. 51, 101, 501, 1001
    remaining = Math.max(0, Number((target - spent).toFixed(2)));
    const tierSpan = currentTier.max - currentTier.min;
    const progressInTier = Math.max(0, spent - currentTier.min);
    progress = Math.min(1.0, Math.max(0, Number((progressInTier / tierSpan).toFixed(4))));
  }

  return {
    level: currentTier.key,
    levelName: currentTier.name,
    manualLevel: manualLevel || 'auto',
    nextLevel: nextTier ? nextTier.key : null,
    nextLevelName: nextTier ? nextTier.name : null,
    nextLevelTarget: currentTier.max || 1001,
    remainingForNextLevel: remaining,
    levelProgress: progress,
    totalSpent: Number(spent.toFixed(2)),
  };
};

