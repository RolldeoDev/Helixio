import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Category information (mirrored from client config)
export const CATEGORY_INFO: Record<string, { name: string; icon: string; description: string }> = {
  page_milestones: { name: 'Page Milestones', icon: 'book', description: 'Reading volume achievements' },
  comic_completions: { name: 'Comic Completions', icon: 'check-circle', description: 'Finishing comics' },
  reading_streaks: { name: 'Reading Streaks', icon: 'flame', description: 'Consecutive reading days' },
  reading_time: { name: 'Reading Time', icon: 'clock', description: 'Time spent reading' },
  author_aficionado: { name: 'Author Aficionado', icon: 'pen', description: 'Reading different writers' },
  artist_appreciation: { name: 'Artist Appreciation', icon: 'palette', description: 'Reading different artists' },
  genre_explorer: { name: 'Genre Explorer', icon: 'compass', description: 'Exploring genres' },
  character_collector: { name: 'Character Collector', icon: 'users', description: 'Reading character appearances' },
  publisher_champion: { name: 'Publisher Champion', icon: 'building', description: 'Reading from publishers' },
  series_completionist: { name: 'Series Completionist', icon: 'layers', description: 'Completing series' },
  collection_size: { name: 'Collection Size', icon: 'archive', description: 'Library milestones' },
  team_player: { name: 'Team Player', icon: 'users', description: 'Reading team comics' },
  decade_explorer: { name: 'Decade Explorer', icon: 'calendar', description: 'Reading across eras' },
  story_arc_explorer: { name: 'Story Arc Explorer', icon: 'git-branch', description: 'Completing story arcs' },
  format_variety: { name: 'Format Variety', icon: 'layout', description: 'Reading different formats' },
  manga_international: { name: 'Manga & International', icon: 'globe', description: 'International comics' },
  binge_reading: { name: 'Binge Reading', icon: 'zap', description: 'Single-day achievements' },
  reading_pace: { name: 'Reading Pace', icon: 'trending-up', description: 'Reading speed and consistency' },
  discovery: { name: 'Discovery', icon: 'search', description: 'Finding new content' },
  special_achievements: { name: 'Special Achievements', icon: 'star', description: 'Unique achievements' },
  age_rating: { name: 'Age Rating', icon: 'shield', description: 'Content variety' },
  location_explorer: { name: 'Location Explorer', icon: 'map-pin', description: 'Comic locations' },
  bookmarks_notes: { name: 'Bookmarks & Notes', icon: 'bookmark', description: 'Reader features' },
  sessions: { name: 'Sessions', icon: 'play', description: 'Reading session milestones' },
  collection_completion: { name: 'Collection Completion', icon: 'check-square', description: 'Reading your collection' },
};

// Types for the achievements service
export interface AchievementWithProgress {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  stars: number;
  iconName: string;
  threshold: number | null;
  minRequired: number | null;
  progress: number;
  unlockedAt: Date | null;
  isUnlocked: boolean;
}

export interface AchievementSummary {
  totalAchievements: number;
  unlockedCount: number;
  totalStars: number;
  earnedStars: number;
  categoryCounts: Record<string, { total: number; unlocked: number }>;
  recentUnlocks: AchievementWithProgress[];
}

export interface AchievementSeedData {
  key: string;
  name: string;
  description: string;
  category: string;
  stars: number;
  icon: string;
  threshold: number;
  minRequired?: number;
}

export interface UserStats {
  pagesTotal: number;
  comicsTotal: number;
  comicsCompleted: number;
  currentStreak: number;
  longestStreak: number;
  totalReadingTime: number;
  uniqueWriters: number;
  uniquePencillers: number;
  uniqueInkers: number;
  uniqueColorists: number;
  uniqueGenres: number;
  uniqueCharacters: number;
  uniquePublishers: number;
  seriesCompleted: number;
  seriesStarted: number;
  collectionSize: number;
  uniqueTeams: number;
  uniqueDecades: number;
  sessionsTotal: number;
  maxPagesDay: number;
  maxComicsDay: number;
  maxTimeDay: number;
}

/**
 * Seed the Achievement table with achievement data
 * Called from API endpoint with data from client config
 */
