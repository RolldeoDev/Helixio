/**
 * Fun Facts Generator
 *
 * Generates random, interesting statistics from the user's library
 * to display on the home page. Each fact is formatted with personality
 * and designed to be engaging.
 */

import type { StatsSummary, AllTimeStats, EntityStatResult } from '../services/api.service';

export interface FunFact {
  icon: string;
  text: string;
  emphasis: string;
  category: 'collection' | 'reading' | 'creator' | 'character' | 'genre' | 'publisher' | 'streak';
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  if (hours < 24) {
    if (remainingMins > 0) return `${hours} hour${hours !== 1 ? 's' : ''} and ${remainingMins} minute${remainingMins !== 1 ? 's' : ''}`;
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (remainingHours > 0) return `${days} day${days !== 1 ? 's' : ''} and ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`;
  return `${days} day${days !== 1 ? 's' : ''}`;
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

function getRandomItem<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

// =============================================================================
// Fact Generators
// =============================================================================

function generateCollectionFacts(stats: StatsSummary): FunFact[] {
  const facts: FunFact[] = [];

  if (stats.totalFiles > 0) {
    facts.push({
      icon: '📚',
      text: `Your collection spans`,
      emphasis: `${formatNumber(stats.totalFiles)} comic${stats.totalFiles !== 1 ? 's' : ''}`,
      category: 'collection',
    });
  }

  if (stats.totalSeries > 0) {
    facts.push({
      icon: '📖',
      text: `You're following`,
      emphasis: `${formatNumber(stats.totalSeries)} different series`,
      category: 'collection',
    });
  }

  if (stats.totalPages > 0) {
    const bookEquivalent = Math.round(stats.totalPages / 250);
    if (bookEquivalent > 1) {
      facts.push({
        icon: '📄',
        text: `Your ${formatNumber(stats.totalPages)} pages would fill`,
        emphasis: `${formatNumber(bookEquivalent)} novels`,
        category: 'collection',
      });
    }
  }

  if (stats.filesWithMetadata && stats.totalFiles > 0) {
    const percentage = Math.round((stats.filesWithMetadata / stats.totalFiles) * 100);
    if (percentage > 50) {
      facts.push({
        icon: '🏷️',
        text: `${percentage}% of your library is`,
        emphasis: 'properly catalogued',
        category: 'collection',
      });
    }
  }

  return facts;
}

function generateReadingFacts(stats: StatsSummary, allTimeStats: AllTimeStats | null): FunFact[] {
  const facts: FunFact[] = [];

  if (stats.filesRead > 0) {
    const percentage = Math.round((stats.filesRead / stats.totalFiles) * 100);
    facts.push({
      icon: '✅',
      text: `You've conquered`,
      emphasis: `${percentage}% of your collection`,
      category: 'reading',
    });
  }

  if (stats.pagesRead > 0) {
    facts.push({
      icon: '📑',
      text: `You've turned`,
      emphasis: `${formatNumber(stats.pagesRead)} pages`,
      category: 'reading',
    });
  }

  if (stats.readingTime > 0) {
    facts.push({
      icon: '⏱️',
      text: `Total time spent reading:`,
      emphasis: formatDuration(stats.readingTime),
      category: 'reading',
    });
  }

  if (allTimeStats) {
    if (allTimeStats.averageSessionDuration > 0) {
      facts.push({
        icon: '📊',
        text: `Your average reading session lasts`,
        emphasis: formatDuration(allTimeStats.averageSessionDuration),
        category: 'reading',
      });
    }

    if (allTimeStats.longestSession > 0 && allTimeStats.longestSession > 3600) {
      facts.push({
        icon: '🏆',
        text: `Your longest reading marathon:`,
        emphasis: formatDuration(allTimeStats.longestSession),
        category: 'reading',
      });
    }
  }

  if (stats.filesInProgress > 0) {
    facts.push({
      icon: '📖',
      text: `Currently juggling`,
      emphasis: `${stats.filesInProgress} comic${stats.filesInProgress !== 1 ? 's' : ''} in progress`,
      category: 'reading',
    });
  }

  return facts;
}

function generateCreatorFacts(creators: EntityStatResult[]): FunFact[] {
  const facts: FunFact[] = [];

  if (creators.length === 0) return facts;

  // Top creator by owned
  const topOwned = creators.reduce((max, c) => c.ownedComics > max.ownedComics ? c : max, creators[0]!);
  if (topOwned && topOwned.ownedComics > 0) {
    const role = topOwned.entityRole ? ` (${topOwned.entityRole})` : '';
    facts.push({
      icon: '✍️',
      text: `${topOwned.entityName}${role} dominates with`,
      emphasis: `${formatNumber(topOwned.ownedComics)} comics in your collection`,
      category: 'creator',
    });
  }

  // Top creator by read time
  const topByTime = creators.filter(c => c.readTime > 0).sort((a, b) => b.readTime - a.readTime)[0];
  if (topByTime && topByTime.readTime > 600) {
    const role = topByTime.entityRole ? ` (${topByTime.entityRole})` : '';
    facts.push({
      icon: '⭐',
      text: `You've spent ${formatDuration(topByTime.readTime)} reading`,
      emphasis: `${topByTime.entityName}${role}`,
      category: 'creator',
    });
  }

  // Most read creator
  const mostRead = creators.filter(c => c.readComics > 0).sort((a, b) => b.readComics - a.readComics)[0];
  if (mostRead && mostRead.readComics > 0 && mostRead !== topOwned) {
    const role = mostRead.entityRole ? ` (${mostRead.entityRole})` : '';
    facts.push({
      icon: '📚',
      text: `${mostRead.entityName}${role} is your most-read creator with`,
      emphasis: `${formatNumber(mostRead.readComics)} comics finished`,
      category: 'creator',
    });
  }

  // Random interesting creator (high completion rate)
  const highCompletion = creators.filter(c => c.readPercentage >= 80 && c.ownedComics >= 5);
  const randomComplete = getRandomItem(highCompletion);
  if (randomComplete) {
    facts.push({
      icon: '🎯',
      text: `You've read ${randomComplete.readPercentage}% of`,
      emphasis: `${randomComplete.entityName}'s work`,
      category: 'creator',
    });
  }

  return facts;
}

function generateCharacterFacts(characters: EntityStatResult[]): FunFact[] {
  const facts: FunFact[] = [];

  if (characters.length === 0) return facts;

  // Most appearing character
  const topCharacter = characters.reduce((max, c) => c.ownedComics > max.ownedComics ? c : max, characters[0]!);
  if (topCharacter && topCharacter.ownedComics > 0) {
    facts.push({
      icon: '🦸',
      text: `${topCharacter.entityName} appears in`,
      emphasis: `${formatNumber(topCharacter.ownedComics)} of your comics`,
      category: 'character',
    });
  }

  // Most read character
  const mostReadChar = characters.filter(c => c.readComics > 0).sort((a, b) => b.readComics - a.readComics)[0];
  if (mostReadChar && mostReadChar.readComics > 0) {
    facts.push({
      icon: '💫',
      text: `You've followed ${mostReadChar.entityName} through`,
      emphasis: `${formatNumber(mostReadChar.readComics)} adventures`,
      category: 'character',
    });
  }

  // Character with most reading time
  const topByTime = characters.filter(c => c.readTime > 0).sort((a, b) => b.readTime - a.readTime)[0];
  if (topByTime && topByTime.readTime > 600) {
    facts.push({
      icon: '⏳',
      text: `${formatDuration(topByTime.readTime)} spent with`,
      emphasis: topByTime.entityName,
      category: 'character',
    });
  }

  return facts;
}

function generateGenreFacts(genres: EntityStatResult[]): FunFact[] {
  const facts: FunFact[] = [];

  if (genres.length === 0) return facts;

  // Dominant genre
  const topGenre = genres.reduce((max, g) => g.ownedComics > max.ownedComics ? g : max, genres[0]!);
  if (topGenre && topGenre.ownedComics > 0) {
    facts.push({
      icon: '🎭',
      text: `${topGenre.entityName} is your dominant genre with`,
      emphasis: `${formatNumber(topGenre.ownedComics)} comics`,
      category: 'genre',
    });
  }

  // Most read genre
  const mostReadGenre = genres.filter(g => g.readComics > 0).sort((a, b) => b.readComics - a.readComics)[0];
  if (mostReadGenre && mostReadGenre.readComics > 0 && mostReadGenre !== topGenre) {
    facts.push({
      icon: '📚',
      text: `You've read ${formatNumber(mostReadGenre.readComics)}`,
      emphasis: `${mostReadGenre.entityName} comics`,
      category: 'genre',
    });
  }

  // Genre diversity
  if (genres.length >= 5) {
    facts.push({
      icon: '🌈',
      text: `Your tastes span`,
      emphasis: `${genres.length} different genres`,
      category: 'genre',
    });
  }

  return facts;
}

function generatePublisherFacts(publishers: EntityStatResult[]): FunFact[] {
  const facts: FunFact[] = [];

  if (publishers.length === 0) return facts;

  // Top publisher
  const topPublisher = publishers.reduce((max, p) => p.ownedComics > max.ownedComics ? p : max, publishers[0]!);
  if (topPublisher && topPublisher.ownedComics > 0) {
    facts.push({
      icon: '🏢',
      text: `${topPublisher.entityName} leads your collection with`,
      emphasis: `${formatNumber(topPublisher.ownedComics)} comics`,
      category: 'publisher',
    });
  }

  // Publisher diversity
  if (publishers.length >= 3) {
    facts.push({
      icon: '🌐',
      text: `Comics from`,
      emphasis: `${publishers.length} different publishers`,
      category: 'publisher',
    });
  }

  return facts;
}

function generateStreakFacts(stats: StatsSummary, allTimeStats: AllTimeStats | null): FunFact[] {
  const facts: FunFact[] = [];

  const currentStreak = stats.currentStreak ?? allTimeStats?.currentStreak ?? 0;
  const longestStreak = stats.longestStreak ?? allTimeStats?.longestStreak ?? 0;

  if (currentStreak > 0) {
    if (currentStreak >= 7) {
      facts.push({
        icon: '🔥',
        text: `${currentStreak} day reading streak!`,
        emphasis: "You're on fire!",
        category: 'streak',
      });
    } else {
      facts.push({
        icon: '⚡',
        text: `Current streak:`,
        emphasis: `${currentStreak} day${currentStreak !== 1 ? 's' : ''} strong`,
        category: 'streak',
      });
    }
  }

  if (longestStreak > 7 && longestStreak > currentStreak) {
    facts.push({
      icon: '🏆',
      text: `Your longest streak was`,
      emphasis: `${longestStreak} days`,
      category: 'streak',
    });
  }

  return facts;
}

// =============================================================================
// Main Export
// =============================================================================

/**
 * Generate a random fun fact from the user's library statistics
 */
export function generateFunFact(
  summary: StatsSummary | null,
  allTimeStats: AllTimeStats | null
): FunFact | null {
  if (!summary) return null;

  const allFacts: FunFact[] = [
    ...generateCollectionFacts(summary),
    ...generateReadingFacts(summary, allTimeStats),
    ...generateCreatorFacts(summary.topCreators || []),
    ...generateCharacterFacts(summary.topCharacters || []),
    ...generateGenreFacts(summary.topGenres || []),
    ...generatePublisherFacts(summary.topPublishers || []),
    ...generateStreakFacts(summary, allTimeStats),
  ];

  if (allFacts.length === 0) {
    return {
      icon: '🚀',
      text: 'Start reading to unlock',
      emphasis: 'personalized insights',
      category: 'collection',
    };
  }

  return getRandomItem(allFacts) || null;
}

/**
 * Generate multiple unique fun facts
 */
export function generateMultipleFacts(
  summary: StatsSummary | null,
  allTimeStats: AllTimeStats | null,
  count: number = 3
): FunFact[] {
  if (!summary) return [];

  const allFacts: FunFact[] = [
    ...generateCollectionFacts(summary),
    ...generateReadingFacts(summary, allTimeStats),
    ...generateCreatorFacts(summary.topCreators || []),
    ...generateCharacterFacts(summary.topCharacters || []),
    ...generateGenreFacts(summary.topGenres || []),
    ...generatePublisherFacts(summary.topPublishers || []),
    ...generateStreakFacts(summary, allTimeStats),
  ];

  // Shuffle and take unique facts
  const shuffled = [...allFacts].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}
