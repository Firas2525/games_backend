/**
 * Exact Categorization Engine ported from the legacy system (GOLD SM / mysite_test)
 * Categories:
 * 1. games (ألعاب)
 * 2. apps (تطبيقات وشات)
 * 3. social (خدمات سوشل ميديا)
 * 4. subscriptions (اشتراكات)
 * 5. numbers (أرقام واتصالات)
 * 6. cards (بطاقات)
 * 7. payment (دفع إلكتروني وفواتير)
 */

export const normalizeText = (s = '') => {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ي/g, 'ى')
    .replace(/\s+/g, ' ');
};

export const cleanName = (name = '') => {
  let s = String(name || 'بدون اسم').trim();
  if (s.includes(' - ')) {
    const [left, right] = s.split(' - ');
    if (right && left.toLowerCase().includes(right.toLowerCase())) {
      s = left;
    }
  }
  for (const w of [
    'Amount coins',
    'Amount Coins',
    'amount coins',
    'Amount',
    'amount',
    'coins',
    'Coins',
  ]) {
    s = s.replaceAll(w, '');
  }
  return s.replace(/\s+/g, ' ').trim() || 'بدون اسم';
};

// --- Dictionaries from legacy flask_app.py ---

export const GAME_WORDS = [
  'jawaker',
  'جواكر',
  'jawaker cards',
  'jawaker tokens',
  'pubg',
  'ببجي',
  'free fire',
  'freefire',
  'فري فاير',
  'فري',
  'فاير',
  'roblox',
  'mobile legends',
  'call of duty',
  'cod',
  'efootball',
  'pes',
  'clash',
  'brawl',
  'valorant',
  'fortnite',
  'minecraft',
  'steam',
  'xbox',
  'playstation',
  'psn',
  'game',
  'games',
  'uc',
  'شدات',
  'diamond',
  'diamonds',
  'جواهر',
  'mlbb',
  'lol',
  'league of legends',
  'genshin',
  'honkai',
  'arena breakout',
  'روبلوكس',
  'موبايل ليجند',
  'كول اوف ديوتي',
  'كلاش',
  'براول',
  'فالورانت',
  'فورتنايت',
  'ماين كرافت',
  'ستيم',
  '8 ball',
  '8ball',
  'pool',
  'car parking',
  'parking',
  'asphalt',
  'fifa',
  'fc mobile',
  'top eleven',
  'lords mobile',
  'lordsmobile',
  'lords-mobile',
  'state of survival',
  'rise of kingdoms',
  'king of avalon',
  'war robots',
  'blood strike',
  'undawn',
  'last war',
  'whiteout survival',
  'stumble guys',
  'monopoly',
  'hay day',
  'family island',
  'township',
  'fcmobile',
  'arenabreakout',
  'bloodstrike',
  'lastwar',
  'lastwar store',
  'lastwar id',
  'nidaalharb',
  'nida alharb',
  'نداء الحرب',
  'pure sniper',
  'puresniper',
  '8ballpool',
  '8 ball pool',
  'riot cash',
  'leagueoflegends',
  'pubg store',
  'brawlstars',
  'brawl stars',
  'deltaforce',
  'delta force',
  'honor of kings',
  'honorofkings',
];

export const SUBSCRIPTION_WORDS = [
  'chatgpt',
  'chat gpt',
  'netflix',
  'spotify',
  'shahid',
  'youtube premium',
  'canva',
  'gemini',
  'midjourney',
  'اشتراك',
  'subscription',
  'premium',
  'plus',
  'expressvpn',
  'express vpn',
  'nordvpn',
  'nord vpn',
  'surfsharkvpn',
  'surfshark vpn',
  'telegram stars',
  'nintendo',
];

export const TELECOM_WORDS = [
  'syriatel',
  'سيريتل',
  'سرياتيل',
  'mtn',
  'ام تي ان',
  'إم تي إن',
  'cash',
  'كاش',
  'جملة',
  'wholesale',
  'units',
  'unit',
  'وحدات',
  'رصيد',
  'كازية',
  'كازيات',
  'رقم',
  'ارقام',
  'أرقام',
  'sms',
  'sim',
  'virtual',
  'activation',
];

