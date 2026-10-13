/**
 * Smart automatic classifier for games, chat apps, social media, and digital cards.
 * Runs 100% locally and completely free without any external paid AI APIs.
 */
export const detectMainCategory = (name = '', category = '') => {
  const text = `${name} ${category}`.toLowerCase();

  // 1. Social Media (تطبيقات التواصل الاجتماعي)
  const socialRegex =
    /(tiktok|tik tok|تيك توك|telegram|تيليجرام|تليجرام|likee|لايكي|instagram|انستغرام|انستقرام|snapchat|سناب شات|سناب|facebook|فيسبوك|twitter|تويتر|\bx\b|threads|ثريدز)/i;
  if (socialRegex.test(text)) {
    return 'social';
  }

  // 2. Apps & Chat & Voice Live Streaming (تطبيقات المحادثة والبث المباشر)
  const appsRegex =
    /(chat|شات|voice|صوت|دردشة|تعارف|محادثة|live|لايف|بث|stream|poppo|بوبو|bigo|بيجو|chamet|تشاميت|tango|تانغو|تانجو|yoho|يوهو|mico|ميكو|suggo|سوغو|ola party|اولا بارتي|أولا بارتي|soul|سول|fachat|falla|فلا|ahlan|أهلا|اهلا|party|room|غرف|hala|هلا|yalla live|يلا لايف|top party|parti|sawa|سوا|weplay|وي بلاي|weparty)/i;
  if (appsRegex.test(text)) {
    return 'apps';
  }

  // 3. Digital Cards & Gift Cards & Subscriptions (بطاقات واشتراكات رقمية)
  const cardsRegex =
    /(card|بطاقة|بطاقات|itunes|ايتونز|أيتونز|apple|ابل|google play|جوجل بلاي|قوقل بلاي|playstation|بلايستيشن|بلاي ستيشن|ستور|psn|xbox|اكسبوكس|إكسبوكس|steam|ستيم|nintendo|نينتندو|netflix|نتفلكس|نتفليكس|shahid|شاهد|spotify|سبوتيفاي|anghami|انغامي|razer|رازر|voucher|قسيمة|اشتراك|subscription|كود|code)/i;
  if (cardsRegex.test(text)) {
    return 'cards';
  }

  // 4. Games (ألعاب الفيديو الإلكترونية)
  const gamesRegex =
    /(game|لعبة|العاب|ألعاب|free fire|فري فاير|فاير|pubg|ببجي|بوبجي|roblox|روبلوكس|ludo|لودو|يلا لودو|valorant|فالورانت|league|ليغ|brawl|براول|clash|كلاش|cod|call of duty|كول اوف ديوتي|كول|farlight|فارلايت|mobile legends|موبايل ليجندز|genshin|قنشن|جنشن|fifa|فيفا|fc24|fc25|efootball|اي فوتبول|فوتبول|garena|قارينا|coin master|head ball|هيد بول|8 ball|pool|بلياردو|carrom|كيرم|clash of clans|royale|fortnite|فورتنايت|apex|ابكس)/i;
  if (gamesRegex.test(text)) {
    return 'games';
  }

  // Fallback default
  return 'games';
};
