// =============================================================================
// Achievement System Configuration
// 530 achievements across 25 categories with star-based ranking
// =============================================================================

export type AchievementCategory =
  | 'page_milestones'
  | 'comic_completions'
  | 'reading_streaks'
  | 'reading_time'
  | 'author_aficionado'
  | 'artist_appreciation'
  | 'genre_explorer'
  | 'character_collector'
  | 'publisher_champion'
  | 'series_completionist'
  | 'collection_size'
  | 'team_player'
  | 'decade_explorer'
  | 'story_arc_explorer'
  | 'format_variety'
  | 'manga_international'
  | 'binge_reading'
  | 'reading_pace'
  | 'discovery'
  | 'special_achievements'
  | 'age_rating'
  | 'location_explorer'
  | 'bookmarks_notes'
  | 'sessions'
  | 'collection_completion'
  | 'ratings_engagement';

export type AchievementType =
  // Page & Comic totals
  | 'pages_total'
  | 'pages_session'
  | 'pages_day'
  | 'comics_total'
  | 'comics_day'
  // Streaks
  | 'streak_current'
  | 'streak_longest'
  | 'streak_special'
  // Time tracking
  | 'time_total'
  | 'time_session'
  | 'time_day'
  // Writers/Authors
  | 'unique_writers'
  | 'same_writer'
  | 'writer_pages'
  // Artists
  | 'unique_pencillers'
  | 'unique_inkers'
  | 'unique_colorists'
  | 'unique_letterers'
  | 'unique_cover_artists'
  | 'same_artist'
  | 'artist_team'
  | 'full_credits'
  // Genres
  | 'unique_genres'
  | 'genre_specific'
  // Characters
  | 'unique_characters'
  | 'same_character'
  | 'character_type'
  // Publishers
  | 'unique_publishers'
  | 'publisher_specific'
  | 'publisher_indie'
  | 'small_publisher'
  // Series
  | 'series_completed'
  | 'series_started'
  | 'series_length'
  | 'series_speed'
  // Collection
  | 'collection_owned'
  | 'collection_read'
  | 'collection_percentage'
  | 'series_percentage'
  | 'backlog_size'
  | 'read_rate'
  // Teams
  | 'unique_teams'
  | 'same_team'
  | 'team_specific'
  // Decades
  | 'unique_decades'
  | 'decade_specific'
  // Story arcs
  | 'arcs_completed'
  | 'events_completed'
  // Formats
  | 'format_specific'
  // Manga & International
  | 'manga_total'
  | 'unique_languages'
  // Reading Pace
  | 'reading_pace'
  | 'weekly_consistency'
  | 'daily_average'
  | 'session_consistency'
  | 'routine_reading'
  // Discovery
  | 'hidden_gem'
  // Special achievements
  | 'special_date'
  | 'special_time'
  | 'holiday_count'
  | 'issue_number'
  | 'series_finale'
  | 'anniversary_issue'
  | 'variant_cover'
  | 'one_shot'
  | 'annual'
  // Age ratings
  | 'rating_specific'
  | 'unique_ratings'
  | 'rating_balance'
  | 'metadata_quality'
  // Locations
  | 'unique_locations'
  | 'location_specific'
  | 'unique_dimensions'
  // Bookmarks & Notes
  | 'bookmarks_total'
  | 'notes_total'
  | 'series_with_notes'
  | 'comics_with_bookmarks'
  // Sessions
  | 'sessions_total'
  | 'sessions_day'
  | 'focused_sessions'
  | 'morning_sessions'
  | 'evening_sessions'
  | 'unique_hours'
  // Ratings & Reviews
  | 'ratings_total'
  | 'reviews_total'
  | 'genres_rated'
  | 'publishers_rated'
  | 'rating_streak'
  | 'review_length'
  | 'series_complete_rated'
  | 'ratings_same_day'
  | 'reviews_same_day';

export interface Achievement {
  id: string;
  key: string;
  name: string;
  description: string;
  category: AchievementCategory;
  type: AchievementType;
  stars: 1 | 2 | 3 | 4 | 5;
  icon: string;
  threshold: number;
  minRequired?: number; // Minimum requirement (e.g., library size for % achievements)
  metadata?: Record<string, string | number>; // Additional data for complex achievements
}

export const CATEGORY_INFO: Record<AchievementCategory, { name: string; icon: string; description: string }> = {
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
  ratings_engagement: { name: 'Ratings & Reviews', icon: 'star', description: 'Sharing your opinions on comics' },
};

// =============================================================================
// Category 1: PAGE MILESTONES (20 achievements)
// =============================================================================

export const PAGE_MILESTONE_ACHIEVEMENTS: Achievement[] = [
  { id: 'pm-1', key: 'pages_50', name: 'First Steps', description: 'Read 50 pages', category: 'page_milestones', type: 'pages_total', stars: 1, icon: 'book', threshold: 50 },
  { id: 'pm-2', key: 'pages_100', name: 'Getting Started', description: 'Read 100 pages', category: 'page_milestones', type: 'pages_total', stars: 1, icon: 'book', threshold: 100 },
  { id: 'pm-3', key: 'pages_250', name: 'Page Turner', description: 'Read 250 pages', category: 'page_milestones', type: 'pages_total', stars: 1, icon: 'book', threshold: 250 },
  { id: 'pm-4', key: 'pages_500', name: 'Warming Up', description: 'Read 500 pages', category: 'page_milestones', type: 'pages_total', stars: 1, icon: 'book', threshold: 500 },
  { id: 'pm-5', key: 'pages_1000', name: 'Bookworm', description: 'Read 1,000 pages', category: 'page_milestones', type: 'pages_total', stars: 2, icon: 'books', threshold: 1000 },
  { id: 'pm-6', key: 'pages_2500', name: 'Avid Reader', description: 'Read 2,500 pages', category: 'page_milestones', type: 'pages_total', stars: 2, icon: 'books', threshold: 2500 },
  { id: 'pm-7', key: 'pages_5000', name: 'Dedicated', description: 'Read 5,000 pages', category: 'page_milestones', type: 'pages_total', stars: 2, icon: 'books', threshold: 5000 },
  { id: 'pm-8', key: 'pages_10000', name: 'Library Regular', description: 'Read 10,000 pages', category: 'page_milestones', type: 'pages_total', stars: 3, icon: 'library', threshold: 10000 },
  { id: 'pm-9', key: 'pages_25000', name: 'Voracious', description: 'Read 25,000 pages', category: 'page_milestones', type: 'pages_total', stars: 3, icon: 'library', threshold: 25000 },
  { id: 'pm-10', key: 'pages_50000', name: 'Page Devourer', description: 'Read 50,000 pages', category: 'page_milestones', type: 'pages_total', stars: 3, icon: 'library', threshold: 50000 },
  { id: 'pm-11', key: 'pages_100000', name: 'Archive Master', description: 'Read 100,000 pages', category: 'page_milestones', type: 'pages_total', stars: 4, icon: 'trophy', threshold: 100000 },
  { id: 'pm-12', key: 'pages_250000', name: 'Reading Machine', description: 'Read 250,000 pages', category: 'page_milestones', type: 'pages_total', stars: 4, icon: 'trophy', threshold: 250000 },
  { id: 'pm-13', key: 'pages_500000', name: 'Page Conqueror', description: 'Read 500,000 pages', category: 'page_milestones', type: 'pages_total', stars: 4, icon: 'trophy', threshold: 500000 },
  { id: 'pm-14', key: 'pages_1000000', name: 'Million Pages', description: 'Read 1,000,000 pages', category: 'page_milestones', type: 'pages_total', stars: 5, icon: 'crown', threshold: 1000000 },
  { id: 'pm-15', key: 'pages_2500000', name: 'Legendary Reader', description: 'Read 2,500,000 pages', category: 'page_milestones', type: 'pages_total', stars: 5, icon: 'crown', threshold: 2500000 },
  { id: 'pm-16', key: 'pages_5000000', name: 'Page Titan', description: 'Read 5,000,000 pages', category: 'page_milestones', type: 'pages_total', stars: 5, icon: 'crown', threshold: 5000000 },
  { id: 'pm-17', key: 'pages_10000000', name: 'Infinite Reader', description: 'Read 10,000,000 pages', category: 'page_milestones', type: 'pages_total', stars: 5, icon: 'crown', threshold: 10000000 },
  { id: 'pm-18', key: 'pages_session_10', name: 'Quick Flip', description: 'Read 10 pages in one session', category: 'page_milestones', type: 'pages_session', stars: 1, icon: 'zap', threshold: 10 },
  { id: 'pm-19', key: 'pages_session_100', name: 'Cover to Cover', description: 'Read 100 pages in one session', category: 'page_milestones', type: 'pages_session', stars: 2, icon: 'zap', threshold: 100 },
  { id: 'pm-20', key: 'pages_session_500', name: 'Marathon Reader', description: 'Read 500 pages in one session', category: 'page_milestones', type: 'pages_session', stars: 3, icon: 'zap', threshold: 500 },
];

// =============================================================================
// Category 2: COMIC COMPLETIONS (20 achievements)
// =============================================================================

export const COMIC_COMPLETION_ACHIEVEMENTS: Achievement[] = [
  { id: 'cc-1', key: 'comics_1', name: 'First Finish', description: 'Complete your first comic', category: 'comic_completions', type: 'comics_total', stars: 1, icon: 'check', threshold: 1 },
  { id: 'cc-2', key: 'comics_5', name: 'Getting Hooked', description: 'Complete 5 comics', category: 'comic_completions', type: 'comics_total', stars: 1, icon: 'check', threshold: 5 },
  { id: 'cc-3', key: 'comics_10', name: 'First Ten', description: 'Complete 10 comics', category: 'comic_completions', type: 'comics_total', stars: 1, icon: 'check', threshold: 10 },
  { id: 'cc-4', key: 'comics_25', name: 'Collector', description: 'Complete 25 comics', category: 'comic_completions', type: 'comics_total', stars: 1, icon: 'stack', threshold: 25 },
  { id: 'cc-5', key: 'comics_50', name: 'Half Century', description: 'Complete 50 comics', category: 'comic_completions', type: 'comics_total', stars: 2, icon: 'stack', threshold: 50 },
  { id: 'cc-6', key: 'comics_100', name: 'Century Club', description: 'Complete 100 comics', category: 'comic_completions', type: 'comics_total', stars: 2, icon: 'medal', threshold: 100 },
  { id: 'cc-7', key: 'comics_250', name: 'Dedicated Reader', description: 'Complete 250 comics', category: 'comic_completions', type: 'comics_total', stars: 2, icon: 'medal', threshold: 250 },
  { id: 'cc-8', key: 'comics_500', name: 'Serious Collector', description: 'Complete 500 comics', category: 'comic_completions', type: 'comics_total', stars: 3, icon: 'award', threshold: 500 },
  { id: 'cc-9', key: 'comics_750', name: 'Comic Veteran', description: 'Complete 750 comics', category: 'comic_completions', type: 'comics_total', stars: 3, icon: 'award', threshold: 750 },
  { id: 'cc-10', key: 'comics_1000', name: 'Thousand Strong', description: 'Complete 1,000 comics', category: 'comic_completions', type: 'comics_total', stars: 3, icon: 'award', threshold: 1000 },
  { id: 'cc-11', key: 'comics_2500', name: 'Major League', description: 'Complete 2,500 comics', category: 'comic_completions', type: 'comics_total', stars: 4, icon: 'trophy', threshold: 2500 },
  { id: 'cc-12', key: 'comics_5000', name: 'Elite Reader', description: 'Complete 5,000 comics', category: 'comic_completions', type: 'comics_total', stars: 4, icon: 'trophy', threshold: 5000 },
  { id: 'cc-13', key: 'comics_7500', name: 'Comic Legend', description: 'Complete 7,500 comics', category: 'comic_completions', type: 'comics_total', stars: 4, icon: 'trophy', threshold: 7500 },
  { id: 'cc-14', key: 'comics_10000', name: 'Ten Thousand', description: 'Complete 10,000 comics', category: 'comic_completions', type: 'comics_total', stars: 5, icon: 'crown', threshold: 10000 },
  { id: 'cc-15', key: 'comics_25000', name: 'Master Collector', description: 'Complete 25,000 comics', category: 'comic_completions', type: 'comics_total', stars: 5, icon: 'crown', threshold: 25000 },
  { id: 'cc-16', key: 'comics_50000', name: 'Ultimate Reader', description: 'Complete 50,000 comics', category: 'comic_completions', type: 'comics_total', stars: 5, icon: 'crown', threshold: 50000 },
  { id: 'cc-17', key: 'comics_100000', name: 'Comic Deity', description: 'Complete 100,000 comics', category: 'comic_completions', type: 'comics_total', stars: 5, icon: 'crown', threshold: 100000 },
  { id: 'cc-18', key: 'comics_day_12', name: 'Daily Dozen', description: 'Complete 12 comics in one day', category: 'comic_completions', type: 'comics_day', stars: 2, icon: 'zap', threshold: 12 },
  { id: 'cc-19', key: 'comics_day_25', name: 'Power Reader', description: 'Complete 25 comics in one day', category: 'comic_completions', type: 'comics_day', stars: 3, icon: 'zap', threshold: 25 },
  { id: 'cc-20', key: 'comics_day_50', name: 'Unstoppable', description: 'Complete 50 comics in one day', category: 'comic_completions', type: 'comics_day', stars: 4, icon: 'zap', threshold: 50 },
];
// =============================================================================
// Category 3: READING STREAKS (25 achievements)
// =============================================================================

export const READING_STREAK_ACHIEVEMENTS: Achievement[] = [
  { id: 'rs-1', key: 'streak_3', name: 'Getting Started', description: '3 day reading streak', category: 'reading_streaks', type: 'streak_longest', stars: 1, icon: 'flame', threshold: 3 },
  { id: 'rs-2', key: 'streak_5', name: 'Habit Forming', description: '5 day reading streak', category: 'reading_streaks', type: 'streak_longest', stars: 1, icon: 'flame', threshold: 5 },
  { id: 'rs-3', key: 'streak_7', name: 'Week Warrior', description: '7 day reading streak', category: 'reading_streaks', type: 'streak_longest', stars: 1, icon: 'flame', threshold: 7 },
  { id: 'rs-4', key: 'streak_14', name: 'Two Weeks Strong', description: '14 day reading streak', category: 'reading_streaks', type: 'streak_longest', stars: 2, icon: 'flame', threshold: 14 },
  { id: 'rs-5', key: 'streak_21', name: 'Three Week Wonder', description: '21 day reading streak', category: 'reading_streaks', type: 'streak_longest', stars: 2, icon: 'flame', threshold: 21 },
  { id: 'rs-6', key: 'streak_30', name: 'Month Master', description: '30 day reading streak', category: 'reading_streaks', type: 'streak_longest', stars: 2, icon: 'flame', threshold: 30 },
  { id: 'rs-7', key: 'streak_42', name: 'Six Weeks', description: '42 day reading streak', category: 'reading_streaks', type: 'streak_longest', stars: 3, icon: 'flame', threshold: 42 },
  { id: 'rs-8', key: 'streak_60', name: 'Two Month Titan', description: '60 day reading streak', category: 'reading_streaks', type: 'streak_longest', stars: 3, icon: 'flame', threshold: 60 },
  { id: 'rs-9', key: 'streak_90', name: 'Quarter Year', description: '90 day reading streak', category: 'reading_streaks', type: 'streak_longest', stars: 3, icon: 'flame', threshold: 90 },
  { id: 'rs-10', key: 'streak_100', name: 'Dedication', description: '100 day reading streak', category: 'reading_streaks', type: 'streak_longest', stars: 3, icon: 'star', threshold: 100 },
  { id: 'rs-11', key: 'streak_120', name: 'Semester Reader', description: '120 day reading streak', category: 'reading_streaks', type: 'streak_longest', stars: 4, icon: 'star', threshold: 120 },
  { id: 'rs-12', key: 'streak_180', name: 'Half Year Hero', description: '180 day reading streak', category: 'reading_streaks', type: 'streak_longest', stars: 4, icon: 'star', threshold: 180 },
  { id: 'rs-13', key: 'streak_200', name: 'Season Champion', description: '200 day reading streak', category: 'reading_streaks', type: 'streak_longest', stars: 4, icon: 'star', threshold: 200 },
  { id: 'rs-14', key: 'streak_250', name: 'Two-Fifty', description: '250 day reading streak', category: 'reading_streaks', type: 'streak_longest', stars: 4, icon: 'star', threshold: 250 },
  { id: 'rs-15', key: 'streak_365', name: 'Annual Legend', description: '365 day reading streak', category: 'reading_streaks', type: 'streak_longest', stars: 5, icon: 'crown', threshold: 365 },
  { id: 'rs-16', key: 'streak_400', name: 'Beyond a Year', description: '400 day reading streak', category: 'reading_streaks', type: 'streak_longest', stars: 5, icon: 'crown', threshold: 400 },
  { id: 'rs-17', key: 'streak_548', name: 'Year and a Half', description: '548 day reading streak', category: 'reading_streaks', type: 'streak_longest', stars: 5, icon: 'crown', threshold: 548 },
  { id: 'rs-18', key: 'streak_730', name: 'Two Year Titan', description: '730 day reading streak', category: 'reading_streaks', type: 'streak_longest', stars: 5, icon: 'crown', threshold: 730 },
  { id: 'rs-19', key: 'streak_1000', name: 'Eternal Reader', description: '1,000 day reading streak', category: 'reading_streaks', type: 'streak_longest', stars: 5, icon: 'crown', threshold: 1000 },
  { id: 'rs-20', key: 'weekend_warrior', name: 'Weekend Warrior', description: 'Read on both Saturday and Sunday', category: 'reading_streaks', type: 'special_date', stars: 1, icon: 'calendar', threshold: 1, metadata: { pattern: 'weekend' } },
  { id: 'rs-21', key: 'full_week', name: 'Full Week', description: 'Read every day of the week (Mon-Sun)', category: 'reading_streaks', type: 'special_date', stars: 2, icon: 'calendar', threshold: 1, metadata: { pattern: 'full_week' } },
  { id: 'rs-22', key: 'month_perfection', name: 'Month Perfection', description: 'Read every day of a calendar month', category: 'reading_streaks', type: 'special_date', stars: 3, icon: 'calendar', threshold: 1, metadata: { pattern: 'full_month' } },
  { id: 'rs-23', key: 'early_bird', name: 'Early Bird', description: 'Read before 8 AM', category: 'reading_streaks', type: 'special_time', stars: 1, icon: 'sunrise', threshold: 1, metadata: { hour_before: 8 } },
  { id: 'rs-24', key: 'night_owl', name: 'Night Owl', description: 'Read after midnight', category: 'reading_streaks', type: 'special_time', stars: 1, icon: 'moon', threshold: 1, metadata: { hour_after: 0 } },
  { id: 'rs-25', key: 'all_hours', name: 'All Hours', description: 'Read at every hour of the day (24 unique hours)', category: 'reading_streaks', type: 'special_time', stars: 2, icon: 'clock', threshold: 24 },
];
// =============================================================================
// Category 4: READING TIME (20 achievements)
// Time thresholds are in seconds
// =============================================================================

