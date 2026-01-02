// =============================================================================
// Achievement System Configuration
// ~250 achievements across 26 categories with star-based ranking
// NOTE: Many achievements were removed because they required complex aggregation
// or tracking that is not currently implemented. See individual category notes.
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
  // NOTE: same_writer achievements removed - require per-writer aggregation not currently tracked
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
  // NOTE: same_artist, art_team, full_credits achievements removed - require per-artist aggregation not currently tracked
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
  // NOTE: genre_specific achievements removed - require per-genre aggregation not currently tracked
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
  // NOTE: same_character, first_appearance, villain/hero specific, and events_completed achievements removed - require complex aggregation not currently tracked
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
  // NOTE: publisher_specific achievements removed - require per-publisher aggregation not currently tracked
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
  // Series started achievements (trackable)
  { id: 'se-11', key: 'series_starter_10', name: 'Series Starter', description: 'Start 10 different series', category: 'series_completionist', type: 'series_started', stars: 2, icon: 'play', threshold: 10 },
  { id: 'se-12', key: 'series_explorer_50', name: 'Series Explorer', description: 'Start 50 different series', category: 'series_completionist', type: 'series_started', stars: 3, icon: 'play', threshold: 50 },
  { id: 'se-13', key: 'series_adventurer', name: 'Series Adventurer', description: 'Start 200 different series', category: 'series_completionist', type: 'series_started', stars: 4, icon: 'play', threshold: 200 },
  // NOTE: series length and timeframe-based achievements removed - require complex tracking not currently implemented
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
  // NOTE: same_team, team_specific, and timeframe-based team achievements removed - require per-team aggregation not currently tracked
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
  // NOTE: decade_specific count achievements removed - require per-decade aggregation not currently tracked
];
// =============================================================================
// Category 14: STORY ARC EXPLORER (15 achievements)
// =============================================================================

// NOTE: STORY_ARC_ACHIEVEMENTS entirely removed - story arc tracking system not implemented
export const STORY_ARC_ACHIEVEMENTS: Achievement[] = [];

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
  // NOTE: format_specific count achievements removed - require per-format aggregation not currently tracked
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
  // NOTE: genre-specific and region-specific manga achievements removed - require per-genre/region aggregation not currently tracked
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

// NOTE: PACE_ACHIEVEMENTS entirely removed - reading pace tracking requires complex calculations not currently implemented
export const PACE_ACHIEVEMENTS: Achievement[] = [];
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
  // NOTE: indie and small publisher achievements removed - require publisher classification not currently tracked
];
// =============================================================================
// Category 20: SPECIAL ACHIEVEMENTS (20 achievements)
// =============================================================================

// NOTE: SPECIAL_ACHIEVEMENTS entirely removed - date/time/special issue tracking requires complex tracking not currently implemented
export const SPECIAL_ACHIEVEMENTS: Achievement[] = [];
// =============================================================================
// Category 21: AGE RATING (15 achievements)
// =============================================================================

// NOTE: AGE_RATING_ACHIEVEMENTS entirely removed - age rating tracking requires per-rating aggregation not currently implemented
export const AGE_RATING_ACHIEVEMENTS: Achievement[] = [];
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
  // NOTE: location_specific achievements removed - require per-location aggregation not currently tracked
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
  { id: 'ss-1', key: 'first_session', name: 'First Session', description: 'Complete your first reading session', category: 'sessions', type: 'sessions_total', stars: 1, icon: 'play', threshold: 1 },
  { id: 'ss-2', key: 'sessions_10', name: 'Ten Sessions', description: 'Complete 10 reading sessions', category: 'sessions', type: 'sessions_total', stars: 1, icon: 'play', threshold: 10 },
  { id: 'ss-3', key: 'sessions_50', name: 'Fifty Sessions', description: 'Complete 50 reading sessions', category: 'sessions', type: 'sessions_total', stars: 2, icon: 'activity', threshold: 50 },
  { id: 'ss-4', key: 'sessions_100', name: 'Century Sessions', description: 'Complete 100 reading sessions', category: 'sessions', type: 'sessions_total', stars: 2, icon: 'activity', threshold: 100 },
  { id: 'ss-5', key: 'sessions_500', name: '500 Sessions', description: 'Complete 500 reading sessions', category: 'sessions', type: 'sessions_total', stars: 3, icon: 'activity', threshold: 500 },
  { id: 'ss-6', key: 'sessions_1000', name: '1000 Sessions', description: 'Complete 1,000 reading sessions', category: 'sessions', type: 'sessions_total', stars: 4, icon: 'zap', threshold: 1000 },
  { id: 'ss-7', key: 'sessions_5000', name: 'Session Master', description: 'Complete 5,000 reading sessions', category: 'sessions', type: 'sessions_total', stars: 5, icon: 'crown', threshold: 5000 },
  // NOTE: daily_sessions, focused_sessions, morning/evening sessions, and unique_hours achievements removed - require complex session time tracking not currently implemented
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
  // NOTE: percentage, series_percentage, backlog_size, and read_rate achievements removed - require complex percentage calculations not currently implemented
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
