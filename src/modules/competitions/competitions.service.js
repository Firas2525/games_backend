import { Competition } from './competitions.model.js';
import { User } from '../users/users.model.js';
import { getSettings } from '../settings/settings.service.js';
import { calculateLevelInfo } from '../../constants/levels.js';
import { ROLES } from '../../constants/roles.js';

/**
 * Get active competition banner & top 10 buyers leaderboard
 * Sensitive customer data (names, emails, total amounts) are stripped for non-admin users.
 */
export const getCompetitionData = async (currentUser) => {
  const compDoc = await Competition.findOne({ key: 'active_competition' });
  const competition =
    compDoc && compDoc.isActive && compDoc.imageUrl && compDoc.imageUrl.trim().length > 0
      ? compDoc.toJSON()
      : null;

  // Retrieve top 10 buyers by totalSpent
  const topUsers = await User.find({
    role: { $in: [ROLES.USER, 'USER'] },
    totalSpent: { $gt: 0 },
  })
    .sort({ totalSpent: -1, updatedAt: -1 })
    .limit(10)
    .select('name email userCode totalSpent manualLevel currency avatar')
    .lean();

  const settings = await getSettings();
  const levelBadges = settings?.levelBadges || {};

  const isAdmin = Boolean(currentUser && currentUser.role === ROLES.ADMIN);

  const topBuyers = topUsers.map((u, index) => {
    const levelInfo = calculateLevelInfo(u.totalSpent || 0, u.manualLevel || 'auto');
    const badgeKey = levelInfo.level;
    const customBadgeUrl =
      (levelBadges instanceof Map ? levelBadges.get(badgeKey) : levelBadges[badgeKey]) || '';

    const base = {
      rank: index + 1,
      userCode: u.userCode || (u._id ? u._id.toString().slice(-6) : `10000${index + 1}`),
      level: levelInfo.level,
      levelName: levelInfo.levelName,
      levelEmoji: levelInfo.levelEmoji,
      levelBadgeUrl: customBadgeUrl,
    };

    if (isAdmin) {
      return {
        ...base,
        id: u._id,
        name: u.name || 'User',
        email: u.email || '',
        totalSpent: Number((u.totalSpent || 0).toFixed(2)),
        currency: u.currency || 'USD',
      };
    }

    // For regular users / guests: ONLY user ID, badges, rank, and competition banner
    return base;
  });

  return {
    competition,
    topBuyers,
    hasActiveCompetition: Boolean(competition),
  };
};

/**
 * Set or update competition banner image (Admin)
 */
export const setCompetitionBanner = async ({ imageUrl, title = '', description = '' }) => {
  const cleanUrl = (imageUrl || '').trim();
  const comp = await Competition.findOneAndUpdate(
    { key: 'active_competition' },
    {
      imageUrl: cleanUrl,
      title: (title || '').trim(),
      description: (description || '').trim(),
      isActive: cleanUrl.length > 0,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return comp;
};

/**
 * Delete competition banner image (Admin)
 */
export const deleteCompetitionBanner = async () => {
  const comp = await Competition.findOneAndUpdate(
    { key: 'active_competition' },
    {
      imageUrl: '',
      title: '',
      description: '',
      isActive: false,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return comp;
};