export const READING_TIME_ACHIEVEMENTS: Achievement[] = [
  { id: 'rt-1', key: 'time_1h', name: 'First Hour', description: 'Read for 1 hour total', category: 'reading_time', type: 'time_total', stars: 1, icon: 'clock', threshold: 3600 },
  { id: 'rt-2', key: 'time_5h', name: 'Time Invested', description: 'Read for 5 hours total', category: 'reading_time', type: 'time_total', stars: 1, icon: 'clock', threshold: 18000 },
  { id: 'rt-3', key: 'time_10h', name: 'Ten Hours', description: 'Read for 10 hours total', category: 'reading_time', type: 'time_total', stars: 1, icon: 'clock', threshold: 36000 },
  { id: 'rt-4', key: 'time_24h', name: "Day's Worth", description: 'Read for 24 hours total', category: 'reading_time', type: 'time_total', stars: 2, icon: 'clock', threshold: 86400 },
  { id: 'rt-5', key: 'time_48h', name: 'Two Days', description: 'Read for 48 hours total', category: 'reading_time', type: 'time_total', stars: 2, icon: 'clock', threshold: 172800 },
  { id: 'rt-6', key: 'time_40h', name: 'Work Week', description: 'Read for 40 hours total', category: 'reading_time', type: 'time_total', stars: 2, icon: 'clock', threshold: 144000 },
  { id: 'rt-7', key: 'time_168h', name: "Week's Worth", description: 'Read for 168 hours total', category: 'reading_time', type: 'time_total', stars: 3, icon: 'clock', threshold: 604800 },
  { id: 'rt-8', key: 'time_336h', name: 'Two Weeks', description: 'Read for 336 hours total', category: 'reading_time', type: 'time_total', stars: 3, icon: 'clock', threshold: 1209600 },
  { id: 'rt-9', key: 'time_720h', name: 'Month of Reading', description: 'Read for 720 hours total', category: 'reading_time', type: 'time_total', stars: 3, icon: 'clock', threshold: 2592000 },
  { id: 'rt-10', key: 'time_1000h', name: 'Thousand Hours', description: 'Read for 1,000 hours total', category: 'reading_time', type: 'time_total', stars: 4, icon: 'trophy', threshold: 3600000 },
  { id: 'rt-11', key: 'time_4380h', name: 'Half Year', description: 'Read for 4,380 hours total', category: 'reading_time', type: 'time_total', stars: 4, icon: 'trophy', threshold: 15768000 },
  { id: 'rt-12', key: 'time_8760h', name: "Year's Worth", description: 'Read for 8,760 hours total', category: 'reading_time', type: 'time_total', stars: 5, icon: 'crown', threshold: 31536000 },
  { id: 'rt-13', key: 'session_15m', name: 'Quick Session', description: 'Single session of 15 minutes', category: 'reading_time', type: 'time_session', stars: 1, icon: 'play', threshold: 900 },
  { id: 'rt-14', key: 'session_30m', name: 'Solid Session', description: 'Single session of 30 minutes', category: 'reading_time', type: 'time_session', stars: 1, icon: 'play', threshold: 1800 },
  { id: 'rt-15', key: 'session_1h', name: 'Hour Block', description: 'Single session of 1 hour', category: 'reading_time', type: 'time_session', stars: 2, icon: 'play', threshold: 3600 },
  { id: 'rt-16', key: 'session_2h', name: 'Binge Session', description: 'Single session of 2 hours', category: 'reading_time', type: 'time_session', stars: 2, icon: 'play', threshold: 7200 },
  { id: 'rt-17', key: 'session_4h', name: 'Deep Dive', description: 'Single session of 4 hours', category: 'reading_time', type: 'time_session', stars: 3, icon: 'zap', threshold: 14400 },
  { id: 'rt-18', key: 'session_8h', name: 'Marathon Session', description: 'Single session of 8 hours', category: 'reading_time', type: 'time_session', stars: 4, icon: 'zap', threshold: 28800 },
  { id: 'rt-19', key: 'session_12h', name: 'Session Unstoppable', description: 'Single session of 12 hours', category: 'reading_time', type: 'time_session', stars: 5, icon: 'crown', threshold: 43200 },
  { id: 'rt-20', key: 'session_24h', name: 'Day Reader', description: 'Single session of 24 hours', category: 'reading_time', type: 'time_session', stars: 5, icon: 'crown', threshold: 86400 },
];
// =============================================================================
// Category 5: AUTHOR AFICIONADO (30 achievements)
// =============================================================================

export const AUTHOR_ACHIEVEMENTS: Achievement[] = [
  { id: 'au-1', key: 'first_writer', name: 'First Writer', description: 'Read a comic with a credited writer', category: 'author_aficionado', type: 'unique_writers', stars: 1, icon: 'pen', threshold: 1 },
  { id: 'au-2', key: 'writers_5', name: 'Five Voices', description: 'Read 5 different writers', category: 'author_aficionado', type: 'unique_writers', stars: 1, icon: 'pen', threshold: 5 },
  { id: 'au-3', key: 'writers_10', name: 'Ten Writers', description: 'Read 10 different writers', category: 'author_aficionado', type: 'unique_writers', stars: 1, icon: 'pen', threshold: 10 },
  { id: 'au-4', key: 'writers_25', name: 'Writer Explorer', description: 'Read 25 different writers', category: 'author_aficionado', type: 'unique_writers', stars: 2, icon: 'pen', threshold: 25 },
  { id: 'au-5', key: 'writers_50', name: 'Diverse Tastes', description: 'Read 50 different writers', category: 'author_aficionado', type: 'unique_writers', stars: 2, icon: 'pen', threshold: 50 },
  { id: 'au-6', key: 'writers_100', name: 'Story Sampler', description: 'Read 100 different writers', category: 'author_aficionado', type: 'unique_writers', stars: 3, icon: 'pen', threshold: 100 },
  { id: 'au-7', key: 'writers_200', name: 'Writer Collector', description: 'Read 200 different writers', category: 'author_aficionado', type: 'unique_writers', stars: 3, icon: 'pen', threshold: 200 },
  { id: 'au-8', key: 'writers_500', name: 'Author Connoisseur', description: 'Read 500 different writers', category: 'author_aficionado', type: 'unique_writers', stars: 4, icon: 'trophy', threshold: 500 },
  { id: 'au-9', key: 'writers_1000', name: 'Literary Legend', description: 'Read 1,000 different writers', category: 'author_aficionado', type: 'unique_writers', stars: 5, icon: 'crown', threshold: 1000 },
  { id: 'au-10', key: 'same_writer_10', name: "Writer's Fan I", description: 'Read 10 comics by the same writer', category: 'author_aficionado', type: 'same_writer', stars: 2, icon: 'heart', threshold: 10 },
  { id: 'au-11', key: 'same_writer_25', name: "Writer's Fan II", description: 'Read 25 comics by the same writer', category: 'author_aficionado', type: 'same_writer', stars: 2, icon: 'heart', threshold: 25 },
  { id: 'au-12', key: 'same_writer_50', name: "Writer's Fan III", description: 'Read 50 comics by the same writer', category: 'author_aficionado', type: 'same_writer', stars: 3, icon: 'heart', threshold: 50 },
  { id: 'au-13', key: 'same_writer_100', name: 'Writer Devotee', description: 'Read 100 comics by the same writer', category: 'author_aficionado', type: 'same_writer', stars: 3, icon: 'heart', threshold: 100 },
  { id: 'au-14', key: 'same_writer_250', name: "Writer's Champion", description: 'Read 250 comics by the same writer', category: 'author_aficionado', type: 'same_writer', stars: 4, icon: 'trophy', threshold: 250 },
  { id: 'au-15', key: 'same_writer_500', name: "Writer's Megafan", description: 'Read 500 comics by the same writer', category: 'author_aficionado', type: 'same_writer', stars: 5, icon: 'crown', threshold: 500 },
  { id: 'au-16', key: 'dynamic_duo', name: 'Dynamic Duo', description: 'Read a comic with 2 writers', category: 'author_aficionado', type: 'same_writer', stars: 1, icon: 'users', threshold: 1, metadata: { writers: 2 } },
  { id: 'au-17', key: 'writing_team', name: 'Writing Team', description: 'Read a comic with 3+ writers', category: 'author_aficionado', type: 'same_writer', stars: 2, icon: 'users', threshold: 1, metadata: { writers: 3 } },
  { id: 'au-18', key: 'writers_room', name: 'Writers Room', description: 'Read comics with 10 different writing teams', category: 'author_aficionado', type: 'same_writer', stars: 3, icon: 'users', threshold: 10 },
  { id: 'au-19', key: 'prolific_reader_1', name: 'Prolific Reader I', description: "Read a writer's complete run on a series", category: 'author_aficionado', type: 'same_writer', stars: 2, icon: 'check-circle', threshold: 1 },
  { id: 'au-20', key: 'prolific_reader_2', name: 'Prolific Reader II', description: 'Read 5 complete runs by different writers', category: 'author_aficionado', type: 'same_writer', stars: 3, icon: 'check-circle', threshold: 5 },
  { id: 'au-21', key: 'prolific_reader_3', name: 'Prolific Reader III', description: 'Read 25 complete runs by different writers', category: 'author_aficionado', type: 'same_writer', stars: 4, icon: 'check-circle', threshold: 25 },
  { id: 'au-22', key: 'new_discovery', name: 'New Discovery', description: 'Read your first comic by a new writer (after 100+ comics)', category: 'author_aficionado', type: 'unique_writers', stars: 1, icon: 'search', threshold: 1, minRequired: 100 },
  { id: 'au-23', key: 'fresh_perspectives', name: 'Fresh Perspectives', description: 'Discover 10 new writers (after 100+ comics)', category: 'author_aficionado', type: 'unique_writers', stars: 2, icon: 'search', threshold: 10, minRequired: 100 },
  { id: 'au-24', key: 'always_exploring', name: 'Always Exploring', description: 'Discover 50 new writers (after 500+ comics)', category: 'author_aficionado', type: 'unique_writers', stars: 3, icon: 'search', threshold: 50, minRequired: 500 },
  { id: 'au-25', key: 'writer_loyalty_1', name: 'Writer Loyalty I', description: 'Read the same writer 7 days in a row', category: 'author_aficionado', type: 'same_writer', stars: 1, icon: 'flame', threshold: 7 },
  { id: 'au-26', key: 'writer_loyalty_2', name: 'Writer Loyalty II', description: 'Read the same writer 30 days in a row', category: 'author_aficionado', type: 'same_writer', stars: 2, icon: 'flame', threshold: 30 },
  { id: 'au-27', key: 'writer_loyalty_3', name: 'Writer Loyalty III', description: 'Read the same writer 100 days in a row', category: 'author_aficionado', type: 'same_writer', stars: 3, icon: 'flame', threshold: 100 },
  { id: 'au-28', key: 'wordsmith_appreciation', name: 'Wordsmith Appreciation', description: 'Read 1,000 pages by a single writer', category: 'author_aficionado', type: 'same_writer', stars: 2, icon: 'book', threshold: 1000 },
  { id: 'au-29', key: 'writer_immersion', name: 'Writer Immersion', description: 'Read 5,000 pages by a single writer', category: 'author_aficionado', type: 'same_writer', stars: 3, icon: 'book', threshold: 5000 },
  { id: 'au-30', key: 'writer_encyclopedia', name: 'Writer Encyclopedia', description: 'Read 25,000 pages by a single writer', category: 'author_aficionado', type: 'same_writer', stars: 4, icon: 'book', threshold: 25000 },
];
// =============================================================================
// Category 6: ARTIST APPRECIATION (30 achievements)
// =============================================================================

export const ARTIST_ACHIEVEMENTS: Achievement[] = [
  { id: 'ar-1', key: 'first_penciller', name: 'First Penciller', description: 'Read a comic with a credited penciller', category: 'artist_appreciation', type: 'unique_pencillers', stars: 1, icon: 'palette', threshold: 1 },
  { id: 'ar-2', key: 'pencillers_5', name: 'Five Pencillers', description: 'Read 5 different pencillers', category: 'artist_appreciation', type: 'unique_pencillers', stars: 1, icon: 'palette', threshold: 5 },
  { id: 'ar-3', key: 'pencillers_10', name: 'Ten Pencillers', description: 'Read 10 different pencillers', category: 'artist_appreciation', type: 'unique_pencillers', stars: 1, icon: 'palette', threshold: 10 },
  { id: 'ar-4', key: 'pencillers_25', name: 'Art Explorer', description: 'Read 25 different pencillers', category: 'artist_appreciation', type: 'unique_pencillers', stars: 2, icon: 'palette', threshold: 25 },
  { id: 'ar-5', key: 'pencillers_50', name: 'Visual Variety', description: 'Read 50 different pencillers', category: 'artist_appreciation', type: 'unique_pencillers', stars: 2, icon: 'palette', threshold: 50 },
  { id: 'ar-6', key: 'pencillers_100', name: 'Art Connoisseur', description: 'Read 100 different pencillers', category: 'artist_appreciation', type: 'unique_pencillers', stars: 3, icon: 'palette', threshold: 100 },
  { id: 'ar-7', key: 'pencillers_250', name: 'Visual Master', description: 'Read 250 different pencillers', category: 'artist_appreciation', type: 'unique_pencillers', stars: 4, icon: 'trophy', threshold: 250 },
  { id: 'ar-8', key: 'pencillers_500', name: 'Art Historian', description: 'Read 500 different pencillers', category: 'artist_appreciation', type: 'unique_pencillers', stars: 5, icon: 'crown', threshold: 500 },
  { id: 'ar-9', key: 'inkers_10', name: 'Inker Aware', description: 'Read 10 different inkers', category: 'artist_appreciation', type: 'unique_inkers', stars: 2, icon: 'pen-tool', threshold: 10 },
  { id: 'ar-10', key: 'inkers_50', name: 'Inker Enthusiast', description: 'Read 50 different inkers', category: 'artist_appreciation', type: 'unique_inkers', stars: 3, icon: 'pen-tool', threshold: 50 },
  { id: 'ar-11', key: 'inkers_200', name: 'Inker Expert', description: 'Read 200 different inkers', category: 'artist_appreciation', type: 'unique_inkers', stars: 4, icon: 'pen-tool', threshold: 200 },
  { id: 'ar-12', key: 'colorists_10', name: 'Color Curious', description: 'Read 10 different colorists', category: 'artist_appreciation', type: 'unique_colorists', stars: 2, icon: 'droplet', threshold: 10 },
  { id: 'ar-13', key: 'colorists_50', name: 'Color Enthusiast', description: 'Read 50 different colorists', category: 'artist_appreciation', type: 'unique_colorists', stars: 3, icon: 'droplet', threshold: 50 },
  { id: 'ar-14', key: 'colorists_200', name: 'Color Connoisseur', description: 'Read 200 different colorists', category: 'artist_appreciation', type: 'unique_colorists', stars: 4, icon: 'droplet', threshold: 200 },
  { id: 'ar-15', key: 'letterers_10', name: 'Letterer Lover', description: 'Read 10 different letterers', category: 'artist_appreciation', type: 'unique_letterers', stars: 2, icon: 'type', threshold: 10 },
  { id: 'ar-16', key: 'letterers_50', name: 'Typography Fan', description: 'Read 50 different letterers', category: 'artist_appreciation', type: 'unique_letterers', stars: 3, icon: 'type', threshold: 50 },
  { id: 'ar-17', key: 'letterers_200', name: 'Letter Expert', description: 'Read 200 different letterers', category: 'artist_appreciation', type: 'unique_letterers', stars: 4, icon: 'type', threshold: 200 },
  { id: 'ar-18', key: 'cover_artists_10', name: 'Cover Collector', description: 'Read 10 different cover artists', category: 'artist_appreciation', type: 'unique_cover_artists', stars: 2, icon: 'image', threshold: 10 },
  { id: 'ar-19', key: 'cover_artists_50', name: 'Cover Hunter', description: 'Read 50 different cover artists', category: 'artist_appreciation', type: 'unique_cover_artists', stars: 3, icon: 'image', threshold: 50 },
  { id: 'ar-20', key: 'cover_artists_200', name: 'Cover Expert', description: 'Read 200 different cover artists', category: 'artist_appreciation', type: 'unique_cover_artists', stars: 4, icon: 'image', threshold: 200 },
  { id: 'ar-21', key: 'same_artist_10', name: "Artist's Fan I", description: 'Read 10 comics by the same artist', category: 'artist_appreciation', type: 'same_artist', stars: 2, icon: 'heart', threshold: 10 },
  { id: 'ar-22', key: 'same_artist_50', name: "Artist's Fan II", description: 'Read 50 comics by the same artist', category: 'artist_appreciation', type: 'same_artist', stars: 3, icon: 'heart', threshold: 50 },
  { id: 'ar-23', key: 'same_artist_100', name: 'Artist Devotee', description: 'Read 100 comics by the same artist', category: 'artist_appreciation', type: 'same_artist', stars: 4, icon: 'heart', threshold: 100 },
  { id: 'ar-24', key: 'same_artist_500', name: 'Artist Megafan', description: 'Read 500 comics by the same artist', category: 'artist_appreciation', type: 'same_artist', stars: 5, icon: 'crown', threshold: 500 },
  { id: 'ar-25', key: 'art_team_10', name: 'Art Team', description: 'Read 10 comics with the same writer/artist team', category: 'artist_appreciation', type: 'same_artist', stars: 2, icon: 'users', threshold: 10 },
  { id: 'ar-26', key: 'art_team_50', name: 'Dream Team', description: 'Read 50 comics with the same writer/artist team', category: 'artist_appreciation', type: 'same_artist', stars: 3, icon: 'users', threshold: 50 },
  { id: 'ar-27', key: 'art_team_100', name: 'Legendary Duo', description: 'Read 100 comics with the same writer/artist team', category: 'artist_appreciation', type: 'same_artist', stars: 4, icon: 'users', threshold: 100 },
  { id: 'ar-28', key: 'full_credits', name: 'Full Credits', description: 'Read a comic with all roles credited', category: 'artist_appreciation', type: 'same_artist', stars: 2, icon: 'list', threshold: 1 },
  { id: 'ar-29', key: 'credits_collector_50', name: 'Credits Collector', description: 'Read 50 comics with all roles credited', category: 'artist_appreciation', type: 'same_artist', stars: 3, icon: 'list', threshold: 50 },
  { id: 'ar-30', key: 'production_expert', name: 'Production Expert', description: 'Read 250 comics with all roles credited', category: 'artist_appreciation', type: 'same_artist', stars: 4, icon: 'list', threshold: 250 },
];
// =============================================================================
// Category 7: GENRE EXPLORER (30 achievements)
// =============================================================================

