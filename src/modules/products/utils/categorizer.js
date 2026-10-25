/**
 * Exact & Intelligent Categorization Engine for GOLD SM
 * Supports:
 * 1. games (ألعاب إلكترونية وشحن ألعاب)
 * 2. apps (تطبيقات وبث مباشر وشات)
 * 3. social (خدمات سوشل ميديا)
 * 4. subscriptions (اشتراكات وباقات VIP)
 * 5. numbers (أرقام تفعيل دولية واتصالات)
 * 6. cards (بطاقات وقسائم رقمية)
 * 7. payment (دفع إلكتروني وفواتير)
 */

export const normalizeText = (s = '') => {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
};

const normList = (arr) => arr.map(normalizeText);

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

// --- Dictionaries ---

export const SYRIATEL_MTN_KEYWORDS = normList([
  'syriatel', 'سيريتل', 'سرياتيل',
  'mtn', 'ام تي ان', 'إم تي إن',
  'كازية', 'كازيات',
]);

export const VIRTUAL_NUMBER_KEYWORDS = normList([
  'رقم وهمي', 'ارقام وهمية', 'أرقام وهمية',
  'تفعيل واتساب', 'تفعيل تليجرام', 'تفعيل رقم',
  'sms activate', 'sms-activate', 'virtual number', 'virtual numbers',
  'ارقام دولية', 'أرقام دولية', 'رقم امريكي', 'رقم بريطاني',
  'ارقام تفعيل', 'أرقام تفعيل', 'sim card', 'شريحة إلكترونية',
]);

export const BILLING_UTILITY_KEYWORDS = normList([
  'السورية للاتصالات', 'تكامل', 'الجمعية العلمية السورية',
  'فاتورة كهرباء', 'فاتورة ماء', 'فاتورة مياه', 'فاتورة هاتف',
  'فواتير كهرباء', 'فواتير مياه', 'فواتير هاتف', 'فاتورة', 'فواتير',
  'زاد نت', 'زن نت', 'فيو نت', 'سوا نت', 'سما نت', 'لاي نت', 'لاي نيت',
  'هايبر نت', 'برو نت', 'برونت', 'رن نت', 'آينت', 'اينت', 'mts الألفية',
  'الكم نت', 'امواج نت', 'ناس نت', 'دنيا نت', 'أمنية نت', 'مدفوعات إلكترونية', 'مدفوعات الكترونية',
]);

export const FINANCIAL_WALLET_KEYWORDS = normList([
  'shamcash', 'sham cash', 'شام كاش', 'بايير', 'payeer',
  'بيرفكت موني', 'perfect money', 'بينانس', 'binance',
  'wise', 'وايز', 'زين كاش', 'zain cash', 'فودافون كاش', 'vodafone cash',
  'اورنج كاش', 'orange cash', 'stc pay', 'stcpay',
  'usdt', 'trx', 'bep20', 'trc20', 'bnb', 'online payments',
]);

export const SUBSCRIPTION_KEYWORDS = normList([
  'chatgpt', 'chat gpt', 'netflix', 'نتفلكس', 'نتفليكس', 'spotify', 'سبوتيفاي',
  'shahid', 'شاهد vip', 'شاهد', 'youtube premium', 'يوتيوب بريميوم', 'canva', 'كانفا',
  'gemini', 'جيميني', 'midjourney', 'ميدجورني', 'claude', 'كلود',
  'expressvpn', 'express vpn', 'nordvpn', 'nord vpn', 'surfshark', 'surfsharkvpn',
  'telegram premium', 'تليجرام بريميوم', 'discord nitro', 'ديسكورد نايترو',
  'duolingo', 'دولينجو', 'osn', 'watchit', 'watch it', 'crunchyroll', 'كرانشي رول',
  'tod', 'beinsports', 'iptv', 'starzplay', 'office 365', 'windows 11', 'windows 10',
  'ويندوز', 'kaspersky', 'كاسبر', 'اشتراك', 'اشتراكات', 'subscription', 'subscriptions', 'برامج',
]);