export async function seedAchievements(achievements?: AchievementSeedData[]): Promise<void> {
  // If no achievements provided, check if already seeded
  if (!achievements) {
    const count = await prisma.achievement.count();
    if (count > 0) {
      console.log(`Achievements already seeded (${count} achievements)`);
      return;
    }
    console.log('No achievements to seed - call /api/achievements/seed with data');
    return;
  }

  console.log(`Seeding ${achievements.length} achievements...`);

  // Upsert all achievements
  for (const achievement of achievements) {
    await prisma.achievement.upsert({
      where: { key: achievement.key },
      update: {
        name: achievement.name,
        description: achievement.description,
        category: achievement.category,
        stars: achievement.stars,
        iconName: achievement.icon,
        threshold: achievement.threshold,
        minRequired: achievement.minRequired ?? null,
      },
      create: {
        key: achievement.key,
        name: achievement.name,
        description: achievement.description,
        category: achievement.category,
        stars: achievement.stars,
        iconName: achievement.icon,
        threshold: achievement.threshold,
        minRequired: achievement.minRequired ?? null,
      },
    });
  }

  console.log(`Seeded ${achievements.length} achievements`);
}

/**
 * Get all achievements with user progress
 */
export async function getAllAchievementsWithProgress(): Promise<AchievementWithProgress[]> {
  const achievements = await prisma.achievement.findMany({
    include: {
      userAchievements: true,
    },
    orderBy: [
      { category: 'asc' },
      { stars: 'asc' },
    ],
  });

  return achievements.map(a => {
    const userAchievement = a.userAchievements[0];
    return {
      id: a.id,
      key: a.key,
      name: a.name,
      description: a.description,
      category: a.category,
      stars: a.stars,
      iconName: a.iconName,
      threshold: a.threshold,
      minRequired: a.minRequired,
      progress: userAchievement?.progress ?? 0,
      unlockedAt: userAchievement?.unlockedAt ?? null,
      isUnlocked: userAchievement?.unlockedAt != null,
    };
  });
}

/**
 * Get achievements by category
 */
export async function getAchievementsByCategory(category: string): Promise<AchievementWithProgress[]> {
  const achievements = await prisma.achievement.findMany({
    where: { category },
    include: {
      userAchievements: true,
    },
    orderBy: [
      { stars: 'asc' },
    ],
  });

  return achievements.map(a => {
    const userAchievement = a.userAchievements[0];
    return {
      id: a.id,
      key: a.key,
      name: a.name,
      description: a.description,
      category: a.category,
      stars: a.stars,
      iconName: a.iconName,
      threshold: a.threshold,
      minRequired: a.minRequired,
      progress: userAchievement?.progress ?? 0,
      unlockedAt: userAchievement?.unlockedAt ?? null,
      isUnlocked: userAchievement?.unlockedAt != null,
    };
  });
}

/**
 * Get unlocked achievements
 */
export async function getUnlockedAchievements(): Promise<AchievementWithProgress[]> {
  const userAchievements = await prisma.userAchievement.findMany({
    where: { unlockedAt: { not: null } },
    include: { achievement: true },
    orderBy: { unlockedAt: 'desc' },
  });

  return userAchievements.map(ua => ({
    id: ua.achievement.id,
    key: ua.achievement.key,
    name: ua.achievement.name,
    description: ua.achievement.description,
    category: ua.achievement.category,
    stars: ua.achievement.stars,
    iconName: ua.achievement.iconName,
    threshold: ua.achievement.threshold,
    minRequired: ua.achievement.minRequired,
    progress: ua.progress,
    unlockedAt: ua.unlockedAt,
    isUnlocked: true,
  }));
}

/**
 * Get recently unlocked achievements (for notifications)
 */
export async function getRecentUnlocks(limit = 5): Promise<AchievementWithProgress[]> {
  const userAchievements = await prisma.userAchievement.findMany({
    where: {
      unlockedAt: { not: null },
      notified: false,
    },
    include: { achievement: true },
    orderBy: { unlockedAt: 'desc' },
    take: limit,
  });

  return userAchievements.map(ua => ({
    id: ua.achievement.id,
    key: ua.achievement.key,
    name: ua.achievement.name,
    description: ua.achievement.description,
    category: ua.achievement.category,
    stars: ua.achievement.stars,
    iconName: ua.achievement.iconName,
    threshold: ua.achievement.threshold,
    minRequired: ua.achievement.minRequired,
    progress: ua.progress,
    unlockedAt: ua.unlockedAt,
    isUnlocked: true,
  }));
}