export const GENRE_ACHIEVEMENTS: Achievement[] = [
  { id: 'ge-1', key: 'first_genre', name: 'First Genre', description: 'Read a comic with a tagged genre', category: 'genre_explorer', type: 'unique_genres', stars: 1, icon: 'compass', threshold: 1 },
  { id: 'ge-2', key: 'genres_3', name: 'Genre Sampler', description: 'Read 3 different genres', category: 'genre_explorer', type: 'unique_genres', stars: 1, icon: 'compass', threshold: 3 },
  { id: 'ge-3', key: 'genres_5', name: 'Genre Explorer', description: 'Read 5 different genres', category: 'genre_explorer', type: 'unique_genres', stars: 1, icon: 'compass', threshold: 5 },
  { id: 'ge-4', key: 'genres_10', name: 'Genre Collector', description: 'Read 10 different genres', category: 'genre_explorer', type: 'unique_genres', stars: 2, icon: 'compass', threshold: 10 },
  { id: 'ge-5', key: 'genres_15', name: 'Genre Master', description: 'Read 15 different genres', category: 'genre_explorer', type: 'unique_genres', stars: 3, icon: 'compass', threshold: 15 },
  { id: 'ge-6', key: 'genres_20', name: 'Genre Expert', description: 'Read 20 different genres', category: 'genre_explorer', type: 'unique_genres', stars: 4, icon: 'trophy', threshold: 20 },
  { id: 'ge-7', key: 'genres_25', name: 'Omnireader', description: 'Read 25+ different genres', category: 'genre_explorer', type: 'unique_genres', stars: 5, icon: 'crown', threshold: 25 },
  { id: 'ge-8', key: 'superhero_25', name: 'Superhero Fan I', description: 'Read 25 superhero comics', category: 'genre_explorer', type: 'genre_specific', stars: 2, icon: 'zap', threshold: 25, metadata: { genre: 'superhero' } },
  { id: 'ge-9', key: 'superhero_100', name: 'Superhero Fan II', description: 'Read 100 superhero comics', category: 'genre_explorer', type: 'genre_specific', stars: 3, icon: 'zap', threshold: 100, metadata: { genre: 'superhero' } },
  { id: 'ge-10', key: 'superhero_500', name: 'Superhero Fan III', description: 'Read 500 superhero comics', category: 'genre_explorer', type: 'genre_specific', stars: 4, icon: 'zap', threshold: 500, metadata: { genre: 'superhero' } },
  { id: 'ge-11', key: 'horror_10', name: 'Horror Enthusiast I', description: 'Read 10 horror comics', category: 'genre_explorer', type: 'genre_specific', stars: 2, icon: 'skull', threshold: 10, metadata: { genre: 'horror' } },
  { id: 'ge-12', key: 'horror_50', name: 'Horror Enthusiast II', description: 'Read 50 horror comics', category: 'genre_explorer', type: 'genre_specific', stars: 3, icon: 'skull', threshold: 50, metadata: { genre: 'horror' } },
  { id: 'ge-13', key: 'horror_200', name: 'Horror Master', description: 'Read 200 horror comics', category: 'genre_explorer', type: 'genre_specific', stars: 4, icon: 'skull', threshold: 200, metadata: { genre: 'horror' } },
  { id: 'ge-14', key: 'scifi_10', name: 'Sci-Fi Reader I', description: 'Read 10 sci-fi comics', category: 'genre_explorer', type: 'genre_specific', stars: 2, icon: 'rocket', threshold: 10, metadata: { genre: 'sci-fi' } },
  { id: 'ge-15', key: 'scifi_50', name: 'Sci-Fi Reader II', description: 'Read 50 sci-fi comics', category: 'genre_explorer', type: 'genre_specific', stars: 3, icon: 'rocket', threshold: 50, metadata: { genre: 'sci-fi' } },
  { id: 'ge-16', key: 'scifi_200', name: 'Sci-Fi Master', description: 'Read 200 sci-fi comics', category: 'genre_explorer', type: 'genre_specific', stars: 4, icon: 'rocket', threshold: 200, metadata: { genre: 'sci-fi' } },
  { id: 'ge-17', key: 'fantasy_10', name: 'Fantasy Fan I', description: 'Read 10 fantasy comics', category: 'genre_explorer', type: 'genre_specific', stars: 2, icon: 'wand', threshold: 10, metadata: { genre: 'fantasy' } },
  { id: 'ge-18', key: 'fantasy_50', name: 'Fantasy Fan II', description: 'Read 50 fantasy comics', category: 'genre_explorer', type: 'genre_specific', stars: 3, icon: 'wand', threshold: 50, metadata: { genre: 'fantasy' } },
  { id: 'ge-19', key: 'fantasy_200', name: 'Fantasy Master', description: 'Read 200 fantasy comics', category: 'genre_explorer', type: 'genre_specific', stars: 4, icon: 'wand', threshold: 200, metadata: { genre: 'fantasy' } },
  { id: 'ge-20', key: 'crime_10', name: 'Crime Reader I', description: 'Read 10 crime/noir comics', category: 'genre_explorer', type: 'genre_specific', stars: 2, icon: 'briefcase', threshold: 10, metadata: { genre: 'crime' } },
  { id: 'ge-21', key: 'crime_50', name: 'Crime Reader II', description: 'Read 50 crime/noir comics', category: 'genre_explorer', type: 'genre_specific', stars: 3, icon: 'briefcase', threshold: 50, metadata: { genre: 'crime' } },
  { id: 'ge-22', key: 'crime_200', name: 'Crime Master', description: 'Read 200 crime/noir comics', category: 'genre_explorer', type: 'genre_specific', stars: 4, icon: 'briefcase', threshold: 200, metadata: { genre: 'crime' } },
  { id: 'ge-23', key: 'comedy_10', name: 'Comedy Fan I', description: 'Read 10 comedy comics', category: 'genre_explorer', type: 'genre_specific', stars: 2, icon: 'smile', threshold: 10, metadata: { genre: 'comedy' } },
  { id: 'ge-24', key: 'comedy_50', name: 'Comedy Fan II', description: 'Read 50 comedy comics', category: 'genre_explorer', type: 'genre_specific', stars: 3, icon: 'smile', threshold: 50, metadata: { genre: 'comedy' } },
  { id: 'ge-25', key: 'comedy_200', name: 'Comedy Master', description: 'Read 200 comedy comics', category: 'genre_explorer', type: 'genre_specific', stars: 4, icon: 'smile', threshold: 200, metadata: { genre: 'comedy' } },
  { id: 'ge-26', key: 'romance_10', name: 'Romance Reader I', description: 'Read 10 romance comics', category: 'genre_explorer', type: 'genre_specific', stars: 2, icon: 'heart', threshold: 10, metadata: { genre: 'romance' } },
  { id: 'ge-27', key: 'romance_50', name: 'Romance Reader II', description: 'Read 50 romance comics', category: 'genre_explorer', type: 'genre_specific', stars: 3, icon: 'heart', threshold: 50, metadata: { genre: 'romance' } },
  { id: 'ge-28', key: 'romance_200', name: 'Romance Master', description: 'Read 200 romance comics', category: 'genre_explorer', type: 'genre_specific', stars: 4, icon: 'heart', threshold: 200, metadata: { genre: 'romance' } },
  { id: 'ge-29', key: 'genre_jumper', name: 'Genre Jumper', description: 'Read 5 different genres in one week', category: 'genre_explorer', type: 'unique_genres', stars: 3, icon: 'shuffle', threshold: 5, metadata: { timeframe: 'week' } },
  { id: 'ge-30', key: 'genre_hopper', name: 'Genre Hopper', description: 'Read 10 different genres in one month', category: 'genre_explorer', type: 'unique_genres', stars: 4, icon: 'shuffle', threshold: 10, metadata: { timeframe: 'month' } },
];
// =============================================================================
// Category 8: CHARACTER COLLECTOR (30 achievements)
// =============================================================================

export const CHARACTER_ACHIEVEMENTS: Achievement[] = [
  { id: 'ch-1', key: 'first_character', name: 'First Character', description: 'Read a comic with a tagged character', category: 'character_collector', type: 'unique_characters', stars: 1, icon: 'user', threshold: 1 },
  { id: 'ch-2', key: 'characters_5', name: 'Five Characters', description: 'Read comics featuring 5 different characters', category: 'character_collector', type: 'unique_characters', stars: 1, icon: 'user', threshold: 5 },
  { id: 'ch-3', key: 'characters_10', name: 'Ten Characters', description: 'Read comics featuring 10 different characters', category: 'character_collector', type: 'unique_characters', stars: 1, icon: 'user', threshold: 10 },
  { id: 'ch-4', key: 'characters_25', name: 'Character Explorer', description: 'Read comics featuring 25 different characters', category: 'character_collector', type: 'unique_characters', stars: 2, icon: 'users', threshold: 25 },
  { id: 'ch-5', key: 'characters_50', name: 'Character Collector', description: 'Read comics featuring 50 different characters', category: 'character_collector', type: 'unique_characters', stars: 2, icon: 'users', threshold: 50 },
  { id: 'ch-6', key: 'characters_100', name: 'Character Enthusiast', description: 'Read comics featuring 100 different characters', category: 'character_collector', type: 'unique_characters', stars: 3, icon: 'users', threshold: 100 },
  { id: 'ch-7', key: 'characters_200', name: 'Character Expert', description: 'Read comics featuring 200 different characters', category: 'character_collector', type: 'unique_characters', stars: 3, icon: 'users', threshold: 200 },
  { id: 'ch-8', key: 'characters_500', name: 'Character Master', description: 'Read comics featuring 500 different characters', category: 'character_collector', type: 'unique_characters', stars: 4, icon: 'trophy', threshold: 500 },
  { id: 'ch-9', key: 'characters_1000', name: 'Character Encyclopedia', description: 'Read comics featuring 1,000 different characters', category: 'character_collector', type: 'unique_characters', stars: 5, icon: 'crown', threshold: 1000 },
  { id: 'ch-10', key: 'same_character_10', name: 'Character Fan I', description: 'Read 10 comics featuring the same character', category: 'character_collector', type: 'same_character', stars: 2, icon: 'heart', threshold: 10 },
  { id: 'ch-11', key: 'same_character_25', name: 'Character Fan II', description: 'Read 25 comics featuring the same character', category: 'character_collector', type: 'same_character', stars: 2, icon: 'heart', threshold: 25 },
  { id: 'ch-12', key: 'same_character_50', name: 'Character Fan III', description: 'Read 50 comics featuring the same character', category: 'character_collector', type: 'same_character', stars: 3, icon: 'heart', threshold: 50 },
  { id: 'ch-13', key: 'same_character_100', name: 'Character Devotee', description: 'Read 100 comics featuring the same character', category: 'character_collector', type: 'same_character', stars: 3, icon: 'heart', threshold: 100 },
  { id: 'ch-14', key: 'same_character_250', name: 'Character Superfan', description: 'Read 250 comics featuring the same character', category: 'character_collector', type: 'same_character', stars: 4, icon: 'trophy', threshold: 250 },
  { id: 'ch-15', key: 'same_character_500', name: 'Character Obsessed', description: 'Read 500 comics featuring the same character', category: 'character_collector', type: 'same_character', stars: 5, icon: 'crown', threshold: 500 },
  { id: 'ch-16', key: 'first_appearance', name: 'First Appearance', description: "Read a character's first appearance", category: 'character_collector', type: 'same_character', stars: 2, icon: 'star', threshold: 1 },
  { id: 'ch-17', key: 'origin_hunter_10', name: 'Origin Hunter', description: "Read 10 characters' first appearances", category: 'character_collector', type: 'same_character', stars: 3, icon: 'star', threshold: 10 },
  { id: 'ch-18', key: 'origin_collector', name: 'Origin Collector', description: "Read 50 characters' first appearances", category: 'character_collector', type: 'same_character', stars: 4, icon: 'star', threshold: 50 },
  { id: 'ch-19', key: 'team_up', name: 'Team-Up', description: 'Read a comic with 2+ main characters', category: 'character_collector', type: 'same_character', stars: 2, icon: 'users', threshold: 1 },
  { id: 'ch-20', key: 'ensemble_cast_25', name: 'Ensemble Cast', description: 'Read 25 comics with 5+ characters', category: 'character_collector', type: 'same_character', stars: 3, icon: 'users', threshold: 25 },
  { id: 'ch-21', key: 'cast_of_thousands', name: 'Cast of Thousands', description: 'Read 100 comics with 5+ characters', category: 'character_collector', type: 'same_character', stars: 4, icon: 'users', threshold: 100 },
  { id: 'ch-22', key: 'villain_spotlight', name: 'Villain Spotlight', description: 'Read a comic featuring a villain', category: 'character_collector', type: 'same_character', stars: 1, icon: 'skull', threshold: 1 },
  { id: 'ch-23', key: 'villain_gallery_10', name: 'Villain Gallery I', description: 'Read comics featuring 10 different villains', category: 'character_collector', type: 'unique_characters', stars: 2, icon: 'skull', threshold: 10 },
  { id: 'ch-24', key: 'villain_gallery_50', name: 'Villain Gallery II', description: 'Read comics featuring 50 different villains', category: 'character_collector', type: 'unique_characters', stars: 3, icon: 'skull', threshold: 50 },
  { id: 'ch-25', key: 'villain_expert', name: 'Villain Expert', description: 'Read comics featuring 200 different villains', category: 'character_collector', type: 'unique_characters', stars: 4, icon: 'skull', threshold: 200 },
  { id: 'ch-26', key: 'hero_journey_25', name: 'Hero Journey I', description: 'Read 25 comics featuring heroes', category: 'character_collector', type: 'same_character', stars: 2, icon: 'shield', threshold: 25 },
  { id: 'ch-27', key: 'hero_journey_100', name: 'Hero Journey II', description: 'Read 100 comics featuring heroes', category: 'character_collector', type: 'same_character', stars: 3, icon: 'shield', threshold: 100 },
  { id: 'ch-28', key: 'hero_master', name: 'Hero Master', description: 'Read 500 comics featuring heroes', category: 'character_collector', type: 'same_character', stars: 4, icon: 'shield', threshold: 500 },
  { id: 'ch-29', key: 'crossover_reader', name: 'Crossover Reader', description: 'Read 10 crossover events', category: 'character_collector', type: 'events_completed', stars: 3, icon: 'git-merge', threshold: 10 },
  { id: 'ch-30', key: 'event_expert', name: 'Event Expert', description: 'Read 50 crossover events', category: 'character_collector', type: 'events_completed', stars: 4, icon: 'git-merge', threshold: 50 },
];
// =============================================================================
// Category 9: PUBLISHER CHAMPION (25 achievements)
// =============================================================================