export const CARD_WORDS = [
  'google play',
  'جوجل بلاي',
  'قوقل بلاي',
  'apple',
  'ابل',
  'itunes',
  'ايتونز',
  'steam',
  'ستيم',
  'playstation',
  'psn',
  'xbox',
  'razer',
  'gift card',
  'card',
  'بطاقة',
  'بطاقات',
  'visa',
  'mastercard',
  'paypal',
  'trx',
  'usdt',
  'bep20',
  'bnb',
];

export const BILLING_WORDS = [
  'زاد نت',
  'زن نت',
  'دنيا',
  'فيو نت',
  'سوا نت',
  'سما نت',
  'ليما',
  'ليزر',
  'لاي نت',
  'لاي نيت',
  'هايفاي',
  'هاي فاي',
  'هايبر نت',
  'ناس',
  'يارا',
  'الجمعية العلمية السورية',
  'أمية',
  'امية',
  'السورية للاتصالات',
  'اينت',
  'آينت',
  'آية',
  'اية',
  'أمواج',
  'امواج',
  'تكامل',
  'تربية',
  'برو نت',
  'فاتورة',
  'فواتير',
  'انترنت',
  'إنترنت',
  'mts الألفية',
  'mts',
  'الألفية',
  'الالفية',
  'الكم',
  'امنية',
  'أمنية',
  'برونت',
  'رن نت',
  'مدفوعات إلكترونية',
  'مدفوعات الكترونية',
  'دفع',
  'محفظة',
];

export const SOCIAL_WORDS = [
  'youtube',
  'you tube',
  'instagram',
  'facebook',
  'snapchat',
  'snap chat',
  'tiktok',
  'tik tok',
  'threads',
  'twitter',
  ' x ',
  'متابع',
  'متابعين',
  'لايك',
  'اعجاب',
  'مشاهدات',
  'سوشيال',
  'followers',
  'likes',
  'views',
  'subscriber',
  'subscribers',
];

export const SOCIAL_EXCLUDE_WORDS = [
  'trx',
  'usdt',
  'bep20',
  'trc20',
  'bnb',
  'paypal',
  'sham',
  'شام',
  'roblox',
  'age of empires',
  'netflix',
  'premium',
  'telegram premium',
  'telegram stars',
  'pubg',
  'free fire',
  'gift card',
  'card',
  'game',
  'اشتراك',
  'subscription',
  'points',
  'coin',
  'coins',
];

// --- Checker functions matching legacy flask_app.py logic ---

export const isTelecom = (txt) => {
  const t = normalizeText(txt);
  if (
    ['shamcash', 'sham cash', 'شام كاش', 'paypal', 'trx', 'usdt', 'bnb', 'online payments'].some(
      (w) => t.includes(w)
    )
  ) {
    return false;
  }
  if (
    [
      '8ball',
      '8 ball',
      'valorant',
      'riot',
      'league of legends',
      'bloodstrike',
      'brawl',
      'honor of kings',
    ].some((w) => t.includes(w))
  ) {
    return false;
  }
  return TELECOM_WORDS.some((w) => t.includes(w));
};

export const isBilling = (txt) => {
  const t = normalizeText(txt);
  if (t.includes('yulchat') || t.includes('yul chat') || t.trim() === 'yo' || t.includes(' yo!')) {
    return false;
  }
  return BILLING_WORDS.some((w) => t.includes(w));
};

export const isSocial = (txt) => {
  const t = ` ${normalizeText(txt)} `;
  if (SOCIAL_EXCLUDE_WORDS.some((w) => t.includes(w))) {
    return false;
  }
  return SOCIAL_WORDS.some((w) => t.includes(w));
};