/**
 * Mark achievements as notified
 */
export async function markAchievementsNotified(achievementIds: string[]): Promise<void> {
  await prisma.userAchievement.updateMany({
    where: { achievementId: { in: achievementIds } },
    data: { notified: true },
  });
}

/**
 * Get achievement summary statistics
 */
export async function getAchievementSummary(): Promise<AchievementSummary> {
  const [achievements, userAchievements] = await Promise.all([
    prisma.achievement.findMany(),
    prisma.userAchievement.findMany({
      where: { unlockedAt: { not: null } },
      include: { achievement: true },
      orderBy: { unlockedAt: 'desc' },
    }),
  ]);

  const unlockedIds = new Set(userAchievements.map(ua => ua.achievementId));

  // Calculate category counts
  const categoryCounts: Record<string, { total: number; unlocked: number }> = {};
  for (const category of Object.keys(CATEGORY_INFO)) {
    categoryCounts[category] = { total: 0, unlocked: 0 };
  }
  for (const a of achievements) {
    if (!categoryCounts[a.category]) {
      categoryCounts[a.category] = { total: 0, unlocked: 0 };
    }
    categoryCounts[a.category]!.total++;
    if (unlockedIds.has(a.id)) {
      categoryCounts[a.category]!.unlocked++;
    }
  }

  // Calculate stars
  const totalStars = achievements.reduce((sum, a) => sum + a.stars, 0);
  const earnedStars = userAchievements.reduce((sum, ua) => sum + ua.achievement.stars, 0);

  // Get recent unlocks
  const recentUnlocks = userAchievements.slice(0, 5).map(ua => ({
    id: ua.achievement.id,
    key: ua.achievement.key,
    name: ua.achievement.name,
    description: ua.achievement.description,
    category: ua.achievement.category,
    stars: ua.achievement.stars,
    iconName: ua.achievement.iconName,
    threshold: ua.achievement.threshold,
    minRequired: ua.achievement.minRequired,
    progress: ua.progress,
    unlockedAt: ua.unlockedAt,
    isUnlocked: true,
  }));

  return {
    totalAchievements: achievements.length,
    unlockedCount: unlockedIds.size,
    totalStars,
    earnedStars,
    categoryCounts,
    recentUnlocks,
  };
}

/**
 * Update achievement progress and check for unlocks
 * Returns newly unlocked achievements
 */
export async function checkAndUpdateAchievements(stats: UserStats): Promise<AchievementWithProgress[]> {
  const achievements = await prisma.achievement.findMany({
    include: { userAchievements: true },
  });

  const newlyUnlocked: AchievementWithProgress[] = [];

  for (const achievement of achievements) {
    // Check if already unlocked
    const userAchievement = achievement.userAchievements[0];
    if (userAchievement?.unlockedAt) continue;

    // Calculate progress and check unlock condition
    const { progress, isUnlocked } = evaluateAchievement(achievement, stats);

    // Skip if minimum requirement not met
    if (achievement.minRequired && getRelevantStat(achievement, stats) < achievement.minRequired) {
      continue;
    }

    // Update or create user achievement record
    if (isUnlocked) {
      const ua = await prisma.userAchievement.upsert({
        where: { achievementId: achievement.id },
        update: {
          progress: 100,
          unlockedAt: new Date(),
        },
        create: {
          achievementId: achievement.id,
          progress: 100,
          unlockedAt: new Date(),
          notified: false,
        },
      });

      newlyUnlocked.push({
        id: achievement.id,
        key: achievement.key,
        name: achievement.name,
        description: achievement.description,
        category: achievement.category,
        stars: achievement.stars,
        iconName: achievement.iconName,
        threshold: achievement.threshold,
        minRequired: achievement.minRequired,
        progress: 100,
        unlockedAt: ua.unlockedAt,
        isUnlocked: true,
      });
    } else if (progress > 0) {
      // Update progress if changed
      await prisma.userAchievement.upsert({
        where: { achievementId: achievement.id },
        update: { progress },
        create: {
          achievementId: achievement.id,
          progress,
          unlockedAt: null,
          notified: false,
        },
      });
    }
  }

  return newlyUnlocked;
}