export const PUBLISHER_ACHIEVEMENTS: Achievement[] = [
  { id: 'pu-1', key: 'first_publisher', name: 'First Publisher', description: 'Read a comic from any publisher', category: 'publisher_champion', type: 'unique_publishers', stars: 1, icon: 'building', threshold: 1 },
  { id: 'pu-2', key: 'publishers_3', name: 'Publisher Sampler', description: 'Read from 3 different publishers', category: 'publisher_champion', type: 'unique_publishers', stars: 1, icon: 'building', threshold: 3 },
  { id: 'pu-3', key: 'publishers_5', name: 'Publisher Explorer', description: 'Read from 5 different publishers', category: 'publisher_champion', type: 'unique_publishers', stars: 2, icon: 'building', threshold: 5 },
  { id: 'pu-4', key: 'publishers_10', name: 'Publisher Collector', description: 'Read from 10 different publishers', category: 'publisher_champion', type: 'unique_publishers', stars: 2, icon: 'building', threshold: 10 },
  { id: 'pu-5', key: 'publishers_20', name: 'Publisher Enthusiast', description: 'Read from 20 different publishers', category: 'publisher_champion', type: 'unique_publishers', stars: 3, icon: 'building', threshold: 20 },
  { id: 'pu-6', key: 'publishers_50', name: 'Publisher Expert', description: 'Read from 50 different publishers', category: 'publisher_champion', type: 'unique_publishers', stars: 4, icon: 'trophy', threshold: 50 },
  { id: 'pu-7', key: 'publishers_100', name: 'Publisher Master', description: 'Read from 100+ different publishers', category: 'publisher_champion', type: 'unique_publishers', stars: 5, icon: 'crown', threshold: 100 },
  { id: 'pu-8', key: 'marvel_25', name: 'Marvel Fan I', description: 'Read 25 Marvel comics', category: 'publisher_champion', type: 'publisher_specific', stars: 2, icon: 'zap', threshold: 25, metadata: { publisher: 'Marvel' } },
  { id: 'pu-9', key: 'marvel_100', name: 'Marvel Fan II', description: 'Read 100 Marvel comics', category: 'publisher_champion', type: 'publisher_specific', stars: 3, icon: 'zap', threshold: 100, metadata: { publisher: 'Marvel' } },
  { id: 'pu-10', key: 'marvel_500', name: 'Marvel Fan III', description: 'Read 500 Marvel comics', category: 'publisher_champion', type: 'publisher_specific', stars: 4, icon: 'zap', threshold: 500, metadata: { publisher: 'Marvel' } },
  { id: 'pu-11', key: 'marvel_1000', name: 'True Believer', description: 'Read 1,000 Marvel comics', category: 'publisher_champion', type: 'publisher_specific', stars: 5, icon: 'crown', threshold: 1000, metadata: { publisher: 'Marvel' } },
  { id: 'pu-12', key: 'dc_25', name: 'DC Fan I', description: 'Read 25 DC comics', category: 'publisher_champion', type: 'publisher_specific', stars: 2, icon: 'shield', threshold: 25, metadata: { publisher: 'DC' } },
  { id: 'pu-13', key: 'dc_100', name: 'DC Fan II', description: 'Read 100 DC comics', category: 'publisher_champion', type: 'publisher_specific', stars: 3, icon: 'shield', threshold: 100, metadata: { publisher: 'DC' } },
  { id: 'pu-14', key: 'dc_500', name: 'DC Fan III', description: 'Read 500 DC comics', category: 'publisher_champion', type: 'publisher_specific', stars: 4, icon: 'shield', threshold: 500, metadata: { publisher: 'DC' } },
  { id: 'pu-15', key: 'dc_1000', name: 'DC Devotee', description: 'Read 1,000 DC comics', category: 'publisher_champion', type: 'publisher_specific', stars: 5, icon: 'crown', threshold: 1000, metadata: { publisher: 'DC' } },
  { id: 'pu-16', key: 'image_25', name: 'Image Fan I', description: 'Read 25 Image comics', category: 'publisher_champion', type: 'publisher_specific', stars: 2, icon: 'image', threshold: 25, metadata: { publisher: 'Image' } },
  { id: 'pu-17', key: 'image_100', name: 'Image Fan II', description: 'Read 100 Image comics', category: 'publisher_champion', type: 'publisher_specific', stars: 3, icon: 'image', threshold: 100, metadata: { publisher: 'Image' } },
  { id: 'pu-18', key: 'image_500', name: 'Image Fan III', description: 'Read 500 Image comics', category: 'publisher_champion', type: 'publisher_specific', stars: 4, icon: 'image', threshold: 500, metadata: { publisher: 'Image' } },
  { id: 'pu-19', key: 'indie_10', name: 'Indie Explorer', description: 'Read 10 indie publisher comics', category: 'publisher_champion', type: 'publisher_specific', stars: 2, icon: 'star', threshold: 10, metadata: { publisher: 'indie' } },
  { id: 'pu-20', key: 'indie_50', name: 'Indie Collector', description: 'Read 50 indie publisher comics', category: 'publisher_champion', type: 'publisher_specific', stars: 3, icon: 'star', threshold: 50, metadata: { publisher: 'indie' } },
  { id: 'pu-21', key: 'indie_200', name: 'Indie Master', description: 'Read 200 indie publisher comics', category: 'publisher_champion', type: 'publisher_specific', stars: 4, icon: 'star', threshold: 200, metadata: { publisher: 'indie' } },
  { id: 'pu-22', key: 'dark_horse_25', name: 'Dark Horse Fan', description: 'Read 25 Dark Horse comics', category: 'publisher_champion', type: 'publisher_specific', stars: 2, icon: 'horse', threshold: 25, metadata: { publisher: 'Dark Horse' } },
  { id: 'pu-23', key: 'valiant_25', name: 'Valiant Fan', description: 'Read 25 Valiant comics', category: 'publisher_champion', type: 'publisher_specific', stars: 3, icon: 'sword', threshold: 25, metadata: { publisher: 'Valiant' } },
  { id: 'pu-24', key: 'idw_25', name: 'IDW Explorer', description: 'Read 25 IDW comics', category: 'publisher_champion', type: 'publisher_specific', stars: 3, icon: 'layers', threshold: 25, metadata: { publisher: 'IDW' } },
  { id: 'pu-25', key: 'big_two_balance', name: 'Big Two Balance', description: 'Read 100+ from both Marvel and DC', category: 'publisher_champion', type: 'publisher_specific', stars: 4, icon: 'scale', threshold: 100 },
];
// =============================================================================
// Category 10: SERIES COMPLETIONIST (25 achievements)
// =============================================================================

export const SERIES_ACHIEVEMENTS: Achievement[] = [
  { id: 'se-1', key: 'first_series', name: 'First Series', description: 'Complete your first series', category: 'series_completionist', type: 'series_completed', stars: 1, icon: 'layers', threshold: 1 },
  { id: 'se-2', key: 'series_3', name: 'Series Sampler', description: 'Complete 3 series', category: 'series_completionist', type: 'series_completed', stars: 1, icon: 'layers', threshold: 3 },
  { id: 'se-3', key: 'series_5', name: 'Series Collector', description: 'Complete 5 series', category: 'series_completionist', type: 'series_completed', stars: 1, icon: 'layers', threshold: 5 },
  { id: 'se-4', key: 'series_10', name: 'Series Enthusiast', description: 'Complete 10 series', category: 'series_completionist', type: 'series_completed', stars: 2, icon: 'layers', threshold: 10 },
  { id: 'se-5', key: 'series_25', name: 'Series Devotee', description: 'Complete 25 series', category: 'series_completionist', type: 'series_completed', stars: 2, icon: 'layers', threshold: 25 },
  { id: 'se-6', key: 'series_50', name: 'Series Expert', description: 'Complete 50 series', category: 'series_completionist', type: 'series_completed', stars: 3, icon: 'award', threshold: 50 },
  { id: 'se-7', key: 'series_100', name: 'Series Master', description: 'Complete 100 series', category: 'series_completionist', type: 'series_completed', stars: 3, icon: 'award', threshold: 100 },
  { id: 'se-8', key: 'series_250', name: 'Series Champion', description: 'Complete 250 series', category: 'series_completionist', type: 'series_completed', stars: 4, icon: 'trophy', threshold: 250 },
  { id: 'se-9', key: 'series_500', name: 'Series Legend', description: 'Complete 500 series', category: 'series_completionist', type: 'series_completed', stars: 5, icon: 'crown', threshold: 500 },
  { id: 'se-10', key: 'series_1000', name: 'Ultimate Completionist', description: 'Complete 1,000 series', category: 'series_completionist', type: 'series_completed', stars: 5, icon: 'crown', threshold: 1000 },
  { id: 'se-11', key: 'mini_series', name: 'Mini Series', description: 'Complete a series with 1-6 issues', category: 'series_completionist', type: 'series_completed', stars: 2, icon: 'file', threshold: 1, metadata: { issueRange: '1-6' } },
  { id: 'se-12', key: 'limited_series', name: 'Limited Series', description: 'Complete a series with 7-12 issues', category: 'series_completionist', type: 'series_completed', stars: 2, icon: 'file-text', threshold: 1, metadata: { issueRange: '7-12' } },
  { id: 'se-13', key: 'maxi_series', name: 'Maxi Series', description: 'Complete a series with 13-24 issues', category: 'series_completionist', type: 'series_completed', stars: 3, icon: 'files', threshold: 1, metadata: { issueRange: '13-24' } },
  { id: 'se-14', key: 'long_runner', name: 'Long Runner', description: 'Complete a series with 25-50 issues', category: 'series_completionist', type: 'series_completed', stars: 4, icon: 'archive', threshold: 1, metadata: { issueRange: '25-50' } },
  { id: 'se-15', key: 'epic_run', name: 'Epic Run', description: 'Complete a series with 51-100 issues', category: 'series_completionist', type: 'series_completed', stars: 4, icon: 'archive', threshold: 1, metadata: { issueRange: '51-100' } },
  { id: 'se-16', key: 'legendary_run', name: 'Legendary Run', description: 'Complete a series with 100+ issues', category: 'series_completionist', type: 'series_completed', stars: 5, icon: 'crown', threshold: 1, metadata: { issueRange: '100+' } },
  { id: 'se-17', key: 'speed_completion', name: 'Speed Completion', description: 'Complete a series in one day', category: 'series_completionist', type: 'series_completed', stars: 2, icon: 'zap', threshold: 1, metadata: { timeframe: 'day' } },
  { id: 'se-18', key: 'week_completion', name: 'Week Completion', description: 'Complete a series in one week', category: 'series_completionist', type: 'series_completed', stars: 3, icon: 'calendar', threshold: 1, metadata: { timeframe: 'week' } },
  { id: 'se-19', key: 'series_starter_10', name: 'Series Starter', description: 'Start 10 different series', category: 'series_completionist', type: 'series_started', stars: 2, icon: 'play', threshold: 10 },
  { id: 'se-20', key: 'series_explorer_50', name: 'Series Explorer', description: 'Start 50 different series', category: 'series_completionist', type: 'series_started', stars: 3, icon: 'play', threshold: 50 },
  { id: 'se-21', key: 'series_adventurer', name: 'Series Adventurer', description: 'Start 200 different series', category: 'series_completionist', type: 'series_started', stars: 4, icon: 'play', threshold: 200 },
  { id: 'se-22', key: 'back_to_back', name: 'Back to Back', description: 'Complete 2 series in one day', category: 'series_completionist', type: 'series_completed', stars: 2, icon: 'zap', threshold: 2, metadata: { timeframe: 'day' } },
  { id: 'se-23', key: 'triple_threat', name: 'Triple Threat', description: 'Complete 3 series in one day', category: 'series_completionist', type: 'series_completed', stars: 3, icon: 'zap', threshold: 3, metadata: { timeframe: 'day' } },
  { id: 'se-24', key: 'series_binge', name: 'Series Binge', description: 'Complete 5 series in one week', category: 'series_completionist', type: 'series_completed', stars: 4, icon: 'fast-forward', threshold: 5, metadata: { timeframe: 'week' } },
  { id: 'se-25', key: 'completion_machine', name: 'Completion Machine', description: 'Complete 10 series in one month', category: 'series_completionist', type: 'series_completed', stars: 5, icon: 'fast-forward', threshold: 10, metadata: { timeframe: 'month' } },
];
// =============================================================================
// Category 11: COLLECTION SIZE (20 achievements)
// =============================================================================

export const COLLECTION_SIZE_ACHIEVEMENTS: Achievement[] = [
  { id: 'cs-1', key: 'owned_1', name: 'First Comic', description: 'Add your first comic to the library', category: 'collection_size', type: 'collection_owned', stars: 1, icon: 'plus', threshold: 1 },
  { id: 'cs-2', key: 'owned_10', name: 'Starter Collection', description: 'Own 10 comics', category: 'collection_size', type: 'collection_owned', stars: 1, icon: 'archive', threshold: 10 },
  { id: 'cs-3', key: 'owned_25', name: 'Growing Collection', description: 'Own 25 comics', category: 'collection_size', type: 'collection_owned', stars: 1, icon: 'archive', threshold: 25 },
  { id: 'cs-4', key: 'owned_50', name: 'Collector', description: 'Own 50 comics', category: 'collection_size', type: 'collection_owned', stars: 1, icon: 'archive', threshold: 50 },
  { id: 'cs-5', key: 'owned_100', name: 'Century Collection', description: 'Own 100 comics', category: 'collection_size', type: 'collection_owned', stars: 2, icon: 'archive', threshold: 100 },
  { id: 'cs-6', key: 'owned_250', name: 'Serious Collector', description: 'Own 250 comics', category: 'collection_size', type: 'collection_owned', stars: 2, icon: 'archive', threshold: 250 },
  { id: 'cs-7', key: 'owned_500', name: 'Major Collection', description: 'Own 500 comics', category: 'collection_size', type: 'collection_owned', stars: 3, icon: 'library', threshold: 500 },
  { id: 'cs-8', key: 'owned_1000', name: 'Impressive Library', description: 'Own 1,000 comics', category: 'collection_size', type: 'collection_owned', stars: 3, icon: 'library', threshold: 1000 },
  { id: 'cs-9', key: 'owned_2500', name: 'Massive Collection', description: 'Own 2,500 comics', category: 'collection_size', type: 'collection_owned', stars: 4, icon: 'database', threshold: 2500 },
  { id: 'cs-10', key: 'owned_5000', name: 'Epic Library', description: 'Own 5,000 comics', category: 'collection_size', type: 'collection_owned', stars: 4, icon: 'database', threshold: 5000 },
  { id: 'cs-11', key: 'owned_10000', name: 'Ten Thousand', description: 'Own 10,000 comics', category: 'collection_size', type: 'collection_owned', stars: 5, icon: 'crown', threshold: 10000 },
  { id: 'cs-12', key: 'owned_25000', name: 'Master Collector', description: 'Own 25,000 comics', category: 'collection_size', type: 'collection_owned', stars: 5, icon: 'crown', threshold: 25000 },
  { id: 'cs-13', key: 'owned_50000', name: 'Ultimate Library', description: 'Own 50,000 comics', category: 'collection_size', type: 'collection_owned', stars: 5, icon: 'crown', threshold: 50000 },
  { id: 'cs-14', key: 'own_complete_series', name: 'First Complete Series', description: 'Own a complete series', category: 'collection_size', type: 'collection_owned', stars: 2, icon: 'check-circle', threshold: 1 },
  { id: 'cs-15', key: 'own_complete_series_10', name: 'Series Collector', description: 'Own 10 complete series', category: 'collection_size', type: 'collection_owned', stars: 3, icon: 'check-circle', threshold: 10 },
  { id: 'cs-16', key: 'own_complete_series_50', name: 'Series Hoarder', description: 'Own 50 complete series', category: 'collection_size', type: 'collection_owned', stars: 4, icon: 'check-circle', threshold: 50 },
  { id: 'cs-17', key: 'multi_library', name: 'Multi-Library', description: 'Create 2+ libraries', category: 'collection_size', type: 'collection_owned', stars: 2, icon: 'folder-plus', threshold: 2 },
  { id: 'cs-18', key: 'library_organizer', name: 'Library Organizer', description: 'Create 5+ libraries', category: 'collection_size', type: 'collection_owned', stars: 3, icon: 'folder-plus', threshold: 5 },
  { id: 'cs-19', key: 'metadata_master', name: 'Metadata Master', description: 'Have 50% of comics with complete metadata', category: 'collection_size', type: 'collection_owned', stars: 3, icon: 'info', threshold: 50 },
  { id: 'cs-20', key: 'perfectly_organized', name: 'Perfectly Organized', description: 'Have 90% of comics with complete metadata', category: 'collection_size', type: 'collection_owned', stars: 4, icon: 'info', threshold: 90 },
];

// =============================================================================
// Category 12: TEAM PLAYER (20 achievements)
// =============================================================================

export const TEAM_ACHIEVEMENTS: Achievement[] = [
  { id: 'tp-1', key: 'first_team', name: 'First Team', description: 'Read a comic featuring a team', category: 'team_player', type: 'unique_teams', stars: 1, icon: 'users', threshold: 1 },
  { id: 'tp-2', key: 'teams_3', name: 'Team Sampler', description: 'Read comics featuring 3 different teams', category: 'team_player', type: 'unique_teams', stars: 1, icon: 'users', threshold: 3 },
  { id: 'tp-3', key: 'teams_5', name: 'Team Explorer', description: 'Read comics featuring 5 different teams', category: 'team_player', type: 'unique_teams', stars: 2, icon: 'users', threshold: 5 },
  { id: 'tp-4', key: 'teams_10', name: 'Team Collector', description: 'Read comics featuring 10 different teams', category: 'team_player', type: 'unique_teams', stars: 2, icon: 'users', threshold: 10 },
  { id: 'tp-5', key: 'teams_25', name: 'Team Enthusiast', description: 'Read comics featuring 25 different teams', category: 'team_player', type: 'unique_teams', stars: 3, icon: 'users', threshold: 25 },
  { id: 'tp-6', key: 'teams_50', name: 'Team Expert', description: 'Read comics featuring 50 different teams', category: 'team_player', type: 'unique_teams', stars: 4, icon: 'trophy', threshold: 50 },
  { id: 'tp-7', key: 'teams_100', name: 'Team Master', description: 'Read comics featuring 100+ different teams', category: 'team_player', type: 'unique_teams', stars: 5, icon: 'crown', threshold: 100 },
  { id: 'tp-8', key: 'same_team_10', name: 'Team Fan I', description: 'Read 10 comics featuring the same team', category: 'team_player', type: 'same_team', stars: 2, icon: 'heart', threshold: 10 },
  { id: 'tp-9', key: 'same_team_25', name: 'Team Fan II', description: 'Read 25 comics featuring the same team', category: 'team_player', type: 'same_team', stars: 3, icon: 'heart', threshold: 25 },
  { id: 'tp-10', key: 'same_team_50', name: 'Team Fan III', description: 'Read 50 comics featuring the same team', category: 'team_player', type: 'same_team', stars: 3, icon: 'heart', threshold: 50 },
  { id: 'tp-11', key: 'same_team_100', name: 'Team Devotee', description: 'Read 100 comics featuring the same team', category: 'team_player', type: 'same_team', stars: 4, icon: 'trophy', threshold: 100 },
  { id: 'tp-12', key: 'same_team_250', name: 'Team Superfan', description: 'Read 250 comics featuring the same team', category: 'team_player', type: 'same_team', stars: 5, icon: 'crown', threshold: 250 },
  { id: 'tp-13', key: 'avengers_25', name: 'Avengers Fan', description: 'Read 25 Avengers comics', category: 'team_player', type: 'same_team', stars: 2, icon: 'shield', threshold: 25, metadata: { team: 'Avengers' } },
  { id: 'tp-14', key: 'avengers_100', name: 'Avengers Expert', description: 'Read 100 Avengers comics', category: 'team_player', type: 'same_team', stars: 3, icon: 'shield', threshold: 100, metadata: { team: 'Avengers' } },
  { id: 'tp-15', key: 'xmen_25', name: 'X-Men Fan', description: 'Read 25 X-Men comics', category: 'team_player', type: 'same_team', stars: 2, icon: 'x', threshold: 25, metadata: { team: 'X-Men' } },
  { id: 'tp-16', key: 'xmen_100', name: 'X-Men Expert', description: 'Read 100 X-Men comics', category: 'team_player', type: 'same_team', stars: 3, icon: 'x', threshold: 100, metadata: { team: 'X-Men' } },
  { id: 'tp-17', key: 'jl_25', name: 'Justice League Fan', description: 'Read 25 Justice League comics', category: 'team_player', type: 'same_team', stars: 2, icon: 'star', threshold: 25, metadata: { team: 'Justice League' } },
  { id: 'tp-18', key: 'jl_100', name: 'Justice League Expert', description: 'Read 100 Justice League comics', category: 'team_player', type: 'same_team', stars: 3, icon: 'star', threshold: 100, metadata: { team: 'Justice League' } },
  { id: 'tp-19', key: 'team_hopper', name: 'Team Hopper', description: 'Read 10 different teams in one month', category: 'team_player', type: 'unique_teams', stars: 3, icon: 'shuffle', threshold: 10, metadata: { timeframe: 'month' } },
  { id: 'tp-20', key: 'team_sampler_q', name: 'Team Sampler Pro', description: 'Read 25 different teams in 3 months', category: 'team_player', type: 'unique_teams', stars: 4, icon: 'shuffle', threshold: 25, metadata: { timeframe: 'quarter' } },
];