export const isSubscription = (txt) => {
  const t = normalizeText(txt);
  if (GAME_WORDS.some((w) => t.includes(w))) {
    return false;
  }
  if (
    [
      'paypal',
      'trx',
      'usdt',
      'bep20',
      'bnb',
      'shamcash',
      'sham cash',
      'شام كاش',
      'binance',
      'online payments',
    ].some((w) => t.includes(w))
  ) {
    return false;
  }
  if (BILLING_WORDS.some((w) => t.includes(w))) {
    return false;
  }
  if (TELECOM_WORDS.some((w) => t.includes(w))) {
    return false;
  }
  return SUBSCRIPTION_WORDS.some((w) => t.includes(w));
};

export const isCard = (txt) => {
  const t = normalizeText(txt);
  if (
    ['paypal', 'trx', 'usdt', 'bep20', 'bnb', 'shamcash', 'sham cash', 'شام كاش'].some((w) =>
      t.includes(w)
    )
  ) {
    return false;
  }
  return CARD_WORDS.some((w) => t.includes(w));
};

export const isGame = (txt) => {
  const t = normalizeText(txt);
  if (['jawaker', 'جواكر'].some((w) => t.includes(w))) {
    return true;
  }
  // Likee PIN and YallaLive are voice/chat apps, not games
  if (
    [
      'likee pin',
      'likeepin',
      'likee-pin',
      'yallalive',
      'yalla live',
      'yalla-live',
      'يلا لايف',
    ].some((w) => t.includes(w))
  ) {
    return false;
  }
  // LordsMobile and DeltaForce are games
  if (
    [
      'lordsmobile',
      'lords mobile',
      'lords-mobile',
      'لوردس موبايل',
      'deltaforce',
      'delta force',
      'deltaforec',
      'دلتا فورس',
    ].some((w) => t.includes(w))
  ) {
    return true;
  }
  return !isTelecom(t) && GAME_WORDS.some((w) => t.includes(w));
};

export const isApp = (txt) => {
  const t = normalizeText(txt);
  if (['jawaker', 'جواكر'].some((w) => t.includes(w))) {
    return false;
  }
  if (
    [
      'likee pin',
      'likeepin',
      'likee-pin',
      'yallalive',
      'yalla live',
      'yalla-live',
      'يلا لايف',
      'sugo',
      'سوجو',
      'somatch',
      'so match',
      'سوماتش',
      'yulchat',
      'yo',
      'chat',
      'voice',
      'live',
      'دردشة',
      'شات',
    ].some((w) => t.includes(w))
  ) {
    return true;
  }
  const exchangeOnly = [
    'bnb',
    'trx',
    'usdt',
    'bep20',
    'trc20',
    'paypal',
    'shamcash',
    'sham cash',
    'شام كاش',
    'online payments',
  ];
  if (exchangeOnly.some((w) => t.includes(w))) {
    return false;
  }
  return (
    !isTelecom(t) &&
    !isGame(t) &&
    !isSubscription(t) &&
    !isCard(t) &&
    !isBilling(t)
  );
};

/**
 * Detect main category using the exact waterfall precedence from the old system
 */
export const detectMainCategory = (name = '', category = '') => {
  const fullText = `${name} ${category}`;

  // 1. Check Telecom / Numbers
  if (isTelecom(fullText)) {
    return 'numbers';
  }

  // 2. Check Billing / Electronic payment
  if (isBilling(fullText)) {
    return 'payment';
  }

  // 3. Check Social Media
  if (isSocial(fullText)) {
    return 'social';
  }

  // 4. Check Subscriptions
  if (isSubscription(fullText)) {
    return 'subscriptions';
  }

  // 5. Check Cards
  if (isCard(fullText)) {
    return 'cards';
  }

  // 6. Check Game
  if (isGame(fullText)) {
    return 'games';
  }

  // 7. Check Apps / Chat / Voice
  if (isApp(fullText)) {
    return 'apps';
  }

  // Default fallback
  return 'apps';
};