export const SOCIAL_KEYWORDS = normList([
  'youtube', 'you tube', 'instagram', 'facebook', 'snapchat', 'snap chat',
  'threads', 'twitter', 'متابع', 'متابعين', 'لايك', 'اعجاب', 'مشاهدات', 'سوشيال',
  'followers', 'likes', 'views', 'subscriber', 'subscribers', 'retweet', 'اكسبلور',
]);

export const APP_KEYWORDS = normList([
  'likee', 'لايكي', 'bigo live', 'بيجو لايف', 'بيجو', 'sugo', 'سوجو',
  'somatch', 'سوماتش', 'yalla live', 'يلا لايف', 'yulchat', 'hawa', 'soul',
  'tango', 'تانغو', 'chamet', 'شامت', 'yoho', 'يوهو', 'livu', 'poppo', 'بوبو لايف',
  'starmaker', 'ستار ميكر', 'ahlan', 'chat', 'voice', 'دردشة', 'شات', 'بث مباشر',
  'عملات تيك توك', 'تيك توك عملات', 'tiktok coins', 'تطبيقات',
]);

export const GAME_KEYWORDS = normList([
  'pubg', 'ببجي', 'uc', 'شدات', 'free fire', 'freefire', 'فري فاير',
  'roblox', 'روبلوكس', 'robux', 'روبوكس', 'mobile legends', 'موبايل ليجند', 'mlbb',
  'call of duty', 'كول اوف ديوتي', 'cod', 'warzone', 'cp',
  'efootball', 'pes', 'بيس', 'fifa', 'فيفا', 'fc mobile', 'fcmobile', 'fc24', 'fc25',
  'clash', 'كلاش', 'brawl', 'براول', 'valorant', 'فالورانت', 'vp',
  'fortnite', 'فورتنايت', 'v-bucks', 'vbucks', 'في بوكس',
  'minecraft', 'ماين كرافت', 'ماينكرافت',
  'steam', 'ستيم', 'xbox', 'اكس بوكس', 'playstation', 'بلايستيشن', 'بلاي ستيشن', 'psn',
  'جواكر', 'jawaker', '8 ball', '8ball', 'pool', 'بلياردو',
  'car parking', 'asphalt', 'top eleven', 'lords mobile', 'لوردس موبايل', 'lordsmobile',
  'state of survival', 'rise of kingdoms', 'نداء الحرب', 'nida alharb',
  'war robots', 'blood strike', 'bloodstrike', 'undawn', 'last war', 'lastwar',
  'whiteout survival', 'stumble guys', 'monopoly', 'hay day', 'family island',
  'township', 'pure sniper', 'riot cash', 'رايوت كاش', 'ريوت كاش', 'riot', 'ريوت',
  'league of legends', 'lol', 'genshin', 'قينشن', 'جينشن', 'honkai',
  'arena breakout', 'delta force', 'دلتا فورس', 'deltaforce', 'honor of kings',
  'يلا لودو', 'yalla ludo', 'لودو', 'ludo', 'توب توب', 'top top', 'toptop',
  'نينتندو', 'nintendo', 'apex', 'apex legends', 'ايبكس', 'ايبيكس',
  'كاش جيم', 'game cash', 'العاب', 'ألعاب', 'games', 'game',
  'جواهر', 'الماس', 'diamonds', 'diamond', 'coins', 'points', 'نقاط',
]);

export const CARD_KEYWORDS = normList([
  'google play', 'جوجل بلاي', 'قوقل بلاي',
  'apple', 'ابل', 'itunes', 'ايتونز', 'app store', 'اب ستور',
  'razer gold', 'رايزر جولد', 'رايزر', 'razer',
  'بطاقة', 'بطاقات', 'gift card', 'gift cards', 'card', 'cards', 'قسيمة', 'قسائم', 'كود شحن',
  'كاش يو', 'cashu', 'امازون', 'amazon', 'noon', 'نون', 'ebay', 'ايباي',
  'visa', 'mastercard', 'ستور سعودي', 'ستور امريكي', 'store us', 'store ksa',
]);