// =============================================================================
// Category 13: DECADE EXPLORER (25 achievements)
// =============================================================================

export const DECADE_ACHIEVEMENTS: Achievement[] = [
  { id: 'de-1', key: 'golden_age', name: 'Golden Age', description: 'Read a comic from the 1930s-1940s', category: 'decade_explorer', type: 'decade_specific', stars: 2, icon: 'clock', threshold: 1, metadata: { decades: '1930s-1940s' } },
  { id: 'de-2', key: 'silver_age', name: 'Silver Age', description: 'Read a comic from the 1950s-1960s', category: 'decade_explorer', type: 'decade_specific', stars: 2, icon: 'clock', threshold: 1, metadata: { decades: '1950s-1960s' } },
  { id: 'de-3', key: 'bronze_age', name: 'Bronze Age', description: 'Read a comic from the 1970s-1980s', category: 'decade_explorer', type: 'decade_specific', stars: 2, icon: 'clock', threshold: 1, metadata: { decades: '1970s-1980s' } },
  { id: 'de-4', key: 'modern_age', name: 'Modern Age', description: 'Read a comic from the 1990s-2000s', category: 'decade_explorer', type: 'decade_specific', stars: 1, icon: 'clock', threshold: 1, metadata: { decades: '1990s-2000s' } },
  { id: 'de-5', key: 'contemporary', name: 'Contemporary', description: 'Read a comic from the 2010s-2020s', category: 'decade_explorer', type: 'decade_specific', stars: 1, icon: 'clock', threshold: 1, metadata: { decades: '2010s-2020s' } },
  { id: 'de-6', key: 'age_explorer', name: 'Age Explorer', description: 'Read comics from all 5 comic ages', category: 'decade_explorer', type: 'unique_decades', stars: 3, icon: 'calendar', threshold: 5 },
  { id: 'de-7', key: 'decades_3', name: 'Decade Sampler', description: 'Read comics from 3 different decades', category: 'decade_explorer', type: 'unique_decades', stars: 2, icon: 'calendar', threshold: 3 },
  { id: 'de-8', key: 'decades_5', name: 'Decade Collector', description: 'Read comics from 5 different decades', category: 'decade_explorer', type: 'unique_decades', stars: 3, icon: 'calendar', threshold: 5 },
  { id: 'de-9', key: 'decades_7', name: 'Decade Master', description: 'Read comics from 7 different decades', category: 'decade_explorer', type: 'unique_decades', stars: 4, icon: 'calendar', threshold: 7 },
  { id: 'de-10', key: 'decades_9', name: 'Time Traveler', description: 'Read comics from 9+ different decades', category: 'decade_explorer', type: 'unique_decades', stars: 5, icon: 'crown', threshold: 9 },
  { id: 'de-11', key: '90s_25', name: '90s Kid', description: 'Read 25 comics from the 1990s', category: 'decade_explorer', type: 'decade_specific', stars: 2, icon: 'star', threshold: 25, metadata: { decade: '1990s' } },
  { id: 'de-12', key: '90s_100', name: '90s Nostalgia', description: 'Read 100 comics from the 1990s', category: 'decade_explorer', type: 'decade_specific', stars: 3, icon: 'star', threshold: 100, metadata: { decade: '1990s' } },
  { id: 'de-13', key: '80s_25', name: '80s Fan', description: 'Read 25 comics from the 1980s', category: 'decade_explorer', type: 'decade_specific', stars: 2, icon: 'star', threshold: 25, metadata: { decade: '1980s' } },
  { id: 'de-14', key: '80s_100', name: '80s Enthusiast', description: 'Read 100 comics from the 1980s', category: 'decade_explorer', type: 'decade_specific', stars: 3, icon: 'star', threshold: 100, metadata: { decade: '1980s' } },
  { id: 'de-15', key: '2000s_25', name: '2000s Reader', description: 'Read 25 comics from the 2000s', category: 'decade_explorer', type: 'decade_specific', stars: 2, icon: 'star', threshold: 25, metadata: { decade: '2000s' } },
  { id: 'de-16', key: '2000s_100', name: 'Millennium Reader', description: 'Read 100 comics from the 2000s', category: 'decade_explorer', type: 'decade_specific', stars: 3, icon: 'star', threshold: 100, metadata: { decade: '2000s' } },
  { id: 'de-17', key: '2010s_25', name: '2010s Reader', description: 'Read 25 comics from the 2010s', category: 'decade_explorer', type: 'decade_specific', stars: 2, icon: 'star', threshold: 25, metadata: { decade: '2010s' } },
  { id: 'de-18', key: '2010s_100', name: 'New Age Reader', description: 'Read 100 comics from the 2010s', category: 'decade_explorer', type: 'decade_specific', stars: 3, icon: 'star', threshold: 100, metadata: { decade: '2010s' } },
  { id: 'de-19', key: '2020s_25', name: '2020s Reader', description: 'Read 25 comics from the 2020s', category: 'decade_explorer', type: 'decade_specific', stars: 2, icon: 'star', threshold: 25, metadata: { decade: '2020s' } },
  { id: 'de-20', key: '2020s_100', name: 'Current Era', description: 'Read 100 comics from the 2020s', category: 'decade_explorer', type: 'decade_specific', stars: 3, icon: 'star', threshold: 100, metadata: { decade: '2020s' } },
  { id: 'de-21', key: 'vintage_100', name: 'Vintage Collector', description: 'Read 100 comics published before 1980', category: 'decade_explorer', type: 'decade_specific', stars: 3, icon: 'clock', threshold: 100, metadata: { before: 1980 } },
  { id: 'de-22', key: 'vintage_500', name: 'Vintage Expert', description: 'Read 500 comics published before 1980', category: 'decade_explorer', type: 'decade_specific', stars: 4, icon: 'clock', threshold: 500, metadata: { before: 1980 } },
  { id: 'de-23', key: 'new_releases_10', name: 'New Releases', description: 'Read 10 comics from current year', category: 'decade_explorer', type: 'decade_specific', stars: 2, icon: 'zap', threshold: 10, metadata: { year: 'current' } },
  { id: 'de-24', key: 'up_to_date_50', name: 'Up to Date', description: 'Read 50 comics from current year', category: 'decade_explorer', type: 'decade_specific', stars: 3, icon: 'zap', threshold: 50, metadata: { year: 'current' } },
  { id: 'de-25', key: 'release_day_100', name: 'Release Day Reader', description: 'Read 100 comics from current year', category: 'decade_explorer', type: 'decade_specific', stars: 4, icon: 'zap', threshold: 100, metadata: { year: 'current' } },
];
// =============================================================================
// Category 14: STORY ARC EXPLORER (15 achievements)
// =============================================================================

export const STORY_ARC_ACHIEVEMENTS: Achievement[] = [
  { id: 'sa-1', key: 'first_arc', name: 'First Arc', description: 'Complete a story arc', category: 'story_arc_explorer', type: 'arcs_completed', stars: 1, icon: 'git-branch', threshold: 1 },
  { id: 'sa-2', key: 'arcs_5', name: 'Arc Collector', description: 'Complete 5 story arcs', category: 'story_arc_explorer', type: 'arcs_completed', stars: 2, icon: 'git-branch', threshold: 5 },
  { id: 'sa-3', key: 'arcs_10', name: 'Arc Enthusiast', description: 'Complete 10 story arcs', category: 'story_arc_explorer', type: 'arcs_completed', stars: 2, icon: 'git-branch', threshold: 10 },
  { id: 'sa-4', key: 'arcs_25', name: 'Arc Expert', description: 'Complete 25 story arcs', category: 'story_arc_explorer', type: 'arcs_completed', stars: 3, icon: 'git-branch', threshold: 25 },
  { id: 'sa-5', key: 'arcs_50', name: 'Arc Master', description: 'Complete 50 story arcs', category: 'story_arc_explorer', type: 'arcs_completed', stars: 4, icon: 'trophy', threshold: 50 },
  { id: 'sa-6', key: 'arcs_100', name: 'Arc Legend', description: 'Complete 100 story arcs', category: 'story_arc_explorer', type: 'arcs_completed', stars: 5, icon: 'crown', threshold: 100 },
  { id: 'sa-7', key: 'event_reader', name: 'Event Reader', description: 'Read a major crossover event', category: 'story_arc_explorer', type: 'events_completed', stars: 2, icon: 'git-merge', threshold: 1 },
  { id: 'sa-8', key: 'events_5', name: 'Event Collector', description: 'Complete 5 crossover events', category: 'story_arc_explorer', type: 'events_completed', stars: 3, icon: 'git-merge', threshold: 5 },
  { id: 'sa-9', key: 'events_15', name: 'Event Expert', description: 'Complete 15 crossover events', category: 'story_arc_explorer', type: 'events_completed', stars: 4, icon: 'git-merge', threshold: 15 },
  { id: 'sa-10', key: 'events_30', name: 'Event Master', description: 'Complete 30 crossover events', category: 'story_arc_explorer', type: 'events_completed', stars: 5, icon: 'crown', threshold: 30 },
  { id: 'sa-11', key: 'multiverse_3', name: 'Multiverse Explorer', description: 'Read comics from 3 different universes', category: 'story_arc_explorer', type: 'events_completed', stars: 3, icon: 'globe', threshold: 3 },
  { id: 'sa-12', key: 'multiverse_10', name: 'Multiverse Traveler', description: 'Read comics from 10 different universes', category: 'story_arc_explorer', type: 'events_completed', stars: 4, icon: 'globe', threshold: 10 },
  { id: 'sa-13', key: 'arc_binge', name: 'Arc Binge', description: 'Complete a story arc in one sitting', category: 'story_arc_explorer', type: 'arcs_completed', stars: 2, icon: 'zap', threshold: 1 },
  { id: 'sa-14', key: 'event_binge', name: 'Event Binge', description: 'Complete a crossover event in one week', category: 'story_arc_explorer', type: 'events_completed', stars: 3, icon: 'zap', threshold: 1 },
  { id: 'sa-15', key: 'saga_complete', name: 'Saga Complete', description: 'Complete a multi-arc saga', category: 'story_arc_explorer', type: 'arcs_completed', stars: 4, icon: 'award', threshold: 1 },
];

// =============================================================================
// Category 15: FORMAT VARIETY (15 achievements)
// =============================================================================

export const FORMAT_ACHIEVEMENTS: Achievement[] = [
  { id: 'fo-1', key: 'single_issue', name: 'Single Issue', description: 'Read a single issue', category: 'format_variety', type: 'format_specific', stars: 1, icon: 'file', threshold: 1, metadata: { format: 'Issue' } },
  { id: 'fo-2', key: 'trade_paperback', name: 'Trade Paperback', description: 'Read a trade paperback', category: 'format_variety', type: 'format_specific', stars: 1, icon: 'book', threshold: 1, metadata: { format: 'TPB' } },
  { id: 'fo-3', key: 'graphic_novel', name: 'Graphic Novel', description: 'Read a graphic novel', category: 'format_variety', type: 'format_specific', stars: 2, icon: 'book-open', threshold: 1, metadata: { format: 'Graphic Novel' } },
  { id: 'fo-4', key: 'hardcover', name: 'Hardcover', description: 'Read a hardcover collection', category: 'format_variety', type: 'format_specific', stars: 2, icon: 'book', threshold: 1, metadata: { format: 'Hardcover' } },
  { id: 'fo-5', key: 'omnibus', name: 'Omnibus', description: 'Read an omnibus', category: 'format_variety', type: 'format_specific', stars: 3, icon: 'archive', threshold: 1, metadata: { format: 'Omnibus' } },
  { id: 'fo-6', key: 'format_explorer', name: 'Format Explorer', description: 'Read 3 different formats', category: 'format_variety', type: 'format_specific', stars: 2, icon: 'layers', threshold: 3 },
  { id: 'fo-7', key: 'format_collector', name: 'Format Collector', description: 'Read all format types', category: 'format_variety', type: 'format_specific', stars: 3, icon: 'layers', threshold: 5 },
  { id: 'fo-8', key: 'issues_100', name: 'Issue Collector I', description: 'Read 100 single issues', category: 'format_variety', type: 'format_specific', stars: 2, icon: 'files', threshold: 100, metadata: { format: 'Issue' } },
  { id: 'fo-9', key: 'issues_500', name: 'Issue Collector II', description: 'Read 500 single issues', category: 'format_variety', type: 'format_specific', stars: 3, icon: 'files', threshold: 500, metadata: { format: 'Issue' } },
  { id: 'fo-10', key: 'issues_1000', name: 'Issue Master', description: 'Read 1,000 single issues', category: 'format_variety', type: 'format_specific', stars: 4, icon: 'files', threshold: 1000, metadata: { format: 'Issue' } },
  { id: 'fo-11', key: 'trades_25', name: 'Trade Reader I', description: 'Read 25 trade paperbacks', category: 'format_variety', type: 'format_specific', stars: 2, icon: 'book', threshold: 25, metadata: { format: 'TPB' } },
  { id: 'fo-12', key: 'trades_100', name: 'Trade Reader II', description: 'Read 100 trade paperbacks', category: 'format_variety', type: 'format_specific', stars: 3, icon: 'book', threshold: 100, metadata: { format: 'TPB' } },
  { id: 'fo-13', key: 'omnibus_10', name: 'Omnibus Collector', description: 'Read 10 omnibuses', category: 'format_variety', type: 'format_specific', stars: 3, icon: 'archive', threshold: 10, metadata: { format: 'Omnibus' } },
  { id: 'fo-14', key: 'omnibus_50', name: 'Omnibus Expert', description: 'Read 50 omnibuses', category: 'format_variety', type: 'format_specific', stars: 4, icon: 'archive', threshold: 50, metadata: { format: 'Omnibus' } },
  { id: 'fo-15', key: 'omnibus_100', name: 'Omnibus Master', description: 'Read 100 omnibuses', category: 'format_variety', type: 'format_specific', stars: 5, icon: 'crown', threshold: 100, metadata: { format: 'Omnibus' } },
];

// =============================================================================
// Category 16: MANGA & INTERNATIONAL (20 achievements)
// =============================================================================