interface AchievementRecord {
  key: string;
  category: string;
  threshold: number | null;
}

/**
 * Evaluate a single achievement against stats
 */
function evaluateAchievement(achievement: AchievementRecord, stats: UserStats): { progress: number; isUnlocked: boolean } {
  const currentValue = getRelevantStat(achievement, stats);
  const threshold = achievement.threshold ?? 0;

  if (threshold === 0) {
    // Special case for achievements like "No Backlog"
    return { progress: currentValue === 0 ? 100 : 0, isUnlocked: currentValue === 0 };
  }

  const progress = Math.min(100, Math.round((currentValue / threshold) * 100));
  const isUnlocked = currentValue >= threshold;

  return { progress, isUnlocked };
}

/**
 * Get the relevant stat value for an achievement type
 * Uses the achievement key prefix to determine type
 */
function getRelevantStat(achievement: AchievementRecord, stats: UserStats): number {
  const key = achievement.key;
  const category = achievement.category;

  // Match by key prefix or category
  if (key.startsWith('pages_') || category === 'page_milestones') {
    return key.includes('day') ? stats.maxPagesDay : stats.pagesTotal;
  }
  if (key.startsWith('comics_') || category === 'comic_completions') {
    return key.includes('day') ? stats.maxComicsDay : stats.comicsTotal;
  }
  if (key.startsWith('streak_') || category === 'reading_streaks') {
    return key.includes('current') ? stats.currentStreak : stats.longestStreak;
  }
  if (key.startsWith('time_') || category === 'reading_time') {
    return key.includes('day') ? stats.maxTimeDay : stats.totalReadingTime;
  }
  if (category === 'author_aficionado') {
    return stats.uniqueWriters;
  }
  if (category === 'artist_appreciation') {
    return stats.uniquePencillers;
  }
  if (category === 'genre_explorer') {
    return stats.uniqueGenres;
  }
  if (category === 'character_collector') {
    return stats.uniqueCharacters;
  }
  if (category === 'publisher_champion') {
    return stats.uniquePublishers;
  }
  if (category === 'series_completionist') {
    return key.includes('started') ? stats.seriesStarted : stats.seriesCompleted;
  }
  if (category === 'collection_size') {
    return stats.collectionSize;
  }
  if (category === 'team_player') {
    return stats.uniqueTeams;
  }
  if (category === 'decade_explorer') {
    return stats.uniqueDecades;
  }
  if (category === 'sessions') {
    return stats.sessionsTotal;
  }

  return 0;
}

/**
 * Get category information
 */
export function getCategoryInfo() {
  return CATEGORY_INFO;
}

/**
 * Get all categories with counts
 */
export async function getCategoriesWithCounts(): Promise<Array<{
  key: string;
  name: string;
  icon: string;
  description: string;
  total: number;
  unlocked: number;
}>> {
  const [achievements, userAchievements] = await Promise.all([
    prisma.achievement.findMany(),
    prisma.userAchievement.findMany({
      where: { unlockedAt: { not: null } },
    }),
  ]);

  const unlockedIds = new Set(userAchievements.map(ua => ua.achievementId));

  const categoryCounts: Record<string, { total: number; unlocked: number }> = {};
  for (const a of achievements) {
    if (!categoryCounts[a.category]) {
      categoryCounts[a.category] = { total: 0, unlocked: 0 };
    }
    categoryCounts[a.category]!.total++;
    if (unlockedIds.has(a.id)) {
      categoryCounts[a.category]!.unlocked++;
    }
  }

  return Object.entries(CATEGORY_INFO).map(([key, info]) => ({
    key,
    name: info.name,
    icon: info.icon,
    description: info.description,
    total: categoryCounts[key]?.total ?? 0,
    unlocked: categoryCounts[key]?.unlocked ?? 0,
  }));
}