// --- Exported legacy arrays for backward compatibility ---
export const TELECOM_WORDS = SYRIATEL_MTN_KEYWORDS;
export const BILLING_WORDS = BILLING_UTILITY_KEYWORDS;
export const GAME_WORDS = GAME_KEYWORDS;
export const CARD_WORDS = CARD_KEYWORDS;
export const SUBSCRIPTION_WORDS = SUBSCRIPTION_KEYWORDS;
export const SOCIAL_WORDS = SOCIAL_KEYWORDS;

// --- Category Checkers ---

export const isTelecom = (txt, source = '') => {
  const t = normalizeText(txt);
  if (source === 'brand1card') {
    return VIRTUAL_NUMBER_KEYWORDS.some((w) => t.includes(w));
  }
  return (
    SYRIATEL_MTN_KEYWORDS.some((w) => t.includes(w)) ||
    VIRTUAL_NUMBER_KEYWORDS.some((w) => t.includes(w))
  );
};

export const isBilling = (txt, source = '') => {
  const t = normalizeText(txt);
  if (source === 'brand1card') {
    return FINANCIAL_WALLET_KEYWORDS.some((w) => t.includes(w));
  }
  return (
    BILLING_UTILITY_KEYWORDS.some((w) => t.includes(w)) ||
    FINANCIAL_WALLET_KEYWORDS.some((w) => t.includes(w))
  );
};

export const isSocial = (txt) => {
  const t = normalizeText(txt);
  if (['pubg', 'free fire', 'roblox', 'netflix', 'steam'].some((w) => t.includes(w))) {
    return false;
  }
  return SOCIAL_KEYWORDS.some((w) => t.includes(w));
};

export const isSubscription = (txt) => {
  const t = normalizeText(txt);
  if (['pubg', 'free fire', 'roblox', 'steam', 'playstation', 'xbox'].some((w) => t.includes(w))) {
    return false;
  }
  return SUBSCRIPTION_KEYWORDS.some((w) => t.includes(w));
};

export const isCard = (txt) => {
  const t = normalizeText(txt);
  return CARD_KEYWORDS.some((w) => t.includes(w));
};

export const isGame = (txt) => {
  const t = normalizeText(txt);
  if (
    ['google play', 'جوجل بلاي', 'قوقل بلاي', 'apple', 'ابل', 'itunes', 'ايتونز', 'امازون', 'amazon', 'noon', 'نون'].some((w) => t.includes(w))
  ) {
    return false;
  }
  return GAME_KEYWORDS.some((w) => t.includes(w));
};

export const isApp = (txt) => {
  const t = normalizeText(txt);
  return APP_KEYWORDS.some((w) => t.includes(w));
};

/**
 * Detect main category using intelligent provider-aware waterfall precedence
 * 
 * @param {string} name - Product Name
 * @param {string} category - Category / Group Name
 * @param {string} source - Source Provider ('brand1card', 'roya_usd', 'roya_syp', 'syria_card')
 * @returns {string} One of: 'games', 'cards', 'subscriptions', 'social', 'apps', 'numbers', 'payment'
 */
export const detectMainCategory = (name = '', category = '', source = '') => {
  const fullText = normalizeText(`${name} ${category}`);

  // 1. Telecom / Numbers
  if (isTelecom(fullText, source)) {
    return 'numbers';
  }

  // 2. Billing & Wallets
  if (isBilling(fullText, source)) {
    return 'payment';
  }

  // 3. Social Media
  if (isSocial(fullText)) {
    return 'social';
  }

  // 4. Subscriptions & Software VIP
  if (isSubscription(fullText)) {
    return 'subscriptions';
  }

  // 5. Electronic Games & Direct Top-ups
  if (isGame(fullText)) {
    return 'games';
  }

  // 6. Gift Cards & Vouchers
  if (isCard(fullText)) {
    return 'cards';
  }

  // 7. Live Apps, Voice Chat & Social Tokens
  if (isApp(fullText)) {
    return 'apps';
  }

  // 8. Fallback
  if (source === 'brand1card') {
    return 'games';
  }
  return 'apps';
};