export const MANGA_INTERNATIONAL_ACHIEVEMENTS: Achievement[] = [
  { id: 'mi-1', key: 'first_manga', name: 'First Manga', description: 'Read your first manga', category: 'manga_international', type: 'manga_total', stars: 1, icon: 'book', threshold: 1 },
  { id: 'mi-2', key: 'manga_5', name: 'Manga Beginner', description: 'Read 5 manga volumes', category: 'manga_international', type: 'manga_total', stars: 1, icon: 'book', threshold: 5 },
  { id: 'mi-3', key: 'manga_25', name: 'Manga Reader', description: 'Read 25 manga volumes', category: 'manga_international', type: 'manga_total', stars: 2, icon: 'book', threshold: 25 },
  { id: 'mi-4', key: 'manga_100', name: 'Manga Enthusiast', description: 'Read 100 manga volumes', category: 'manga_international', type: 'manga_total', stars: 3, icon: 'book', threshold: 100 },
  { id: 'mi-5', key: 'manga_500', name: 'Manga Expert', description: 'Read 500 manga volumes', category: 'manga_international', type: 'manga_total', stars: 4, icon: 'trophy', threshold: 500 },
  { id: 'mi-6', key: 'manga_1000', name: 'Manga Master', description: 'Read 1,000 manga volumes', category: 'manga_international', type: 'manga_total', stars: 5, icon: 'crown', threshold: 1000 },
  { id: 'mi-7', key: 'shonen_25', name: 'Shonen Fan', description: 'Read 25 shonen manga', category: 'manga_international', type: 'manga_total', stars: 2, icon: 'zap', threshold: 25, metadata: { genre: 'shonen' } },
  { id: 'mi-8', key: 'shonen_100', name: 'Shonen Expert', description: 'Read 100 shonen manga', category: 'manga_international', type: 'manga_total', stars: 3, icon: 'zap', threshold: 100, metadata: { genre: 'shonen' } },
  { id: 'mi-9', key: 'seinen_25', name: 'Seinen Fan', description: 'Read 25 seinen manga', category: 'manga_international', type: 'manga_total', stars: 2, icon: 'moon', threshold: 25, metadata: { genre: 'seinen' } },
  { id: 'mi-10', key: 'seinen_100', name: 'Seinen Expert', description: 'Read 100 seinen manga', category: 'manga_international', type: 'manga_total', stars: 3, icon: 'moon', threshold: 100, metadata: { genre: 'seinen' } },
  { id: 'mi-11', key: 'shojo_25', name: 'Shojo Fan', description: 'Read 25 shojo manga', category: 'manga_international', type: 'manga_total', stars: 2, icon: 'heart', threshold: 25, metadata: { genre: 'shojo' } },
  { id: 'mi-12', key: 'shojo_100', name: 'Shojo Expert', description: 'Read 100 shojo manga', category: 'manga_international', type: 'manga_total', stars: 3, icon: 'heart', threshold: 100, metadata: { genre: 'shojo' } },
  { id: 'mi-13', key: 'international', name: 'International', description: 'Read a non-English comic', category: 'manga_international', type: 'unique_languages', stars: 1, icon: 'globe', threshold: 1 },
  { id: 'mi-14', key: 'languages_3', name: 'World Reader', description: 'Read comics in 3 different languages', category: 'manga_international', type: 'unique_languages', stars: 2, icon: 'globe', threshold: 3 },
  { id: 'mi-15', key: 'languages_5', name: 'Polyglot Reader', description: 'Read comics in 5 different languages', category: 'manga_international', type: 'unique_languages', stars: 3, icon: 'globe', threshold: 5 },
  { id: 'mi-16', key: 'languages_10', name: 'Global Reader', description: 'Read comics in 10 different languages', category: 'manga_international', type: 'unique_languages', stars: 4, icon: 'crown', threshold: 10 },
  { id: 'mi-17', key: 'euro_10', name: 'Euro Comics', description: 'Read 10 European comics', category: 'manga_international', type: 'manga_total', stars: 2, icon: 'map', threshold: 10, metadata: { region: 'europe' } },
  { id: 'mi-18', key: 'euro_50', name: 'Euro Expert', description: 'Read 50 European comics', category: 'manga_international', type: 'manga_total', stars: 3, icon: 'map', threshold: 50, metadata: { region: 'europe' } },
  { id: 'mi-19', key: 'manhwa_10', name: 'Manhwa Reader', description: 'Read 10 Korean manhwa', category: 'manga_international', type: 'manga_total', stars: 2, icon: 'flag', threshold: 10, metadata: { region: 'korea' } },
  { id: 'mi-20', key: 'manhua_10', name: 'Manhua Reader', description: 'Read 10 Chinese manhua', category: 'manga_international', type: 'manga_total', stars: 3, icon: 'flag', threshold: 10, metadata: { region: 'china' } },
];

// =============================================================================
// Category 17: BINGE READING (20 achievements)
// =============================================================================

export const BINGE_ACHIEVEMENTS: Achievement[] = [
  { id: 'bi-1', key: 'day_one', name: 'Day One', description: 'Read on any day', category: 'binge_reading', type: 'pages_day', stars: 1, icon: 'calendar', threshold: 1 },
  { id: 'bi-2', key: 'pages_day_10', name: 'Active Day', description: 'Read 10 pages in one day', category: 'binge_reading', type: 'pages_day', stars: 1, icon: 'book', threshold: 10 },
  { id: 'bi-3', key: 'pages_day_50', name: 'Productive Day', description: 'Read 50 pages in one day', category: 'binge_reading', type: 'pages_day', stars: 1, icon: 'book', threshold: 50 },
  { id: 'bi-4', key: 'pages_day_100', name: 'Big Day', description: 'Read 100 pages in one day', category: 'binge_reading', type: 'pages_day', stars: 2, icon: 'book', threshold: 100 },
  { id: 'bi-5', key: 'pages_day_200', name: 'Reading Day', description: 'Read 200 pages in one day', category: 'binge_reading', type: 'pages_day', stars: 2, icon: 'book', threshold: 200 },
  { id: 'bi-6', key: 'pages_day_500', name: 'Binge Day', description: 'Read 500 pages in one day', category: 'binge_reading', type: 'pages_day', stars: 3, icon: 'zap', threshold: 500 },
  { id: 'bi-7', key: 'pages_day_1000', name: 'Major Binge', description: 'Read 1,000 pages in one day', category: 'binge_reading', type: 'pages_day', stars: 3, icon: 'zap', threshold: 1000 },
  { id: 'bi-8', key: 'pages_day_2000', name: 'Epic Binge', description: 'Read 2,000 pages in one day', category: 'binge_reading', type: 'pages_day', stars: 4, icon: 'zap', threshold: 2000 },
  { id: 'bi-9', key: 'pages_day_5000', name: 'Legendary Binge', description: 'Read 5,000 pages in one day', category: 'binge_reading', type: 'pages_day', stars: 5, icon: 'crown', threshold: 5000 },
  { id: 'bi-10', key: 'time_day_1h', name: 'Hour Reader', description: 'Read for 1 hour in one day', category: 'binge_reading', type: 'time_day', stars: 1, icon: 'clock', threshold: 3600 },
  { id: 'bi-11', key: 'time_day_2h', name: 'Two Hour Block', description: 'Read for 2 hours in one day', category: 'binge_reading', type: 'time_day', stars: 2, icon: 'clock', threshold: 7200 },
  { id: 'bi-12', key: 'time_day_4h', name: 'Half Day', description: 'Read for 4 hours in one day', category: 'binge_reading', type: 'time_day', stars: 2, icon: 'clock', threshold: 14400 },
  { id: 'bi-13', key: 'time_day_8h', name: 'Day Reader', description: 'Read for 8 hours in one day', category: 'binge_reading', type: 'time_day', stars: 3, icon: 'clock', threshold: 28800 },
  { id: 'bi-14', key: 'time_day_12h', name: 'Dedicated Day', description: 'Read for 12 hours in one day', category: 'binge_reading', type: 'time_day', stars: 4, icon: 'zap', threshold: 43200 },
  { id: 'bi-15', key: 'time_day_16h', name: 'All Day Reader', description: 'Read for 16+ hours in one day', category: 'binge_reading', type: 'time_day', stars: 5, icon: 'crown', threshold: 57600 },
  { id: 'bi-16', key: 'comics_day_5', name: 'Comic Day', description: 'Complete 5 comics in one day', category: 'binge_reading', type: 'comics_day', stars: 2, icon: 'check', threshold: 5 },
  { id: 'bi-17', key: 'comics_day_10', name: 'Binge Completion', description: 'Complete 10 comics in one day', category: 'binge_reading', type: 'comics_day', stars: 3, icon: 'check', threshold: 10 },
  { id: 'bi-18', key: 'comics_day_25b', name: 'Power Day', description: 'Complete 25 comics in one day', category: 'binge_reading', type: 'comics_day', stars: 4, icon: 'zap', threshold: 25 },
  { id: 'bi-19', key: 'comics_day_50b', name: 'Monster Day', description: 'Complete 50 comics in one day', category: 'binge_reading', type: 'comics_day', stars: 5, icon: 'crown', threshold: 50 },
  { id: 'bi-20', key: 'series_day', name: 'Series Day', description: 'Complete an entire series in one day', category: 'binge_reading', type: 'series_completed', stars: 3, icon: 'layers', threshold: 1, metadata: { timeframe: 'day' } },
];
// =============================================================================
// Category 18: READING PACE (15 achievements)
// =============================================================================

export const PACE_ACHIEVEMENTS: Achievement[] = [
  { id: 'pa-1', key: 'pace_1ppm', name: 'Measured Pace', description: 'Maintain 1 page/minute average', category: 'reading_pace', type: 'reading_pace', stars: 1, icon: 'activity', threshold: 1 },
  { id: 'pa-2', key: 'pace_2ppm', name: 'Steady Reader', description: 'Maintain 2 pages/minute average', category: 'reading_pace', type: 'reading_pace', stars: 2, icon: 'activity', threshold: 2 },
  { id: 'pa-3', key: 'pace_3ppm', name: 'Quick Reader', description: 'Maintain 3 pages/minute average', category: 'reading_pace', type: 'reading_pace', stars: 3, icon: 'zap', threshold: 3 },
  { id: 'pa-4', key: 'pace_5ppm', name: 'Speed Reader', description: 'Maintain 5 pages/minute average', category: 'reading_pace', type: 'reading_pace', stars: 4, icon: 'zap', threshold: 5 },
  { id: 'pa-5', key: 'weekly_1mo', name: 'Consistent Reader', description: 'Read every week for a month', category: 'reading_pace', type: 'weekly_consistency', stars: 1, icon: 'calendar', threshold: 4 },
  { id: 'pa-6', key: 'weekly_3mo', name: 'Regular Reader', description: 'Read every week for 3 months', category: 'reading_pace', type: 'weekly_consistency', stars: 2, icon: 'calendar', threshold: 12 },
  { id: 'pa-7', key: 'weekly_6mo', name: 'Devoted Reader', description: 'Read every week for 6 months', category: 'reading_pace', type: 'weekly_consistency', stars: 3, icon: 'calendar', threshold: 26 },
  { id: 'pa-8', key: 'weekly_1yr', name: 'Year-Round Reader', description: 'Read every week for a year', category: 'reading_pace', type: 'weekly_consistency', stars: 4, icon: 'award', threshold: 52 },
  { id: 'pa-9', key: 'daily_avg_10', name: 'Daily Average I', description: 'Average 10 pages/day over a month', category: 'reading_pace', type: 'daily_average', stars: 2, icon: 'trending-up', threshold: 10 },
  { id: 'pa-10', key: 'daily_avg_25', name: 'Daily Average II', description: 'Average 25 pages/day over a month', category: 'reading_pace', type: 'daily_average', stars: 3, icon: 'trending-up', threshold: 25 },
  { id: 'pa-11', key: 'daily_avg_50', name: 'Daily Average III', description: 'Average 50 pages/day over a month', category: 'reading_pace', type: 'daily_average', stars: 4, icon: 'trending-up', threshold: 50 },
  { id: 'pa-12', key: 'daily_avg_100', name: 'Daily Average IV', description: 'Average 100 pages/day over a month', category: 'reading_pace', type: 'daily_average', stars: 5, icon: 'crown', threshold: 100 },
  { id: 'pa-13', key: 'session_consistency', name: 'Session Consistency', description: 'Have 10 sessions of similar length', category: 'reading_pace', type: 'session_consistency', stars: 2, icon: 'repeat', threshold: 10 },
  { id: 'pa-14', key: 'routine_7d', name: 'Routine Reader', description: 'Read at the same time for 7 days', category: 'reading_pace', type: 'routine_reading', stars: 3, icon: 'clock', threshold: 7 },
  { id: 'pa-15', key: 'routine_30d', name: 'Scheduled Reader', description: 'Read at the same time for 30 days', category: 'reading_pace', type: 'routine_reading', stars: 4, icon: 'clock', threshold: 30 },
];
// =============================================================================
// Category 19: DISCOVERY (20 achievements)
// =============================================================================

export const DISCOVERY_ACHIEVEMENTS: Achievement[] = [
  { id: 'di-1', key: 'first_discovery', name: 'First Discovery', description: 'Read your first comic', category: 'discovery', type: 'comics_total', stars: 1, icon: 'compass', threshold: 1 },
  { id: 'di-2', key: 'new_series', name: 'New Series', description: 'Start a new series', category: 'discovery', type: 'series_started', stars: 1, icon: 'plus-circle', threshold: 1 },
  { id: 'di-3', key: 'series_discoverer', name: 'Series Discoverer', description: 'Start 10 new series', category: 'discovery', type: 'series_started', stars: 2, icon: 'plus-circle', threshold: 10 },
  { id: 'di-4', key: 'series_explorer', name: 'Series Explorer', description: 'Start 50 new series', category: 'discovery', type: 'series_started', stars: 3, icon: 'compass', threshold: 50 },
  { id: 'di-5', key: 'series_hunter', name: 'Series Hunter', description: 'Start 200 new series', category: 'discovery', type: 'series_started', stars: 4, icon: 'target', threshold: 200 },
  { id: 'di-6', key: 'new_author', name: 'New Author', description: 'Read a new author', category: 'discovery', type: 'unique_writers', stars: 1, icon: 'user-plus', threshold: 1 },
  { id: 'di-7', key: 'author_explorer', name: 'Author Explorer', description: 'Read 25 new authors', category: 'discovery', type: 'unique_writers', stars: 2, icon: 'users', threshold: 25 },
  { id: 'di-8', key: 'author_hunter', name: 'Author Hunter', description: 'Read 100 new authors', category: 'discovery', type: 'unique_writers', stars: 3, icon: 'users', threshold: 100 },
  { id: 'di-9', key: 'author_collector', name: 'Author Collector', description: 'Read 500 new authors', category: 'discovery', type: 'unique_writers', stars: 4, icon: 'users', threshold: 500 },
  { id: 'di-10', key: 'new_genre', name: 'New Genre', description: 'Try a new genre', category: 'discovery', type: 'unique_genres', stars: 1, icon: 'shuffle', threshold: 1 },
  { id: 'di-11', key: 'genre_explorer', name: 'Genre Explorer', description: 'Try 5 new genres', category: 'discovery', type: 'unique_genres', stars: 2, icon: 'shuffle', threshold: 5 },
  { id: 'di-12', key: 'genre_hunter', name: 'Genre Hunter', description: 'Try 10 new genres', category: 'discovery', type: 'unique_genres', stars: 3, icon: 'shuffle', threshold: 10 },
  { id: 'di-13', key: 'hidden_gem', name: 'Hidden Gem', description: 'Read a comic with fewer than 1000 CV votes', category: 'discovery', type: 'hidden_gem', stars: 2, icon: 'gem', threshold: 1 },
  { id: 'di-14', key: 'gem_hunter', name: 'Gem Hunter', description: 'Find 10 hidden gems', category: 'discovery', type: 'hidden_gem', stars: 3, icon: 'gem', threshold: 10 },
  { id: 'di-15', key: 'treasure_hunter', name: 'Treasure Hunter', description: 'Find 50 hidden gems', category: 'discovery', type: 'hidden_gem', stars: 4, icon: 'gem', threshold: 50 },
  { id: 'di-16', key: 'indie_10', name: 'Independent Spirit', description: 'Read 10 indie comics', category: 'discovery', type: 'publisher_indie', stars: 2, icon: 'star', threshold: 10 },
  { id: 'di-17', key: 'indie_50', name: 'Indie Supporter', description: 'Read 50 indie comics', category: 'discovery', type: 'publisher_indie', stars: 3, icon: 'star', threshold: 50 },
  { id: 'di-18', key: 'indie_200', name: 'Indie Champion', description: 'Read 200 indie comics', category: 'discovery', type: 'publisher_indie', stars: 4, icon: 'award', threshold: 200 },
  { id: 'di-19', key: 'small_pub_5', name: 'Off the Beaten Path', description: 'Read 5 publishers with < 100 total comics', category: 'discovery', type: 'small_publisher', stars: 3, icon: 'map-pin', threshold: 5 },
  { id: 'di-20', key: 'small_pub_20', name: "Explorer's Spirit", description: 'Read 20 publishers with < 100 total comics', category: 'discovery', type: 'small_publisher', stars: 4, icon: 'map', threshold: 20 },
];
// =============================================================================
// Category 20: SPECIAL ACHIEVEMENTS (20 achievements)
// =============================================================================

export const SPECIAL_ACHIEVEMENTS: Achievement[] = [
  { id: 'sp-1', key: 'new_years', name: "New Year's Reader", description: 'Read on January 1st', category: 'special_achievements', type: 'special_date', stars: 1, icon: 'gift', threshold: 1, metadata: { month: 1, day: 1 } },
  { id: 'sp-2', key: 'halloween', name: 'Halloween Reader', description: 'Read on October 31st', category: 'special_achievements', type: 'special_date', stars: 1, icon: 'moon', threshold: 1, metadata: { month: 10, day: 31 } },
  { id: 'sp-3', key: 'valentine', name: 'Valentine Reader', description: 'Read on February 14th', category: 'special_achievements', type: 'special_date', stars: 1, icon: 'heart', threshold: 1, metadata: { month: 2, day: 14 } },
  { id: 'sp-4', key: 'independence', name: 'Independence Day', description: 'Read on July 4th', category: 'special_achievements', type: 'special_date', stars: 1, icon: 'flag', threshold: 1, metadata: { month: 7, day: 4 } },
  { id: 'sp-5', key: 'friday_13', name: 'Friday the 13th', description: 'Read on a Friday the 13th', category: 'special_achievements', type: 'special_date', stars: 1, icon: 'alert-triangle', threshold: 1, metadata: { weekday: 'friday', day: 13 } },
  { id: 'sp-6', key: 'holiday_5', name: 'Holiday Collector', description: 'Read on 5 different holidays', category: 'special_achievements', type: 'holiday_count', stars: 2, icon: 'calendar', threshold: 5 },
  { id: 'sp-7', key: 'holiday_10', name: 'Holiday Master', description: 'Read on 10 different holidays', category: 'special_achievements', type: 'holiday_count', stars: 3, icon: 'calendar', threshold: 10 },
  { id: 'sp-8', key: 'midnight', name: 'Midnight Reader', description: 'Read at exactly midnight', category: 'special_achievements', type: 'special_time', stars: 1, icon: 'moon', threshold: 1, metadata: { hour: 0 } },
  { id: 'sp-9', key: 'witching_hour', name: 'Witching Hour', description: 'Read during 3-4 AM', category: 'special_achievements', type: 'special_time', stars: 2, icon: 'moon', threshold: 1, metadata: { hour: 3 } },
  { id: 'sp-10', key: 'issue_1', name: 'Issue #1', description: 'Read an issue #1', category: 'special_achievements', type: 'issue_number', stars: 1, icon: 'hash', threshold: 1, metadata: { issueNumber: 1 } },
  { id: 'sp-11', key: 'issue_1_25', name: 'Issue #1 Collector', description: 'Read 25 issue #1s', category: 'special_achievements', type: 'issue_number', stars: 2, icon: 'hash', threshold: 25, metadata: { issueNumber: 1 } },
  { id: 'sp-12', key: 'issue_1_100', name: 'Issue #1 Hunter', description: 'Read 100 issue #1s', category: 'special_achievements', type: 'issue_number', stars: 3, icon: 'hash', threshold: 100, metadata: { issueNumber: 1 } },
  { id: 'sp-13', key: 'issue_1_500', name: 'Issue #1 Master', description: 'Read 500 issue #1s', category: 'special_achievements', type: 'issue_number', stars: 4, icon: 'hash', threshold: 500, metadata: { issueNumber: 1 } },
  { id: 'sp-14', key: 'finale', name: 'Final Issue', description: 'Read a series finale', category: 'special_achievements', type: 'series_finale', stars: 2, icon: 'flag', threshold: 1 },
  { id: 'sp-15', key: 'finale_25', name: 'Finale Collector', description: 'Read 25 series finales', category: 'special_achievements', type: 'series_finale', stars: 3, icon: 'flag', threshold: 25 },
  { id: 'sp-16', key: 'anniversary', name: 'Anniversary Issue', description: 'Read an anniversary issue (#100, #200, etc.)', category: 'special_achievements', type: 'anniversary_issue', stars: 2, icon: 'award', threshold: 1 },
  { id: 'sp-17', key: 'anniversary_10', name: 'Anniversary Collector', description: 'Read 10 anniversary issues', category: 'special_achievements', type: 'anniversary_issue', stars: 3, icon: 'award', threshold: 10 },
  { id: 'sp-18', key: 'variant', name: 'Variant Cover', description: 'Read a comic with multiple cover variants', category: 'special_achievements', type: 'variant_cover', stars: 2, icon: 'image', threshold: 1 },
  { id: 'sp-19', key: 'oneshot_25', name: 'One-Shot Wonder', description: 'Read 25 one-shot comics', category: 'special_achievements', type: 'one_shot', stars: 3, icon: 'zap', threshold: 25 },
  { id: 'sp-20', key: 'annual_25', name: 'Annual Reader', description: 'Read 25 annual issues', category: 'special_achievements', type: 'annual', stars: 4, icon: 'sun', threshold: 25 },
];
// =============================================================================
// Category 21: AGE RATING (15 achievements)
// =============================================================================

