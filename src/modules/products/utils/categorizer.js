/**
 * Smart automatic classifier for:
 * 1. games (ألعاب)
 * 2. apps (تطبيقات)
 * 3. social (خدمات سوشل ميديا)
 * 4. subscriptions (اشتراكات)
 * 5. numbers (ارقام)
 * 6. cards (بطاقات)
 * 7. payment (دفع الكتروني)
 */
export const detectMainCategory = (name = '', category = '') => {
  const text = `${name} ${category}`.toLowerCase();

  // 1. أرقام (Numbers & Virtual SIM / SMS)
  const numbersRegex =
    /(رقم|ارقام|أرقام|واتساب|تفعيل|sms|sim|phone|number|numbers|فيكي|virtual|activation)/i;
  if (numbersRegex.test(text)) {
    return 'numbers';
  }

  // 2. دفع الكتروني (Electronic Payment & Wallets / Crypto)
  const paymentRegex =
    /(دفع|الكتروني|إلكتروني|pay|payment|paypal|بايبال|usdt|crypto|perfect money|بيرفكت موني|كاش|cash|تحويل|شحن رصيد|فاتورة|فواتير|فودافون كاش|محفظة)/i;
  if (paymentRegex.test(text)) {
    return 'payment';
  }

  // 3. اشتراكات (Subscriptions & Streaming VIP)
  const subsRegex =
    /(اشتراك|اشتراكات|subscription|netflix|نتفلكس|نتفليكس|shahid|شاهد|spotify|سبوتيفاي|anghami|انغامي|osn|youtube premium|يوتيوب بريميوم|iptv|اي بي تي في|disney|ديزني|beout|bein|تود|tod)/i;
  if (subsRegex.test(text)) {
    return 'subscriptions';
  }

  // 4. خدمات سوشل ميديا (Social Media Services)
  const socialRegex =
    /(tiktok|tik tok|تيك توك|telegram|تيليجرام|تليجرام|likee|لايكي|instagram|انستغرام|انستقرام|snapchat|سناب شات|سناب|facebook|فيسبوك|twitter|تويتر|\bx\b|threads|ثريدز|متابع|متابعين|لايكات|مشاهدات|views|followers|retweet)/i;
  if (socialRegex.test(text)) {
    return 'social';
  }

  // 5. تطبيقات (Apps & Voice Chat & Live Streaming)
  const appsRegex =
    /(chat|شات|voice|صوت|دردشة|تعارف|محادثة|live|لايف|بث|stream|poppo|بوبو|bigo|بيجو|chamet|تشاميت|tango|تانغو|تانجو|yoho|يوهو|mico|ميكو|suggo|سوغو|ola party|اولا بارتي|أولا بارتي|soul|سول|fachat|falla|فلا|ahlan|أهلا|اهلا|party|room|غرف|hala|هلا|yalla live|يلا لايف|top party|parti|sawa|سوا|weplay|وي بلاي|weparty|تطبيق|برنامج)/i;
  if (appsRegex.test(text)) {
    return 'apps';
  }

  // 6. بطاقات (Digital Gift Cards & Store Vouchers)
  const cardsRegex =
    /(card|بطاقة|بطاقات|itunes|ايتونز|أيتونز|apple|ابل|google play|جوجل بلاي|قوقل بلاي|playstation|بلايستيشن|بلاي ستيشن|ستور|psn|xbox|اكسبوكس|إكسبوكس|steam|ستيم|nintendo|نينتندو|razer|رازر|voucher|قسيمة|كود|code)/i;
  if (cardsRegex.test(text)) {
    return 'cards';
  }

  // 7. ألعاب (Gaming & Direct In-Game Recharge)
  const gamesRegex =
    /(game|لعبة|العاب|ألعاب|free fire|فري فاير|فاير|pubg|ببجي|بوبجي|roblox|روبلوكس|ludo|لودو|يلا لودو|valorant|فالورانت|league|ليغ|brawl|براول|clash|كلاش|cod|call of duty|كول اوف ديوتي|كول|farlight|فارلايت|mobile legends|موبايل ليجندز|genshin|قنشن|جنشن|fifa|فيفا|fc24|fc25|efootball|اي فوتبول|فوتبول|garena|قارينا|coin master|head ball|هيد بول|8 ball|pool|بلياردو|carrom|كيرم|clash of clans|royale|fortnite|فورتنايت|apex|ابكس)/i;
  if (gamesRegex.test(text)) {
    return 'games';
  }

  // Fallback
  return 'games';
};
