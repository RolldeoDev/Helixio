/**
 * Fun Facts Generator
 *
 * Generates random, interesting statistics from the user's library
 * to display on the home page. Each fact is formatted with personality
 * and designed to be engaging.
 */

import type {
  StatsSummary,
  AllTimeStats,
  EntityStatResult,
  RatingStats,
  EnhancedLibraryOverview,
  FileFormatDistribution,
  PublicationStatusDistribution,
  DayOfWeekActivity,
} from '../services/api.service';

export interface FunFact {
  icon: string;
  text: string;
  emphasis: string;
  category:
    | 'collection'
    | 'reading'
    | 'creator'
    | 'character'
    | 'genre'
    | 'publisher'
    | 'streak'
    | 'team'
    | 'temporal'
    | 'comparative'
    | 'format'
    | 'series'
    | 'arc'
    | 'discovery'
    | 'ratings'
    | 'dayOfWeek'
    | 'fileFormat'
    | 'publicationStatus'
    | 'librarySize';
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

/**
 * Get the comic book era for a given year
 */
function getComicEra(year: number): { name: string; icon: string } | null {
  if (year >= 1938 && year <= 1956) return { name: 'Golden Age', icon: '🌟' };
  if (year >= 1956 && year <= 1970) return { name: 'Silver Age', icon: '🥈' };
  if (year >= 1970 && year <= 1985) return { name: 'Bronze Age', icon: '🥉' };
  if (year >= 1985) return { name: 'Modern Age', icon: '⚡' };
  return null;
}

/**
 * Format height in feet and inches
 */
function formatHeight(inches: number): string {
  if (inches < 12) return `${Math.round(inches)} inches`;
  const feet = Math.floor(inches / 12);
  const remainingInches = Math.round(inches % 12);
  if (feet >= 5280) {
    const miles = (feet / 5280).toFixed(1);
    return `${miles} miles`;
  }
  if (remainingInches > 0) return `${formatNumber(feet)} feet and ${remainingInches} inches`;
  return `${formatNumber(feet)} feet`;
}

/**
 * Format distance in meters/km/miles
 */
function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} meters`;
  if (meters < 1609) return `${(meters / 1000).toFixed(1)} km`;
  const miles = meters / 1609.34;
  if (miles < 100) return `${miles.toFixed(1)} miles`;
  return `${formatNumber(Math.round(miles))} miles`;
}

// =============================================================================
// Fact Generators - Original Categories (Enhanced)
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

  // New: Unread backlog
  if (stats.filesUnread > 10) {
    facts.push({
      icon: '📦',
      text: `${formatNumber(stats.filesUnread)} comics waiting`,
      emphasis: 'to be discovered',
      category: 'collection',
    });
  }

  // New: Average issues per series
  if (stats.totalSeries > 0 && stats.totalFiles > 0) {
    const avgPerSeries = Math.round(stats.totalFiles / stats.totalSeries);
    if (avgPerSeries > 3) {
      facts.push({
        icon: '📊',
        text: `Average of`,
        emphasis: `${avgPerSeries} issues per series`,
        category: 'collection',
      });
    }
  }

  // New: Reading queue size
  if (stats.queueCount > 0) {
    facts.push({
      icon: '📋',
      text: `${stats.queueCount} comic${stats.queueCount !== 1 ? 's' : ''} in your`,
      emphasis: 'reading queue',
      category: 'collection',
    });
  }

  // New: Total bookmarks
  if (stats.totalBookmarks > 5) {
    facts.push({
      icon: '🔖',
      text: `You've saved`,
      emphasis: `${formatNumber(stats.totalBookmarks)} bookmarks`,
      category: 'collection',
    });
  }

  // New: Largest series
  if (stats.largestSeriesName && stats.largestSeriesCount > 20) {
    facts.push({
      icon: '📚',
      text: `${stats.largestSeriesName} is your largest series with`,
      emphasis: `${stats.largestSeriesCount} issues`,
      category: 'collection',
    });
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

    if (allTimeStats.longestSession > 3600) {
      facts.push({
        icon: '🏆',
        text: `Your longest reading marathon:`,
        emphasis: formatDuration(allTimeStats.longestSession),
        category: 'reading',
      });
    }

    // New: Reading speed
    if (allTimeStats.totalReadingTime > 3600 && allTimeStats.totalPagesRead > 0) {
      const pagesPerHour = Math.round((allTimeStats.totalPagesRead / allTimeStats.totalReadingTime) * 3600);
      if (pagesPerHour > 0) {
        facts.push({
          icon: '⚡',
          text: `Your reading speed:`,
          emphasis: `${pagesPerHour} pages per hour`,
          category: 'reading',
        });
      }
    }

    // New: Most productive day (pages)
    if (allTimeStats.maxPagesDay > 50) {
      facts.push({
        icon: '📈',
        text: `Your most productive day:`,
        emphasis: `${formatNumber(allTimeStats.maxPagesDay)} pages`,
        category: 'reading',
      });
    }

    // New: Most productive day (comics)
    if (allTimeStats.maxComicsDay > 5) {
      facts.push({
        icon: '🎯',
        text: `Record day:`,
        emphasis: `${allTimeStats.maxComicsDay} comics in one day`,
        category: 'reading',
      });
    }

    // New: Total reading sessions
    if (allTimeStats.sessionsTotal > 10) {
      facts.push({
        icon: '📖',
        text: `You've had`,
        emphasis: `${formatNumber(allTimeStats.sessionsTotal)} reading sessions`,
        category: 'reading',
      });
    }

    // New: Days with reading activity
    if (allTimeStats.totalActiveDays > 0) {
      facts.push({
        icon: '📅',
        text: `You've read on`,
        emphasis: `${formatNumber(allTimeStats.totalActiveDays)} different days`,
        category: 'reading',
      });
    }

    // New: Binge days
    if (allTimeStats.bingeDaysCount > 0) {
      facts.push({
        icon: '🔥',
        text: `${allTimeStats.bingeDaysCount} epic binge day${allTimeStats.bingeDaysCount !== 1 ? 's' : ''}`,
        emphasis: '(10+ comics completed)',
        category: 'reading',
      });
    }

    // New: Completion rate
    if (stats.filesRead > 0 && stats.filesInProgress > 0) {
      const completionRate = Math.round((stats.filesRead / (stats.filesRead + stats.filesInProgress)) * 100);
      if (completionRate > 50) {
        facts.push({
          icon: '✨',
          text: `You finish what you start:`,
          emphasis: `${completionRate}% completion rate`,
          category: 'reading',
        });
      }
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

function generateCreatorFacts(creators: EntityStatResult[], uniqueCount?: number): FunFact[] {
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

  // New: Unique creator count
  if (uniqueCount && uniqueCount > 20) {
    facts.push({
      icon: '👥',
      text: `Works by`,
      emphasis: `${formatNumber(uniqueCount)} different creators`,
      category: 'creator',
    });
  }

  // New: Creator by role (colorist)
  const topColorist = creators.filter(c => c.entityRole === 'colorist').sort((a, b) => b.ownedComics - a.ownedComics)[0];
  if (topColorist && topColorist.ownedComics > 5) {
    facts.push({
      icon: '🎨',
      text: `Favorite colorist:`,
      emphasis: `${topColorist.entityName} (${topColorist.ownedComics} comics)`,
      category: 'creator',
    });
  }

  // New: Creator by role (letterer)
  const topLetterer = creators.filter(c => c.entityRole === 'letterer').sort((a, b) => b.ownedComics - a.ownedComics)[0];
  if (topLetterer && topLetterer.ownedComics > 5) {
    facts.push({
      icon: '💬',
      text: `Top letterer:`,
      emphasis: `${topLetterer.entityName} (${topLetterer.ownedComics} comics)`,
      category: 'creator',
    });
  }

  // New: Cover artist
  const topCoverArtist = creators.filter(c => c.entityRole === 'coverArtist').sort((a, b) => b.ownedComics - a.ownedComics)[0];
  if (topCoverArtist && topCoverArtist.ownedComics > 3) {
    facts.push({
      icon: '🖼️',
      text: `Favorite cover artist:`,
      emphasis: topCoverArtist.entityName,
      category: 'creator',
    });
  }

  return facts;
}

function generateCharacterFacts(characters: EntityStatResult[], uniqueCount?: number): FunFact[] {
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

  // New: Second favorite character
  if (characters.length >= 2) {
    const sorted = [...characters].sort((a, b) => b.readComics - a.readComics);
    const second = sorted[1];
    if (second && second.readComics > 0) {
      facts.push({
        icon: '🥈',
        text: `Runner-up hero:`,
        emphasis: `${second.entityName} (${second.readComics} comics)`,
        category: 'character',
      });
    }
  }

  // New: Unique character count
  if (uniqueCount && uniqueCount > 10) {
    facts.push({
      icon: '🎭',
      text: `You've encountered`,
      emphasis: `${formatNumber(uniqueCount)} different characters`,
      category: 'character',
    });
  }

  // New: Unread character comics
  if (topCharacter && topCharacter.ownedComics > topCharacter.readComics) {
    const unread = topCharacter.ownedComics - topCharacter.readComics;
    if (unread > 5) {
      facts.push({
        icon: '📚',
        text: `${unread} more ${topCharacter.entityName} comics`,
        emphasis: 'waiting to be read',
        category: 'character',
      });
    }
  }

  return facts;
}

function generateGenreFacts(genres: EntityStatResult[], uniqueCount?: number): FunFact[] {
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
  if (uniqueCount && uniqueCount >= 5) {
    facts.push({
      icon: '🌈',
      text: `Your tastes span`,
      emphasis: `${uniqueCount} different genres`,
      category: 'genre',
    });
  } else if (genres.length >= 5) {
    facts.push({
      icon: '🌈',
      text: `Your tastes span`,
      emphasis: `${genres.length} different genres`,
      category: 'genre',
    });
  }

  // New: Second favorite genre
  if (genres.length >= 2) {
    const sorted = [...genres].sort((a, b) => b.ownedComics - a.ownedComics);
    const second = sorted[1];
    if (second && second.ownedComics > 0) {
      facts.push({
        icon: '🥈',
        text: `Second favorite genre:`,
        emphasis: `${second.entityName} (${second.ownedComics} comics)`,
        category: 'genre',
      });
    }
  }

  // New: Least-read genre you own
  const leastRead = genres.filter(g => g.ownedComics >= 5 && g.readPercentage < 20).sort((a, b) => a.readPercentage - b.readPercentage)[0];
  if (leastRead) {
    facts.push({
      icon: '🔍',
      text: `Unexplored territory:`,
      emphasis: `${leastRead.entityName} (only ${leastRead.readPercentage}% read)`,
      category: 'genre',
    });
  }

  // New: Genre you've completed
  const completedGenre = genres.filter(g => g.readPercentage === 100 && g.ownedComics >= 3).sort((a, b) => b.ownedComics - a.ownedComics)[0];
  if (completedGenre) {
    facts.push({
      icon: '✅',
      text: `You've read every`,
      emphasis: `${completedGenre.entityName} comic you own!`,
      category: 'genre',
    });
  }

  return facts;
}

function generatePublisherFacts(publishers: EntityStatResult[], uniqueCount?: number): FunFact[] {
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
  if (uniqueCount && uniqueCount >= 3) {
    facts.push({
      icon: '🌐',
      text: `Comics from`,
      emphasis: `${uniqueCount} different publishers`,
      category: 'publisher',
    });
  } else if (publishers.length >= 3) {
    facts.push({
      icon: '🌐',
      text: `Comics from`,
      emphasis: `${publishers.length} different publishers`,
      category: 'publisher',
    });
  }

  // New: Second publisher
  if (publishers.length >= 2) {
    const sorted = [...publishers].sort((a, b) => b.ownedComics - a.ownedComics);
    const second = sorted[1];
    if (second && second.ownedComics > 5) {
      facts.push({
        icon: '🏛️',
        text: `Second publisher:`,
        emphasis: `${second.entityName} (${second.ownedComics} comics)`,
        category: 'publisher',
      });
    }
  }

  // New: Publisher loyalty
  if (topPublisher && topPublisher.ownedComics > 0) {
    const totalComics = publishers.reduce((sum, p) => sum + p.ownedComics, 0);
    const loyaltyPercent = Math.round((topPublisher.ownedComics / totalComics) * 100);
    if (loyaltyPercent > 50) {
      facts.push({
        icon: '💙',
        text: `${loyaltyPercent}% of your comics are from`,
        emphasis: topPublisher.entityName,
        category: 'publisher',
      });
    }
  }

  // New: Most read publisher
  const mostReadPub = publishers.filter(p => p.readComics > 0).sort((a, b) => b.readComics - a.readComics)[0];
  if (mostReadPub && mostReadPub !== topPublisher && mostReadPub.readComics > 5) {
    facts.push({
      icon: '📖',
      text: `Most read publisher:`,
      emphasis: `${mostReadPub.entityName} (${mostReadPub.readComics} finished)`,
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

    // New: Days until record
    if (longestStreak > currentStreak) {
      const daysToRecord = longestStreak - currentStreak;
      if (daysToRecord <= 5) {
        facts.push({
          icon: '🎯',
          text: `Only ${daysToRecord} day${daysToRecord !== 1 ? 's' : ''} until you`,
          emphasis: 'beat your record!',
          category: 'streak',
        });
      }
    }
  }

  // New: Days since last read (when no streak)
  if (currentStreak === 0 && allTimeStats?.daysSinceLastRead && allTimeStats.daysSinceLastRead > 0) {
    facts.push({
      icon: '📅',
      text: `It's been ${allTimeStats.daysSinceLastRead} day${allTimeStats.daysSinceLastRead !== 1 ? 's' : ''}`,
      emphasis: 'since your last read',
      category: 'streak',
    });
  }

  if (longestStreak > 7 && longestStreak > currentStreak) {
    facts.push({
      icon: '🏆',
      text: `Your longest streak was`,
      emphasis: `${longestStreak} days`,
      category: 'streak',
    });
  }

  // New: Total active days from streak data
  if (allTimeStats?.totalActiveDays && allTimeStats.totalActiveDays > 30) {
    facts.push({
      icon: '📊',
      text: `You've read on`,
      emphasis: `${formatNumber(allTimeStats.totalActiveDays)} different days`,
      category: 'streak',
    });
  }

  return facts;
}

// =============================================================================
// Fact Generators - New Categories
// =============================================================================

function generateTeamFacts(teams: EntityStatResult[], uniqueCount?: number): FunFact[] {
  const facts: FunFact[] = [];

  if (!teams || teams.length === 0) return facts;

  // Most appearing team
  const topTeam = teams.reduce((max, t) => t.ownedComics > max.ownedComics ? t : max, teams[0]!);
  if (topTeam && topTeam.ownedComics > 0) {
    facts.push({
      icon: '🦸‍♂️',
      text: `${topTeam.entityName} appears in`,
      emphasis: `${formatNumber(topTeam.ownedComics)} of your comics`,
      category: 'team',
    });
  }

  // Most read team
  const mostReadTeam = teams.filter(t => t.readComics > 0).sort((a, b) => b.readComics - a.readComics)[0];
  if (mostReadTeam && mostReadTeam.readComics > 0) {
    facts.push({
      icon: '👥',
      text: `You've followed ${mostReadTeam.entityName} through`,
      emphasis: `${formatNumber(mostReadTeam.readComics)} adventures`,
      category: 'team',
    });
  }

  // Team diversity
  if (uniqueCount && uniqueCount >= 3) {
    facts.push({
      icon: '🌟',
      text: `Your collection features`,
      emphasis: `${uniqueCount} different teams`,
      category: 'team',
    });
  }

  // Team with most reading time
  const topByTime = teams.filter(t => t.readTime > 0).sort((a, b) => b.readTime - a.readTime)[0];
  if (topByTime && topByTime.readTime > 1800) {
    facts.push({
      icon: '⏱️',
      text: `${formatDuration(topByTime.readTime)} spent with`,
      emphasis: topByTime.entityName,
      category: 'team',
    });
  }

  return facts;
}

function generateTemporalFacts(stats: StatsSummary): FunFact[] {
  const facts: FunFact[] = [];

  // Era facts based on decade counts
  if (stats.decadeCounts) {
    const decades = Object.keys(stats.decadeCounts).sort();

    // Oldest decade
    if (decades.length > 0) {
      const oldestDecade = decades[0]!;
      const count = stats.decadeCounts[oldestDecade]!;
      if (count > 0) {
        facts.push({
          icon: '📜',
          text: `You own ${formatNumber(count)} comic${count !== 1 ? 's' : ''} from the`,
          emphasis: oldestDecade,
          category: 'temporal',
        });
      }
    }

    // Decade diversity
    if (decades.length >= 3) {
      facts.push({
        icon: '📅',
        text: `Your collection spans`,
        emphasis: `${decades.length} decades`,
        category: 'temporal',
      });
    }

    // Most common decade
    let maxDecade = '';
    let maxCount = 0;
    for (const [decade, count] of Object.entries(stats.decadeCounts)) {
      if (count > maxCount) {
        maxDecade = decade;
        maxCount = count;
      }
    }
    if (maxDecade && maxCount > 10) {
      facts.push({
        icon: '📊',
        text: `The ${maxDecade} dominate with`,
        emphasis: `${formatNumber(maxCount)} comics`,
        category: 'temporal',
      });
    }

    // Era-specific facts
    const goldenAge = (stats.decadeCounts['1940s'] || 0) + (stats.decadeCounts['1950s'] || 0);
    if (goldenAge > 0) {
      facts.push({
        icon: '🌟',
        text: `${formatNumber(goldenAge)} Golden Age comics`,
        emphasis: 'in your collection',
        category: 'temporal',
      });
    }

    const silverAge = (stats.decadeCounts['1960s'] || 0);
    if (silverAge > 5) {
      facts.push({
        icon: '🥈',
        text: `${formatNumber(silverAge)} Silver Age classics`,
        emphasis: 'from the 1960s',
        category: 'temporal',
      });
    }
  }

  // Year range
  if (stats.oldestYear && stats.oldestYear < 1990) {
    const era = getComicEra(stats.oldestYear);
    if (era) {
      facts.push({
        icon: era.icon,
        text: `Your oldest comic is from ${stats.oldestYear}`,
        emphasis: `(${era.name})`,
        category: 'temporal',
      });
    }
  }

  if (stats.newestYear && stats.oldestYear) {
    const span = stats.newestYear - stats.oldestYear;
    if (span > 30) {
      facts.push({
        icon: '📆',
        text: `Your comics span`,
        emphasis: `${span} years of history`,
        category: 'temporal',
      });
    }
  }

  return facts;
}

function generateComparativeFacts(stats: StatsSummary, allTimeStats: AllTimeStats | null): FunFact[] {
  const facts: FunFact[] = [];

  const pagesRead = allTimeStats?.totalPagesRead || stats.pagesRead || 0;
  const readingTime = allTimeStats?.totalReadingTime || stats.readingTime || 0;

  // Pages = LOTR trilogies (1,178 pages per trilogy)
  if (pagesRead >= 1178) {
    const lotrTrilogies = Math.floor(pagesRead / 1178);
    facts.push({
      icon: '🧙',
      text: `You've read the equivalent of`,
      emphasis: `${lotrTrilogies} Lord of the Rings ${lotrTrilogies === 1 ? 'trilogy' : 'trilogies'}`,
      category: 'comparative',
    });
  }

  // Pages = Harry Potter series (4,224 pages)
  if (pagesRead >= 4224) {
    const hpSeries = Math.floor(pagesRead / 4224);
    facts.push({
      icon: '⚡',
      text: `That's enough pages for`,
      emphasis: `${hpSeries} Harry Potter series`,
      category: 'comparative',
    });
  }

  // Time = Movies (2 hours each)
  if (readingTime >= 7200) {
    const movies = Math.floor(readingTime / 7200);
    facts.push({
      icon: '🎬',
      text: `Your reading time equals`,
      emphasis: `${formatNumber(movies)} movies watched`,
      category: 'comparative',
    });
  }

  // Time = TV seasons (10 hours each)
  if (readingTime >= 36000) {
    const seasons = Math.floor(readingTime / 36000);
    facts.push({
      icon: '📺',
      text: `Reading time equals`,
      emphasis: `${seasons} TV season${seasons !== 1 ? 's' : ''} binge-watched`,
      category: 'comparative',
    });
  }

  // Stack height (0.25 inches per comic average)
  if (stats.totalFiles >= 50) {
    const heightInches = stats.totalFiles * 0.25;
    facts.push({
      icon: '📏',
      text: `Stacked up, your comics would be`,
      emphasis: formatHeight(heightInches),
      category: 'comparative',
    });
  }

  // Pages laid end-to-end (11 inches per page)
  if (stats.totalPages >= 1000) {
    const distanceMeters = (stats.totalPages * 0.2794); // 11 inches = 0.2794 meters
    facts.push({
      icon: '🛤️',
      text: `Your pages laid end-to-end would stretch`,
      emphasis: formatDistance(distanceMeters),
      category: 'comparative',
    });
  }

  // Comics = graphic novel shelves (25 per shelf)
  if (stats.totalFiles >= 50) {
    const shelves = Math.ceil(stats.totalFiles / 25);
    facts.push({
      icon: '📚',
      text: `You'd need`,
      emphasis: `${shelves} shelve${shelves !== 1 ? 's' : ''} for your collection`,
      category: 'comparative',
    });
  }

  // Reading time = audiobooks (10 hours each)
  if (readingTime >= 36000) {
    const audiobooks = Math.floor(readingTime / 36000);
    facts.push({
      icon: '🎧',
      text: `You could have listened to`,
      emphasis: `${audiobooks} audiobook${audiobooks !== 1 ? 's' : ''} instead`,
      category: 'comparative',
    });
  }

  return facts;
}

function generateFormatFacts(stats: StatsSummary): FunFact[] {
  const facts: FunFact[] = [];

  if (!stats.formatCounts) return facts;

  const formats = Object.entries(stats.formatCounts);
  if (formats.length === 0) return facts;

  // Most common format
  const [topFormat, topCount] = formats.reduce((max, curr) => curr[1] > max[1] ? curr : max, formats[0]!);
  if (topFormat && topCount > 0) {
    facts.push({
      icon: '📖',
      text: `${topFormat} is your most common format with`,
      emphasis: `${formatNumber(topCount)} comics`,
      category: 'format',
    });
  }

  // TPB count
  const tpbCount = stats.formatCounts['TPB'] || stats.formatCounts['Trade Paperback'] || 0;
  if (tpbCount > 5) {
    facts.push({
      icon: '📕',
      text: `You own`,
      emphasis: `${formatNumber(tpbCount)} trade paperbacks`,
      category: 'format',
    });
  }

  // Omnibus count
  const omnibusCount = stats.formatCounts['Omnibus'] || 0;
  if (omnibusCount > 0) {
    facts.push({
      icon: '📚',
      text: `Your library includes`,
      emphasis: `${omnibusCount} omnibus${omnibusCount !== 1 ? 'es' : ''}`,
      category: 'format',
    });
  }

  // Format diversity
  if (formats.length >= 3) {
    facts.push({
      icon: '🎨',
      text: `Your collection spans`,
      emphasis: `${formats.length} different formats`,
      category: 'format',
    });
  }

  // Single issues
  const issueCount = stats.formatCounts['Issue'] || stats.formatCounts['Single Issue'] || 0;
  if (issueCount > 50) {
    facts.push({
      icon: '📄',
      text: `${formatNumber(issueCount)} single issues`,
      emphasis: 'in your collection',
      category: 'format',
    });
  }

  return facts;
}

function generateSeriesFacts(stats: StatsSummary): FunFact[] {
  const facts: FunFact[] = [];

  // Series completed
  if (stats.seriesCompleted > 0) {
    facts.push({
      icon: '✅',
      text: `You've completely read`,
      emphasis: `${formatNumber(stats.seriesCompleted)} series`,
      category: 'series',
    });
  }

  // Series in progress
  if (stats.seriesInProgress > 0) {
    facts.push({
      icon: '📖',
      text: `Currently reading`,
      emphasis: `${formatNumber(stats.seriesInProgress)} series`,
      category: 'series',
    });
  }

  // Series completion rate
  if (stats.seriesCompleted > 0 && stats.seriesInProgress > 0) {
    const totalStarted = stats.seriesCompleted + stats.seriesInProgress;
    const completionRate = Math.round((stats.seriesCompleted / totalStarted) * 100);
    facts.push({
      icon: '📊',
      text: `Series completion rate:`,
      emphasis: `${completionRate}%`,
      category: 'series',
    });
  }

  // Largest series
  if (stats.largestSeriesName && stats.largestSeriesCount > 10) {
    facts.push({
      icon: '📚',
      text: `Biggest series:`,
      emphasis: `${stats.largestSeriesName} (${stats.largestSeriesCount} issues)`,
      category: 'series',
    });
  }

  // Total series count
  if (stats.totalSeries > 20) {
    facts.push({
      icon: '📑',
      text: `Your library contains`,
      emphasis: `${formatNumber(stats.totalSeries)} different series`,
      category: 'series',
    });
  }

  return facts;
}

function generateStoryArcFacts(stats: StatsSummary): FunFact[] {
  const facts: FunFact[] = [];

  if (stats.storyArcCount > 0) {
    facts.push({
      icon: '🎬',
      text: `Your collection contains`,
      emphasis: `${formatNumber(stats.storyArcCount)} story arc${stats.storyArcCount !== 1 ? 's' : ''}`,
      category: 'arc',
    });
  }

  if (stats.storyArcCount > 10) {
    facts.push({
      icon: '📖',
      text: `${formatNumber(stats.storyArcCount)} epic storylines`,
      emphasis: 'waiting to unfold',
      category: 'arc',
    });
  }

  return facts;
}

function generateDiscoveryFacts(stats: StatsSummary, _allTimeStats: AllTimeStats | null): FunFact[] {
  const facts: FunFact[] = [];

  // Discovery based on unique counts
  if (stats.uniqueCreatorCount > 50) {
    facts.push({
      icon: '🔍',
      text: `You've discovered`,
      emphasis: `${formatNumber(stats.uniqueCreatorCount)} different creators`,
      category: 'discovery',
    });
  }

  if (stats.uniqueCharacterCount > 100) {
    facts.push({
      icon: '🦸',
      text: `${formatNumber(stats.uniqueCharacterCount)} characters`,
      emphasis: 'in your comics',
      category: 'discovery',
    });
  }

  // Exploration variety
  const entityCount = (stats.uniqueCreatorCount || 0) +
    (stats.uniqueCharacterCount || 0) +
    (stats.uniqueGenreCount || 0) +
    (stats.uniquePublisherCount || 0);

  if (entityCount > 200) {
    facts.push({
      icon: '🌍',
      text: `Your exploration score:`,
      emphasis: `${formatNumber(entityCount)} unique discoveries`,
      category: 'discovery',
    });
  }

  return facts;
}

function generateRatingsFacts(ratingStats: RatingStats | undefined): FunFact[] {
  const facts: FunFact[] = [];
  if (!ratingStats) return facts;

  const {
    totalSeriesRated,
    totalIssuesRated,
    totalReviewsWritten,
    ratingDistribution,
    averageRatingGiven,
    highestRatedSeries,
    lowestRatedSeries,
    mostRatedGenre,
    mostRatedPublisher,
    uniqueGenresRated,
    uniquePublishersRated,
    currentRatingStreak,
    longestRatingStreak,
    longestReviewLength,
    seriesWithCompleteRatings,
    maxRatingsSameDay,
    maxReviewsSameDay,
  } = ratingStats;

  // Total ratings given
  const totalRatings = totalSeriesRated + totalIssuesRated;
  if (totalRatings > 0) {
    facts.push({
      icon: '⭐',
      text: `You've given`,
      emphasis: `${formatNumber(totalRatings)} ratings`,
      category: 'ratings',
    });
  }

  // Series rated
  if (totalSeriesRated > 0) {
    facts.push({
      icon: '📊',
      text: `You've rated`,
      emphasis: `${formatNumber(totalSeriesRated)} series`,
      category: 'ratings',
    });
  }

  // Issues rated
  if (totalIssuesRated > 10) {
    facts.push({
      icon: '📝',
      text: `Individual issues rated:`,
      emphasis: formatNumber(totalIssuesRated),
      category: 'ratings',
    });
  }

  // Rating tendency based on average
  if (averageRatingGiven !== null) {
    if (averageRatingGiven >= 4.2) {
      facts.push({
        icon: '😊',
        text: `You're a generous critic, averaging`,
        emphasis: `${averageRatingGiven.toFixed(1)} stars`,
        category: 'ratings',
      });
    } else if (averageRatingGiven <= 2.8) {
      facts.push({
        icon: '🧐',
        text: `Tough critic! Your average rating is just`,
        emphasis: `${averageRatingGiven.toFixed(1)} stars`,
        category: 'ratings',
      });
    } else {
      facts.push({
        icon: '⚖️',
        text: `Your ratings are balanced, averaging`,
        emphasis: `${averageRatingGiven.toFixed(1)} stars`,
        category: 'ratings',
      });
    }
  }

  // Reviews written
  if (totalReviewsWritten > 0) {
    facts.push({
      icon: '✍️',
      text: `You've written`,
      emphasis: `${formatNumber(totalReviewsWritten)} review${totalReviewsWritten !== 1 ? 's' : ''}`,
      category: 'ratings',
    });
  }

  // Longest review
  if (longestReviewLength > 500) {
    facts.push({
      icon: '📖',
      text: `Your longest review is`,
      emphasis: `${formatNumber(longestReviewLength)} characters - a mini essay!`,
      category: 'ratings',
    });
  } else if (longestReviewLength > 100) {
    facts.push({
      icon: '💬',
      text: `Longest review:`,
      emphasis: `${formatNumber(longestReviewLength)} characters`,
      category: 'ratings',
    });
  }

  // Highest rated series
  if (highestRatedSeries) {
    facts.push({
      icon: '🏆',
      text: `Your top-rated series:`,
      emphasis: `${highestRatedSeries.name} (${highestRatedSeries.rating}★)`,
      category: 'ratings',
    });
  }

  // Lowest rated series
  if (lowestRatedSeries && lowestRatedSeries.rating <= 2) {
    facts.push({
      icon: '👎',
      text: `Your toughest review went to`,
      emphasis: `${lowestRatedSeries.name} (${lowestRatedSeries.rating}★)`,
      category: 'ratings',
    });
  }

  // Most rated genre
  if (mostRatedGenre && mostRatedGenre.count > 3) {
    facts.push({
      icon: '🎭',
      text: `${mostRatedGenre.name} is your most-rated genre with`,
      emphasis: `${mostRatedGenre.count} ratings`,
      category: 'ratings',
    });
  }

  // Most rated publisher
  if (mostRatedPublisher && mostRatedPublisher.count > 3) {
    facts.push({
      icon: '🏢',
      text: `You've rated ${mostRatedPublisher.name}`,
      emphasis: `${mostRatedPublisher.count} times`,
      category: 'ratings',
    });
  }

  // Rating distribution - find most common rating
  if (ratingDistribution && ratingDistribution.length > 0) {
    const sorted = [...ratingDistribution].sort((a, b) => b.count - a.count);
    const mostCommon = sorted[0];
    if (mostCommon && mostCommon.count > 3) {
      const stars = '★'.repeat(mostCommon.rating);
      facts.push({
        icon: '📊',
        text: `You give ${stars} more than any other rating`,
        emphasis: `(${mostCommon.count} times)`,
        category: 'ratings',
      });
    }

    // Check for lots of 5-star ratings
    const fiveStars = ratingDistribution.find(r => r.rating === 5);
    if (fiveStars && fiveStars.count >= 10 && totalRatings > 0) {
      const percentage = Math.round((fiveStars.count / totalRatings) * 100);
      if (percentage >= 40) {
        facts.push({
          icon: '🌟',
          text: `${percentage}% of your ratings are`,
          emphasis: '5 stars!',
          category: 'ratings',
        });
      }
    }
  }

  // Current rating streak
  if (currentRatingStreak > 0) {
    if (currentRatingStreak >= 7) {
      facts.push({
        icon: '🔥',
        text: `${currentRatingStreak}-day rating streak!`,
        emphasis: "You're on fire!",
        category: 'ratings',
      });
    } else {
      facts.push({
        icon: '⚡',
        text: `Current rating streak:`,
        emphasis: `${currentRatingStreak} day${currentRatingStreak !== 1 ? 's' : ''}`,
        category: 'ratings',
      });
    }
  }

  // Longest rating streak
  if (longestRatingStreak > 7 && longestRatingStreak > currentRatingStreak) {
    facts.push({
      icon: '🏅',
      text: `Your longest rating streak was`,
      emphasis: `${longestRatingStreak} days`,
      category: 'ratings',
    });
  }

  // Series with complete ratings
  if (seriesWithCompleteRatings > 0) {
    facts.push({
      icon: '✅',
      text: `You've rated every issue in`,
      emphasis: `${seriesWithCompleteRatings} series`,
      category: 'ratings',
    });
  }

  // Most ratings in one day
  if (maxRatingsSameDay >= 5) {
    facts.push({
      icon: '📈',
      text: `Your most productive rating day:`,
      emphasis: `${maxRatingsSameDay} ratings`,
      category: 'ratings',
    });
  }

  // Most reviews in one day
  if (maxReviewsSameDay >= 3) {
    facts.push({
      icon: '✏️',
      text: `Most reviews in one day:`,
      emphasis: `${maxReviewsSameDay}`,
      category: 'ratings',
    });
  }

  // Rating diversity - genres
  if (uniqueGenresRated >= 5) {
    facts.push({
      icon: '🌈',
      text: `Your ratings span`,
      emphasis: `${uniqueGenresRated} different genres`,
      category: 'ratings',
    });
  }

  // Rating diversity - publishers
  if (uniquePublishersRated >= 5) {
    facts.push({
      icon: '🌐',
      text: `You've rated comics from`,
      emphasis: `${uniquePublishersRated} publishers`,
      category: 'ratings',
    });
  }

  return facts;
}

// =============================================================================
// New Fact Generators - Stats Page Extended Data
// =============================================================================

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function generateDayOfWeekFacts(activity: DayOfWeekActivity[] | undefined): FunFact[] {
  const facts: FunFact[] = [];
  if (!activity || activity.length === 0) return facts;

  // Find favorite reading day
  const sortedByReads = [...activity].sort((a, b) => b.readCount - a.readCount);
  const favoriteDay = sortedByReads[0];
  if (favoriteDay && favoriteDay.readCount > 0) {
    facts.push({
      icon: '📅',
      text: `${favoriteDay.dayName} is your favorite reading day with`,
      emphasis: `${formatNumber(favoriteDay.readCount)} comics read`,
      category: 'dayOfWeek',
    });
  }

  // Weekend vs weekday pattern
  const weekendCount = activity.filter(d => d.dayOfWeek === 0 || d.dayOfWeek === 6)
    .reduce((sum, d) => sum + d.readCount, 0);
  const weekdayCount = activity.filter(d => d.dayOfWeek >= 1 && d.dayOfWeek <= 5)
    .reduce((sum, d) => sum + d.readCount, 0);
  const totalCount = weekendCount + weekdayCount;

  if (totalCount > 10) {
    const weekendPercentage = Math.round((weekendCount / totalCount) * 100);
    if (weekendPercentage >= 60) {
      facts.push({
        icon: '🌅',
        text: `Weekend warrior!`,
        emphasis: `${weekendPercentage}% of your reading happens on weekends`,
        category: 'dayOfWeek',
      });
    } else if (weekendPercentage <= 30) {
      facts.push({
        icon: '💼',
        text: `Weekday reader!`,
        emphasis: `${100 - weekendPercentage}% of reading during the week`,
        category: 'dayOfWeek',
      });
    }
  }

  // Most pages on a specific day
  const sortedByPages = [...activity].sort((a, b) => b.pagesRead - a.pagesRead);
  const topPageDay = sortedByPages[0];
  if (topPageDay && topPageDay.pagesRead > 100) {
    facts.push({
      icon: '📖',
      text: `You've turned ${formatNumber(topPageDay.pagesRead)} pages on`,
      emphasis: `${topPageDay.dayName}s`,
      category: 'dayOfWeek',
    });
  }

  // Least active day
  const leastActive = sortedByReads[sortedByReads.length - 1];
  if (leastActive && favoriteDay && favoriteDay.readCount > 5 && leastActive.readCount === 0) {
    facts.push({
      icon: '😴',
      text: `${leastActive.dayName}s are your`,
      emphasis: 'comic-free zone',
      category: 'dayOfWeek',
    });
  }

  return facts;
}

function generateFileFormatFacts(formats: FileFormatDistribution[] | undefined): FunFact[] {
  const facts: FunFact[] = [];
  if (!formats || formats.length === 0) return facts;

  // Most common format
  const topFormat = formats[0];
  if (topFormat && topFormat.count > 0) {
    const extension = topFormat.extension.toUpperCase();
    facts.push({
      icon: '📦',
      text: `${topFormat.percentage}% of your collection is`,
      emphasis: `${extension} format`,
      category: 'fileFormat',
    });
  }

  // CBR files (legacy format)
  const cbrFormat = formats.find(f => f.extension.toLowerCase() === 'cbr' || f.extension.toLowerCase() === '.cbr');
  if (cbrFormat && cbrFormat.count > 10) {
    facts.push({
      icon: '💾',
      text: `${formatNumber(cbrFormat.count)} CBR files`,
      emphasis: '(classic RAR format!)',
      category: 'fileFormat',
    });
  }

  // CB7 files (7-zip format)
  const cb7Format = formats.find(f => f.extension.toLowerCase() === 'cb7' || f.extension.toLowerCase() === '.cb7');
  if (cb7Format && cb7Format.count > 5) {
    facts.push({
      icon: '🗜️',
      text: `${formatNumber(cb7Format.count)} CB7 files using`,
      emphasis: '7-zip compression',
      category: 'fileFormat',
    });
  }

  // Format diversity
  if (formats.length >= 3) {
    facts.push({
      icon: '🗂️',
      text: `Your library uses`,
      emphasis: `${formats.length} different file formats`,
      category: 'fileFormat',
    });
  }

  return facts;
}

function generatePublicationStatusFacts(status: PublicationStatusDistribution[] | undefined): FunFact[] {
  const facts: FunFact[] = [];
  if (!status || status.length === 0) return facts;

  const ongoing = status.find(s => s.status === 'ongoing');
  const ended = status.find(s => s.status === 'ended');

  if (ongoing && ongoing.count > 0) {
    facts.push({
      icon: '📡',
      text: `Following`,
      emphasis: `${formatNumber(ongoing.count)} ongoing series`,
      category: 'publicationStatus',
    });

    if (ongoing.percentage >= 60) {
      facts.push({
        icon: '🆕',
        text: `Staying current!`,
        emphasis: `${ongoing.percentage}% of series are still running`,
        category: 'publicationStatus',
      });
    }
  }

  if (ended && ended.count > 0) {
    facts.push({
      icon: '✅',
      text: `${formatNumber(ended.count)} series are`,
      emphasis: 'completed runs',
      category: 'publicationStatus',
    });

    if (ended.percentage >= 60) {
      facts.push({
        icon: '📚',
        text: `Classic collector!`,
        emphasis: `${ended.percentage}% of series are completed`,
        category: 'publicationStatus',
      });
    }
  }

  return facts;
}

function generateLibrarySizeFacts(overview: EnhancedLibraryOverview | undefined): FunFact[] {
  const facts: FunFact[] = [];
  if (!overview) return facts;

  // Library size in GB
  if (overview.totalSizeBytes > 0) {
    facts.push({
      icon: '💿',
      text: `Your collection is`,
      emphasis: formatBytes(overview.totalSizeBytes),
      category: 'librarySize',
    });

    // DVD equivalents (4.7 GB per DVD)
    const dvdEquivalent = Math.ceil(overview.totalSizeBytes / (4.7 * 1024 * 1024 * 1024));
    if (dvdEquivalent > 1) {
      facts.push({
        icon: '📀',
        text: `That's equivalent to`,
        emphasis: `${dvdEquivalent} DVD${dvdEquivalent !== 1 ? 's' : ''} of comics`,
        category: 'librarySize',
      });
    }

    // Dial-up download time (56 kbps = 7 KB/s)
    const dialupSeconds = overview.totalSizeBytes / 7000;
    const dialupHours = Math.round(dialupSeconds / 3600);
    if (dialupHours > 24) {
      const dialupDays = Math.round(dialupHours / 24);
      facts.push({
        icon: '🐌',
        text: `On dial-up, that would take`,
        emphasis: `${formatNumber(dialupDays)} days to download`,
        category: 'librarySize',
      });
    } else if (dialupHours > 1) {
      facts.push({
        icon: '🐌',
        text: `On dial-up, that would take`,
        emphasis: `${formatNumber(dialupHours)} hours to download`,
        category: 'librarySize',
      });
    }

    // Average file size
    if (overview.totalFiles > 0) {
      const avgSize = overview.totalSizeBytes / overview.totalFiles;
      const avgMB = Math.round(avgSize / (1024 * 1024));
      if (avgMB > 0) {
        facts.push({
          icon: '📊',
          text: `Average file size:`,
          emphasis: `${avgMB} MB per comic`,
          category: 'librarySize',
        });
      }
    }
  }

  return facts;
}

function generateVolumeTagFacts(overview: EnhancedLibraryOverview | undefined): FunFact[] {
  const facts: FunFact[] = [];
  if (!overview) return facts;

  // Volumes count
  if (overview.totalVolumes > 0) {
    facts.push({
      icon: '📖',
      text: `${formatNumber(overview.totalVolumes)} collected volumes`,
      emphasis: 'in your library',
      category: 'collection',
    });
  }

  // Tags diversity
  if (overview.totalTags > 5) {
    facts.push({
      icon: '🏷️',
      text: `Your collection spans`,
      emphasis: `${overview.totalTags} different tags`,
      category: 'collection',
    });
  }

  // Total people (creators)
  if (overview.totalPeople > 50) {
    facts.push({
      icon: '👥',
      text: `Work from`,
      emphasis: `${formatNumber(overview.totalPeople)} creators`,
      category: 'collection',
    });
  }

  // Total read time from overview
  if (overview.totalReadTime > 3600) {
    facts.push({
      icon: '⏱️',
      text: `Library-wide reading time:`,
      emphasis: formatDuration(overview.totalReadTime),
      category: 'reading',
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
    ...generateCreatorFacts(summary.topCreators || [], summary.uniqueCreatorCount),
    ...generateCharacterFacts(summary.topCharacters || [], summary.uniqueCharacterCount),
    ...generateGenreFacts(summary.topGenres || [], summary.uniqueGenreCount),
    ...generatePublisherFacts(summary.topPublishers || [], summary.uniquePublisherCount),
    ...generateStreakFacts(summary, allTimeStats),
    ...generateTeamFacts(summary.topTeams || [], summary.uniqueTeamCount),
    ...generateTemporalFacts(summary),
    ...generateComparativeFacts(summary, allTimeStats),
    ...generateFormatFacts(summary),
    ...generateSeriesFacts(summary),
    ...generateStoryArcFacts(summary),
    ...generateDiscoveryFacts(summary, allTimeStats),
    ...generateRatingsFacts(summary.ratingStats),
    // New generators from stats page extended data
    ...generateDayOfWeekFacts(summary.dayOfWeekActivity),
    ...generateFileFormatFacts(summary.fileFormats),
    ...generatePublicationStatusFacts(summary.publicationStatus),
    ...generateLibrarySizeFacts(summary.libraryOverview),
    ...generateVolumeTagFacts(summary.libraryOverview),
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
    ...generateCreatorFacts(summary.topCreators || [], summary.uniqueCreatorCount),
    ...generateCharacterFacts(summary.topCharacters || [], summary.uniqueCharacterCount),
    ...generateGenreFacts(summary.topGenres || [], summary.uniqueGenreCount),
    ...generatePublisherFacts(summary.topPublishers || [], summary.uniquePublisherCount),
    ...generateStreakFacts(summary, allTimeStats),
    ...generateTeamFacts(summary.topTeams || [], summary.uniqueTeamCount),
    ...generateTemporalFacts(summary),
    ...generateComparativeFacts(summary, allTimeStats),
    ...generateFormatFacts(summary),
    ...generateSeriesFacts(summary),
    ...generateStoryArcFacts(summary),
    ...generateDiscoveryFacts(summary, allTimeStats),
    ...generateRatingsFacts(summary.ratingStats),
    // New generators from stats page extended data
    ...generateDayOfWeekFacts(summary.dayOfWeekActivity),
    ...generateFileFormatFacts(summary.fileFormats),
    ...generatePublicationStatusFacts(summary.publicationStatus),
    ...generateLibrarySizeFacts(summary.libraryOverview),
    ...generateVolumeTagFacts(summary.libraryOverview),
  ];

  // Shuffle and take unique facts
  const shuffled = [...allFacts].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}