export const AGE_RATING_ACHIEVEMENTS: Achievement[] = [
  { id: 'ar-1', key: 'all_ages', name: 'All Ages', description: 'Read an all-ages comic', category: 'age_rating', type: 'rating_specific', stars: 1, icon: 'smile', threshold: 1, metadata: { rating: 'Everyone' } },
  { id: 'ar-2', key: 'teen', name: 'Teen Reading', description: 'Read a teen-rated comic', category: 'age_rating', type: 'rating_specific', stars: 1, icon: 'user', threshold: 1, metadata: { rating: 'Teen' } },
  { id: 'ar-3', key: 'mature', name: 'Mature Reading', description: 'Read a mature-rated comic', category: 'age_rating', type: 'rating_specific', stars: 1, icon: 'alert-circle', threshold: 1, metadata: { rating: 'Mature' } },
  { id: 'ar-4', key: 'rating_explorer', name: 'Rating Explorer', description: 'Read comics across all rating categories', category: 'age_rating', type: 'unique_ratings', stars: 2, icon: 'layers', threshold: 3 },
  { id: 'ar-5', key: 'family_25', name: 'Family Friendly I', description: 'Read 25 all-ages comics', category: 'age_rating', type: 'rating_specific', stars: 2, icon: 'smile', threshold: 25, metadata: { rating: 'Everyone' } },
  { id: 'ar-6', key: 'family_100', name: 'Family Friendly II', description: 'Read 100 all-ages comics', category: 'age_rating', type: 'rating_specific', stars: 3, icon: 'smile', threshold: 100, metadata: { rating: 'Everyone' } },
  { id: 'ar-7', key: 'family_500', name: 'Family Friendly III', description: 'Read 500 all-ages comics', category: 'age_rating', type: 'rating_specific', stars: 4, icon: 'smile', threshold: 500, metadata: { rating: 'Everyone' } },
  { id: 'ar-8', key: 'teen_25', name: 'Teen Reader I', description: 'Read 25 teen comics', category: 'age_rating', type: 'rating_specific', stars: 2, icon: 'user', threshold: 25, metadata: { rating: 'Teen' } },
  { id: 'ar-9', key: 'teen_100', name: 'Teen Reader II', description: 'Read 100 teen comics', category: 'age_rating', type: 'rating_specific', stars: 3, icon: 'user', threshold: 100, metadata: { rating: 'Teen' } },
  { id: 'ar-10', key: 'teen_500', name: 'Teen Reader III', description: 'Read 500 teen comics', category: 'age_rating', type: 'rating_specific', stars: 4, icon: 'user', threshold: 500, metadata: { rating: 'Teen' } },
  { id: 'ar-11', key: 'mature_25', name: 'Mature Reader I', description: 'Read 25 mature comics', category: 'age_rating', type: 'rating_specific', stars: 2, icon: 'alert-circle', threshold: 25, metadata: { rating: 'Mature' } },
  { id: 'ar-12', key: 'mature_100', name: 'Mature Reader II', description: 'Read 100 mature comics', category: 'age_rating', type: 'rating_specific', stars: 3, icon: 'alert-circle', threshold: 100, metadata: { rating: 'Mature' } },
  { id: 'ar-13', key: 'mature_500', name: 'Mature Reader III', description: 'Read 500 mature comics', category: 'age_rating', type: 'rating_specific', stars: 4, icon: 'alert-circle', threshold: 500, metadata: { rating: 'Mature' } },
  { id: 'ar-14', key: 'rating_balance', name: 'Rating Balance', description: 'Read equal numbers across all ratings', category: 'age_rating', type: 'rating_balance', stars: 3, icon: 'sliders', threshold: 1 },
  { id: 'ar-15', key: 'curated', name: 'Curated Collection', description: 'Have 80%+ comics with proper age ratings', category: 'age_rating', type: 'metadata_quality', stars: 4, icon: 'check-circle', threshold: 80 },
];
// =============================================================================
// Category 22: LOCATION EXPLORER (15 achievements)
// =============================================================================

export const LOCATION_ACHIEVEMENTS: Achievement[] = [
  { id: 'lo-1', key: 'first_location', name: 'First Location', description: 'Read a comic with a tagged location', category: 'location_explorer', type: 'unique_locations', stars: 1, icon: 'map-pin', threshold: 1 },
  { id: 'lo-2', key: 'locations_5', name: 'Location Sampler', description: 'Read 5 different locations', category: 'location_explorer', type: 'unique_locations', stars: 1, icon: 'map-pin', threshold: 5 },
  { id: 'lo-3', key: 'locations_10', name: 'Location Explorer', description: 'Read 10 different locations', category: 'location_explorer', type: 'unique_locations', stars: 2, icon: 'map', threshold: 10 },
  { id: 'lo-4', key: 'locations_25', name: 'Location Collector', description: 'Read 25 different locations', category: 'location_explorer', type: 'unique_locations', stars: 3, icon: 'map', threshold: 25 },
  { id: 'lo-5', key: 'locations_50', name: 'Location Expert', description: 'Read 50 different locations', category: 'location_explorer', type: 'unique_locations', stars: 4, icon: 'globe', threshold: 50 },
  { id: 'lo-6', key: 'locations_100', name: 'World Traveler', description: 'Read 100+ different locations', category: 'location_explorer', type: 'unique_locations', stars: 5, icon: 'globe', threshold: 100 },
  { id: 'lo-7', key: 'gotham_10', name: 'Gotham Visitor', description: 'Read 10 comics set in Gotham', category: 'location_explorer', type: 'location_specific', stars: 2, icon: 'moon', threshold: 10, metadata: { location: 'Gotham' } },
  { id: 'lo-8', key: 'gotham_50', name: 'Gotham Regular', description: 'Read 50 comics set in Gotham', category: 'location_explorer', type: 'location_specific', stars: 3, icon: 'moon', threshold: 50, metadata: { location: 'Gotham' } },
  { id: 'lo-9', key: 'metropolis_10', name: 'Metropolis Visitor', description: 'Read 10 comics set in Metropolis', category: 'location_explorer', type: 'location_specific', stars: 2, icon: 'sun', threshold: 10, metadata: { location: 'Metropolis' } },
  { id: 'lo-10', key: 'metropolis_50', name: 'Metropolis Regular', description: 'Read 50 comics set in Metropolis', category: 'location_explorer', type: 'location_specific', stars: 3, icon: 'sun', threshold: 50, metadata: { location: 'Metropolis' } },
  { id: 'lo-11', key: 'nyc_10', name: 'NYC Reader', description: 'Read 10 comics set in New York', category: 'location_explorer', type: 'location_specific', stars: 2, icon: 'building', threshold: 10, metadata: { location: 'New York' } },
  { id: 'lo-12', key: 'nyc_50', name: 'NYC Expert', description: 'Read 50 comics set in New York', category: 'location_explorer', type: 'location_specific', stars: 3, icon: 'building', threshold: 50, metadata: { location: 'New York' } },
  { id: 'lo-13', key: 'space_10', name: 'Space Explorer', description: 'Read 10 comics set in space', category: 'location_explorer', type: 'location_specific', stars: 2, icon: 'star', threshold: 10, metadata: { location: 'Space' } },
  { id: 'lo-14', key: 'space_50', name: 'Cosmic Traveler', description: 'Read 50 comics set in space', category: 'location_explorer', type: 'location_specific', stars: 3, icon: 'star', threshold: 50, metadata: { location: 'Space' } },
  { id: 'lo-15', key: 'dimensions_10', name: 'Dimension Hopper', description: 'Read comics from 10 different dimensions', category: 'location_explorer', type: 'unique_dimensions', stars: 4, icon: 'layers', threshold: 10 },
];
// =============================================================================
// Category 23: BOOKMARKS & NOTES (10 achievements)
// =============================================================================

export const BOOKMARK_ACHIEVEMENTS: Achievement[] = [
  { id: 'bm-1', key: 'first_bookmark', name: 'First Bookmark', description: 'Create your first bookmark', category: 'bookmarks_notes', type: 'bookmarks_total', stars: 1, icon: 'bookmark', threshold: 1 },
  { id: 'bm-2', key: 'bookmarks_10', name: 'Bookmark Collector', description: 'Create 10 bookmarks', category: 'bookmarks_notes', type: 'bookmarks_total', stars: 1, icon: 'bookmark', threshold: 10 },
  { id: 'bm-3', key: 'bookmarks_50', name: 'Bookmark Enthusiast', description: 'Create 50 bookmarks', category: 'bookmarks_notes', type: 'bookmarks_total', stars: 2, icon: 'bookmark', threshold: 50 },
  { id: 'bm-4', key: 'bookmarks_200', name: 'Bookmark Expert', description: 'Create 200 bookmarks', category: 'bookmarks_notes', type: 'bookmarks_total', stars: 3, icon: 'bookmark', threshold: 200 },
  { id: 'bm-5', key: 'first_note', name: 'Annotator', description: 'Add your first note to a series', category: 'bookmarks_notes', type: 'notes_total', stars: 1, icon: 'edit-3', threshold: 1 },
  { id: 'bm-6', key: 'notes_10', name: 'Note Taker', description: 'Add notes to 10 series', category: 'bookmarks_notes', type: 'series_with_notes', stars: 2, icon: 'edit-3', threshold: 10 },
  { id: 'bm-7', key: 'notes_50', name: 'Detailed Reviewer', description: 'Add notes to 50 series', category: 'bookmarks_notes', type: 'series_with_notes', stars: 3, icon: 'file-text', threshold: 50 },
  { id: 'bm-8', key: 'organized_10', name: 'Organized Reader', description: 'Use bookmarks in 10 different comics', category: 'bookmarks_notes', type: 'comics_with_bookmarks', stars: 2, icon: 'folder', threshold: 10 },
  { id: 'bm-9', key: 'organized_50', name: 'Super Organized', description: 'Use bookmarks in 50 different comics', category: 'bookmarks_notes', type: 'comics_with_bookmarks', stars: 3, icon: 'folder', threshold: 50 },
  { id: 'bm-10', key: 'organized_200', name: 'Master Organizer', description: 'Use bookmarks in 200 different comics', category: 'bookmarks_notes', type: 'comics_with_bookmarks', stars: 4, icon: 'archive', threshold: 200 },
];
// =============================================================================
// Category 24: SESSIONS (15 achievements)
// =============================================================================

export const SESSION_ACHIEVEMENTS: Achievement[] = [
  { id: 'se-1', key: 'first_session', name: 'First Session', description: 'Complete your first reading session', category: 'sessions', type: 'sessions_total', stars: 1, icon: 'play', threshold: 1 },
  { id: 'se-2', key: 'sessions_10', name: 'Ten Sessions', description: 'Complete 10 reading sessions', category: 'sessions', type: 'sessions_total', stars: 1, icon: 'play', threshold: 10 },
  { id: 'se-3', key: 'sessions_50', name: 'Fifty Sessions', description: 'Complete 50 reading sessions', category: 'sessions', type: 'sessions_total', stars: 2, icon: 'activity', threshold: 50 },
  { id: 'se-4', key: 'sessions_100', name: 'Century Sessions', description: 'Complete 100 reading sessions', category: 'sessions', type: 'sessions_total', stars: 2, icon: 'activity', threshold: 100 },
  { id: 'se-5', key: 'sessions_500', name: '500 Sessions', description: 'Complete 500 reading sessions', category: 'sessions', type: 'sessions_total', stars: 3, icon: 'activity', threshold: 500 },
  { id: 'se-6', key: 'sessions_1000', name: '1000 Sessions', description: 'Complete 1,000 reading sessions', category: 'sessions', type: 'sessions_total', stars: 4, icon: 'zap', threshold: 1000 },
  { id: 'se-7', key: 'sessions_5000', name: 'Session Master', description: 'Complete 5,000 reading sessions', category: 'sessions', type: 'sessions_total', stars: 5, icon: 'crown', threshold: 5000 },
  { id: 'se-8', key: 'daily_sessions_3', name: 'Daily Sessions I', description: 'Have 3 sessions in one day', category: 'sessions', type: 'sessions_day', stars: 1, icon: 'calendar', threshold: 3 },
  { id: 'se-9', key: 'daily_sessions_5', name: 'Daily Sessions II', description: 'Have 5 sessions in one day', category: 'sessions', type: 'sessions_day', stars: 2, icon: 'calendar', threshold: 5 },
  { id: 'se-10', key: 'daily_sessions_10', name: 'Daily Sessions III', description: 'Have 10 sessions in one day', category: 'sessions', type: 'sessions_day', stars: 3, icon: 'calendar', threshold: 10 },
  { id: 'se-11', key: 'focused_10', name: 'Focused Reader', description: 'Complete 10 sessions without interruption', category: 'sessions', type: 'focused_sessions', stars: 2, icon: 'target', threshold: 10 },
  { id: 'se-12', key: 'focused_50', name: 'Ultra Focus', description: 'Complete 50 sessions without interruption', category: 'sessions', type: 'focused_sessions', stars: 3, icon: 'target', threshold: 50 },
  { id: 'se-13', key: 'morning_10', name: 'Morning Reader', description: 'Have 10 sessions before noon', category: 'sessions', type: 'morning_sessions', stars: 2, icon: 'sunrise', threshold: 10 },
  { id: 'se-14', key: 'evening_10', name: 'Evening Reader', description: 'Have 10 sessions after 6 PM', category: 'sessions', type: 'evening_sessions', stars: 2, icon: 'sunset', threshold: 10 },
  { id: 'se-15', key: 'all_hours', name: 'All-Hours Reader', description: 'Have sessions in all 24 hours (over time)', category: 'sessions', type: 'unique_hours', stars: 3, icon: 'clock', threshold: 24 },
];
// =============================================================================
// Category 25: COLLECTION COMPLETION (25 achievements)
// =============================================================================

