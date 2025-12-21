import type { DailyStats } from '../../../services/api.service';

export interface HeatmapDay {
  date: string;
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
  pagesRead: number;
  duration: number; // seconds
  intensity: number; // 0-5
}

export interface HeatmapWeek {
  weekIndex: number;
  days: HeatmapDay[];
}

export type HeatmapMetric = 'pages' | 'time';

/**
 * Generate array of dates for the past N days
 */
function getDaysInRange(days: number): Date[] {
  const result: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    result.push(date);
  }

  return result;
}

/**
 * Format date as YYYY-MM-DD for comparison
 */
function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0] ?? '';
}

/**
 * Calculate intensity level (0-5) based on value and max
 */
function calculateIntensity(value: number, max: number): number {
  if (value === 0) return 0;
  if (max === 0) return 0;

  const ratio = value / max;

  if (ratio <= 0.1) return 1;
  if (ratio <= 0.25) return 2;
  if (ratio <= 0.5) return 3;
  if (ratio <= 0.75) return 4;
  return 5;
}

/**
 * Transform daily stats into heatmap data structure
 */
export function transformToHeatmapData(
  dailyStats: DailyStats[],
  metric: HeatmapMetric,
  days: number = 365
): HeatmapWeek[] {
  const dateRange = getDaysInRange(days);

  // Create a map for quick lookup
  const statsMap = new Map<string, DailyStats>();
  dailyStats.forEach((stat) => {
    const key = stat.date.split('T')[0] ?? '';
    statsMap.set(key, stat);
  });

  // Find max value for intensity calculation
  const maxValue = Math.max(
    1,
    ...dailyStats.map((s) => (metric === 'pages' ? s.pagesRead : s.totalDuration))
  );

  // Build days array with stats
  const heatmapDays: HeatmapDay[] = dateRange.map((date) => {
    const key = formatDateKey(date);
    const stat = statsMap.get(key);

    const pagesRead = stat?.pagesRead ?? 0;
    const duration = stat?.totalDuration ?? 0;
    const value = metric === 'pages' ? pagesRead : duration;

    return {
      date: key,
      dayOfWeek: date.getDay(),
      pagesRead,
      duration,
      intensity: calculateIntensity(value, maxValue),
    };
  });

  // Group into weeks (starting from Sunday)
  const weeks: HeatmapWeek[] = [];
  let currentWeek: HeatmapDay[] = [];

  // Pad first week with empty days if needed
  const firstDayOfWeek = heatmapDays[0]?.dayOfWeek ?? 0;
  for (let i = 0; i < firstDayOfWeek; i++) {
    currentWeek.push({
      date: '',
      dayOfWeek: i,
      pagesRead: 0,
      duration: 0,
      intensity: -1, // -1 means don't render
    });
  }

  heatmapDays.forEach((day) => {
    currentWeek.push(day);

    if (day.dayOfWeek === 6) {
      // Saturday
      weeks.push({ weekIndex: weeks.length, days: currentWeek });
      currentWeek = [];
    }
  });

  // Push remaining days
  if (currentWeek.length > 0) {
    weeks.push({ weekIndex: weeks.length, days: currentWeek });
  }

  return weeks;
}

/**
 * Get month labels for the heatmap
 */
export function getMonthLabels(days: number = 365): { month: string; weekIndex: number }[] {
  const labels: { month: string; weekIndex: number }[] = [];
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - days + 1);

  let currentMonth = -1;
  let weekIndex = 0;
  let dayCount = 0;

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);

    if (date.getMonth() !== currentMonth) {
      currentMonth = date.getMonth();
      labels.push({
        month: date.toLocaleDateString('en-US', { month: 'short' }),
        weekIndex,
      });
    }

    dayCount++;
    if (date.getDay() === 6) {
      weekIndex++;
      dayCount = 0;
    }
  }

  return labels;
}

/**
 * Format duration in seconds to human readable
 */
export function formatDurationShort(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}