export const COMPLETION_ACHIEVEMENTS: Achievement[] = [
  // Flat number achievements (no minimum)
  { id: 'cp-1', key: 'coll_read_1', name: 'First Read', description: 'Read 1 comic from your collection', category: 'collection_completion', type: 'collection_read', stars: 1, icon: 'book-open', threshold: 1 },
  { id: 'cp-2', key: 'coll_read_10', name: 'Getting Started', description: 'Read 10 comics from your collection', category: 'collection_completion', type: 'collection_read', stars: 1, icon: 'book-open', threshold: 10 },
  { id: 'cp-3', key: 'coll_read_50', name: 'Making Progress', description: 'Read 50 comics from your collection', category: 'collection_completion', type: 'collection_read', stars: 1, icon: 'book-open', threshold: 50 },
  { id: 'cp-4', key: 'coll_read_100', name: 'Hundred Down', description: 'Read 100 comics from your collection', category: 'collection_completion', type: 'collection_read', stars: 2, icon: 'trending-up', threshold: 100 },
  { id: 'cp-5', key: 'coll_read_250', name: 'Quarter Thousand', description: 'Read 250 comics from your collection', category: 'collection_completion', type: 'collection_read', stars: 2, icon: 'trending-up', threshold: 250 },
  { id: 'cp-6', key: 'coll_read_500', name: 'Half K', description: 'Read 500 comics from your collection', category: 'collection_completion', type: 'collection_read', stars: 3, icon: 'trending-up', threshold: 500 },
  { id: 'cp-7', key: 'coll_read_1000', name: 'Thousand Read', description: 'Read 1,000 comics from your collection', category: 'collection_completion', type: 'collection_read', stars: 3, icon: 'award', threshold: 1000 },
  { id: 'cp-8', key: 'coll_read_2000', name: 'Two Thousand', description: 'Read 2,000 comics from your collection', category: 'collection_completion', type: 'collection_read', stars: 4, icon: 'award', threshold: 2000 },
  { id: 'cp-9', key: 'coll_read_5000', name: 'Five Thousand', description: 'Read 5,000 comics from your collection', category: 'collection_completion', type: 'collection_read', stars: 5, icon: 'crown', threshold: 5000 },
  // Percentage achievements (require 1,000+ comic library)
  { id: 'cp-10', key: 'coll_pct_10', name: 'Ten Percent', description: 'Read 10% of collection (min 1,000 comics)', category: 'collection_completion', type: 'collection_percentage', stars: 2, icon: 'percent', threshold: 10, minRequired: 1000 },
  { id: 'cp-11', key: 'coll_pct_25', name: 'Quarter Done', description: 'Read 25% of collection (min 1,000 comics)', category: 'collection_completion', type: 'collection_percentage', stars: 3, icon: 'percent', threshold: 25, minRequired: 1000 },
  { id: 'cp-12', key: 'coll_pct_50', name: 'Halfway There', description: 'Read 50% of collection (min 1,000 comics)', category: 'collection_completion', type: 'collection_percentage', stars: 3, icon: 'percent', threshold: 50, minRequired: 1000 },
  { id: 'cp-13', key: 'coll_pct_75', name: 'Three Quarters', description: 'Read 75% of collection (min 1,000 comics)', category: 'collection_completion', type: 'collection_percentage', stars: 4, icon: 'percent', threshold: 75, minRequired: 1000 },
  { id: 'cp-14', key: 'coll_pct_90', name: 'Almost Complete', description: 'Read 90% of collection (min 1,000 comics)', category: 'collection_completion', type: 'collection_percentage', stars: 4, icon: 'percent', threshold: 90, minRequired: 1000 },
  { id: 'cp-15', key: 'coll_pct_100', name: 'Completionist', description: 'Read 100% of collection (min 1,000 comics)', category: 'collection_completion', type: 'collection_percentage', stars: 5, icon: 'check-circle', threshold: 100, minRequired: 1000 },
  // Series completion (require 50+ series)
  { id: 'cp-16', key: 'series_pct_25', name: 'Series Progress I', description: 'Complete 25% of all series (min 50 series)', category: 'collection_completion', type: 'series_percentage', stars: 2, icon: 'layers', threshold: 25, minRequired: 50 },
  { id: 'cp-17', key: 'series_pct_50', name: 'Series Progress II', description: 'Complete 50% of all series (min 50 series)', category: 'collection_completion', type: 'series_percentage', stars: 3, icon: 'layers', threshold: 50, minRequired: 50 },
  { id: 'cp-18', key: 'series_pct_75', name: 'Series Progress III', description: 'Complete 75% of all series (min 50 series)', category: 'collection_completion', type: 'series_percentage', stars: 4, icon: 'layers', threshold: 75, minRequired: 50 },
  { id: 'cp-19', key: 'series_pct_100', name: 'Series Completionist', description: 'Complete 100% of all series (min 50 series)', category: 'collection_completion', type: 'series_percentage', stars: 5, icon: 'check-circle', threshold: 100, minRequired: 50 },
  // Backlog management (require 500+ comic library)
  { id: 'cp-20', key: 'backlog_50', name: 'Small Backlog', description: 'Have < 50 unread comics (min 500 library)', category: 'collection_completion', type: 'backlog_size', stars: 3, icon: 'inbox', threshold: 50, minRequired: 500 },
  { id: 'cp-21', key: 'backlog_20', name: 'Minimal Backlog', description: 'Have < 20 unread comics (min 500 library)', category: 'collection_completion', type: 'backlog_size', stars: 4, icon: 'inbox', threshold: 20, minRequired: 500 },
  { id: 'cp-22', key: 'backlog_10', name: 'Tiny Backlog', description: 'Have < 10 unread comics (min 500 library)', category: 'collection_completion', type: 'backlog_size', stars: 4, icon: 'inbox', threshold: 10, minRequired: 500 },
  { id: 'cp-23', key: 'backlog_0', name: 'No Backlog', description: 'Have 0 unread comics (min 500 library)', category: 'collection_completion', type: 'backlog_size', stars: 5, icon: 'check-circle', threshold: 0, minRequired: 500 },
  { id: 'cp-24', key: 'efficient_90', name: 'Efficient Reader', description: 'Maintain 90%+ read rate for 30 days (min 1,000 library)', category: 'collection_completion', type: 'read_rate', stars: 5, icon: 'trending-up', threshold: 90, minRequired: 1000 },
  { id: 'cp-25', key: 'zero_waste', name: 'Zero Waste Reader', description: 'Read every comic added within 7 days for 30 days', category: 'collection_completion', type: 'read_rate', stars: 5, icon: 'zap', threshold: 30 },
];

// =============================================================================
// Category 26: RATINGS & REVIEWS ENGAGEMENT (50 achievements)
// =============================================================================

export const RATING_ENGAGEMENT_ACHIEVEMENTS: Achievement[] = [
  // Rating Milestones (11)
  { id: 're-1', key: 'ratings_1', name: 'First Opinion', description: 'Rate your first comic or series', category: 'ratings_engagement', type: 'ratings_total', stars: 1, icon: 'star', threshold: 1 },
  { id: 're-2', key: 'ratings_10', name: 'Getting Started', description: 'Rate 10 comics or series', category: 'ratings_engagement', type: 'ratings_total', stars: 1, icon: 'star', threshold: 10 },
  { id: 're-3', key: 'ratings_25', name: 'Opinionated', description: 'Rate 25 comics or series', category: 'ratings_engagement', type: 'ratings_total', stars: 1, icon: 'star', threshold: 25 },
  { id: 're-4', key: 'ratings_50', name: 'Critical Eye', description: 'Rate 50 comics or series', category: 'ratings_engagement', type: 'ratings_total', stars: 2, icon: 'star', threshold: 50 },
  { id: 're-5', key: 'ratings_100', name: 'Century Critic', description: 'Rate 100 comics or series', category: 'ratings_engagement', type: 'ratings_total', stars: 2, icon: 'star', threshold: 100 },
  { id: 're-6', key: 'ratings_250', name: 'Rating Machine', description: 'Rate 250 comics or series', category: 'ratings_engagement', type: 'ratings_total', stars: 3, icon: 'star', threshold: 250 },
  { id: 're-7', key: 'ratings_500', name: 'Five Hundred Takes', description: 'Rate 500 comics or series', category: 'ratings_engagement', type: 'ratings_total', stars: 3, icon: 'star', threshold: 500 },
  { id: 're-8', key: 'ratings_1000', name: 'Thousand Opinions', description: 'Rate 1,000 comics or series', category: 'ratings_engagement', type: 'ratings_total', stars: 4, icon: 'trophy', threshold: 1000 },
  { id: 're-9', key: 'ratings_2500', name: 'Prolific Rater', description: 'Rate 2,500 comics or series', category: 'ratings_engagement', type: 'ratings_total', stars: 4, icon: 'trophy', threshold: 2500 },
  { id: 're-10', key: 'ratings_5000', name: 'Rating Legend', description: 'Rate 5,000 comics or series', category: 'ratings_engagement', type: 'ratings_total', stars: 5, icon: 'crown', threshold: 5000 },
  { id: 're-11', key: 'ratings_10000', name: 'Ultimate Critic', description: 'Rate 10,000 comics or series', category: 'ratings_engagement', type: 'ratings_total', stars: 5, icon: 'crown', threshold: 10000 },

  // Review Milestones (8)
  { id: 're-12', key: 'reviews_1', name: 'First Words', description: 'Write your first review', category: 'ratings_engagement', type: 'reviews_total', stars: 1, icon: 'message-square', threshold: 1 },
  { id: 're-13', key: 'reviews_5', name: 'Finding Your Voice', description: 'Write 5 reviews', category: 'ratings_engagement', type: 'reviews_total', stars: 1, icon: 'message-square', threshold: 5 },
  { id: 're-14', key: 'reviews_10', name: 'Ten Takes', description: 'Write 10 reviews', category: 'ratings_engagement', type: 'reviews_total', stars: 1, icon: 'message-square', threshold: 10 },
  { id: 're-15', key: 'reviews_25', name: 'Critic Emerges', description: 'Write 25 reviews', category: 'ratings_engagement', type: 'reviews_total', stars: 2, icon: 'message-square', threshold: 25 },
  { id: 're-16', key: 'reviews_50', name: 'Prolific Reviewer', description: 'Write 50 reviews', category: 'ratings_engagement', type: 'reviews_total', stars: 2, icon: 'edit', threshold: 50 },
  { id: 're-17', key: 'reviews_100', name: 'Century of Reviews', description: 'Write 100 reviews', category: 'ratings_engagement', type: 'reviews_total', stars: 3, icon: 'edit', threshold: 100 },
  { id: 're-18', key: 'reviews_250', name: 'Thoughtful Critic', description: 'Write 250 reviews', category: 'ratings_engagement', type: 'reviews_total', stars: 4, icon: 'edit-3', threshold: 250 },
  { id: 're-19', key: 'reviews_500', name: 'Master Reviewer', description: 'Write 500 reviews', category: 'ratings_engagement', type: 'reviews_total', stars: 5, icon: 'award', threshold: 500 },

  // Genre Diversity (5)
  { id: 're-20', key: 'genres_rated_5', name: 'Genre Sampler', description: 'Rate comics from 5 different genres', category: 'ratings_engagement', type: 'genres_rated', stars: 1, icon: 'compass', threshold: 5 },
  { id: 're-21', key: 'genres_rated_10', name: 'Genre Explorer', description: 'Rate comics from 10 different genres', category: 'ratings_engagement', type: 'genres_rated', stars: 2, icon: 'compass', threshold: 10 },
  { id: 're-22', key: 'genres_rated_15', name: 'Genre Enthusiast', description: 'Rate comics from 15 different genres', category: 'ratings_engagement', type: 'genres_rated', stars: 3, icon: 'compass', threshold: 15 },
  { id: 're-23', key: 'genres_rated_20', name: 'Genre Master', description: 'Rate comics from 20 different genres', category: 'ratings_engagement', type: 'genres_rated', stars: 4, icon: 'compass', threshold: 20 },
  { id: 're-24', key: 'genres_rated_25', name: 'Genre Omnivore', description: 'Rate comics from 25 different genres', category: 'ratings_engagement', type: 'genres_rated', stars: 5, icon: 'globe', threshold: 25 },

  // Publisher Diversity (5)
  { id: 're-25', key: 'publishers_rated_5', name: 'Publisher Sampler', description: 'Rate comics from 5 different publishers', category: 'ratings_engagement', type: 'publishers_rated', stars: 1, icon: 'building', threshold: 5 },
  { id: 're-26', key: 'publishers_rated_10', name: 'Publisher Explorer', description: 'Rate comics from 10 different publishers', category: 'ratings_engagement', type: 'publishers_rated', stars: 2, icon: 'building', threshold: 10 },
  { id: 're-27', key: 'publishers_rated_20', name: 'Publisher Enthusiast', description: 'Rate comics from 20 different publishers', category: 'ratings_engagement', type: 'publishers_rated', stars: 3, icon: 'building', threshold: 20 },
  { id: 're-28', key: 'publishers_rated_30', name: 'Publisher Connoisseur', description: 'Rate comics from 30 different publishers', category: 'ratings_engagement', type: 'publishers_rated', stars: 4, icon: 'building', threshold: 30 },
  { id: 're-29', key: 'publishers_rated_50', name: 'Publisher Omnivore', description: 'Rate comics from 50 different publishers', category: 'ratings_engagement', type: 'publishers_rated', stars: 5, icon: 'globe', threshold: 50 },

  // Series Completionist (5)
  { id: 're-30', key: 'series_complete_rated_1', name: 'Thorough Reader', description: 'Rate all issues in a series', category: 'ratings_engagement', type: 'series_complete_rated', stars: 1, icon: 'check-circle', threshold: 1 },
  { id: 're-31', key: 'series_complete_rated_5', name: 'Thorough Critic', description: 'Rate all issues in 5 series', category: 'ratings_engagement', type: 'series_complete_rated', stars: 2, icon: 'check-circle', threshold: 5 },
  { id: 're-32', key: 'series_complete_rated_10', name: 'Completionist Critic', description: 'Rate all issues in 10 series', category: 'ratings_engagement', type: 'series_complete_rated', stars: 3, icon: 'check-circle', threshold: 10 },
  { id: 're-33', key: 'series_complete_rated_25', name: 'Dedicated Rater', description: 'Rate all issues in 25 series', category: 'ratings_engagement', type: 'series_complete_rated', stars: 4, icon: 'award', threshold: 25 },
  { id: 're-34', key: 'series_complete_rated_50', name: 'Rating Completionist', description: 'Rate all issues in 50 series', category: 'ratings_engagement', type: 'series_complete_rated', stars: 5, icon: 'award', threshold: 50 },

  // Rating Streaks (6)
  { id: 're-35', key: 'rating_streak_3', name: 'Rating Habit', description: 'Rate something 3 days in a row', category: 'ratings_engagement', type: 'rating_streak', stars: 1, icon: 'flame', threshold: 3 },
  { id: 're-36', key: 'rating_streak_7', name: 'Weekly Rater', description: 'Rate something 7 days in a row', category: 'ratings_engagement', type: 'rating_streak', stars: 2, icon: 'flame', threshold: 7 },
  { id: 're-37', key: 'rating_streak_14', name: 'Consistent Critic', description: 'Rate something 14 days in a row', category: 'ratings_engagement', type: 'rating_streak', stars: 2, icon: 'flame', threshold: 14 },
  { id: 're-38', key: 'rating_streak_30', name: 'Monthly Dedication', description: 'Rate something 30 days in a row', category: 'ratings_engagement', type: 'rating_streak', stars: 3, icon: 'flame', threshold: 30 },
  { id: 're-39', key: 'rating_streak_60', name: 'Rating Warrior', description: 'Rate something 60 days in a row', category: 'ratings_engagement', type: 'rating_streak', stars: 4, icon: 'flame', threshold: 60 },
  { id: 're-40', key: 'rating_streak_100', name: 'Eternal Critic', description: 'Rate something 100 days in a row', category: 'ratings_engagement', type: 'rating_streak', stars: 5, icon: 'crown', threshold: 100 },

  // Review Quality (5)
  { id: 're-41', key: 'review_length_50', name: 'Brief Thoughts', description: 'Write a review with 50+ characters', category: 'ratings_engagement', type: 'review_length', stars: 1, icon: 'file-text', threshold: 50 },
  { id: 're-42', key: 'review_length_100', name: 'Detailed Opinion', description: 'Write a review with 100+ characters', category: 'ratings_engagement', type: 'review_length', stars: 1, icon: 'file-text', threshold: 100 },
  { id: 're-43', key: 'review_length_250', name: 'Thoughtful Review', description: 'Write a review with 250+ characters', category: 'ratings_engagement', type: 'review_length', stars: 2, icon: 'file-text', threshold: 250 },
  { id: 're-44', key: 'review_length_500', name: 'Essay Writer', description: 'Write a review with 500+ characters', category: 'ratings_engagement', type: 'review_length', stars: 3, icon: 'book-open', threshold: 500 },
  { id: 're-45', key: 'review_length_1000', name: 'Critical Essay', description: 'Write a review with 1,000+ characters', category: 'ratings_engagement', type: 'review_length', stars: 4, icon: 'book-open', threshold: 1000 },

  // Bonus Engagement (5)
  { id: 're-46', key: 'ratings_same_day_5', name: 'Rating Spree', description: 'Rate 5 comics in one day', category: 'ratings_engagement', type: 'ratings_same_day', stars: 1, icon: 'zap', threshold: 5 },
  { id: 're-47', key: 'ratings_same_day_10', name: 'Rating Marathon', description: 'Rate 10 comics in one day', category: 'ratings_engagement', type: 'ratings_same_day', stars: 2, icon: 'zap', threshold: 10 },
  { id: 're-48', key: 'ratings_same_day_25', name: 'Rating Blitz', description: 'Rate 25 comics in one day', category: 'ratings_engagement', type: 'ratings_same_day', stars: 3, icon: 'zap', threshold: 25 },
  { id: 're-49', key: 'reviews_same_day_3', name: 'Review Spree', description: 'Write 3 reviews in one day', category: 'ratings_engagement', type: 'reviews_same_day', stars: 2, icon: 'zap', threshold: 3 },
  { id: 're-50', key: 'reviews_same_day_5', name: 'Review Marathon', description: 'Write 5 reviews in one day', category: 'ratings_engagement', type: 'reviews_same_day', stars: 3, icon: 'zap', threshold: 5 },
];

// Combined array of all achievements
export const ALL_ACHIEVEMENTS: Achievement[] = [
  ...PAGE_MILESTONE_ACHIEVEMENTS,
  ...COMIC_COMPLETION_ACHIEVEMENTS,
  ...READING_STREAK_ACHIEVEMENTS,
  ...READING_TIME_ACHIEVEMENTS,
  ...AUTHOR_ACHIEVEMENTS,
  ...ARTIST_ACHIEVEMENTS,
  ...GENRE_ACHIEVEMENTS,
  ...CHARACTER_ACHIEVEMENTS,
  ...PUBLISHER_ACHIEVEMENTS,
  ...SERIES_ACHIEVEMENTS,
  ...COLLECTION_SIZE_ACHIEVEMENTS,
  ...TEAM_ACHIEVEMENTS,
  ...DECADE_ACHIEVEMENTS,
  ...STORY_ARC_ACHIEVEMENTS,
  ...FORMAT_ACHIEVEMENTS,
  ...MANGA_INTERNATIONAL_ACHIEVEMENTS,
  ...BINGE_ACHIEVEMENTS,
  ...PACE_ACHIEVEMENTS,
  ...DISCOVERY_ACHIEVEMENTS,
  ...SPECIAL_ACHIEVEMENTS,
  ...AGE_RATING_ACHIEVEMENTS,
  ...LOCATION_ACHIEVEMENTS,
  ...BOOKMARK_ACHIEVEMENTS,
  ...SESSION_ACHIEVEMENTS,
  ...COMPLETION_ACHIEVEMENTS,
  ...RATING_ENGAGEMENT_ACHIEVEMENTS,
];

// Helper functions
export function getAchievementsByCategory(category: AchievementCategory): Achievement[] {
  return ALL_ACHIEVEMENTS.filter(a => a.category === category);
}

export function getAchievementsByStars(stars: 1 | 2 | 3 | 4 | 5): Achievement[] {
  return ALL_ACHIEVEMENTS.filter(a => a.stars === stars);
}

export function getAchievementByKey(key: string): Achievement | undefined {
  return ALL_ACHIEVEMENTS.find(a => a.key === key);
}
