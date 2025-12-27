/**
 * useAchievements Hook
 *
 * React Query hooks for achievements with automatic polling for notifications.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryClient';
import {
  getAchievements,
  getAchievementSummary,
  getRecentAchievements,
  markAchievementsNotified,
  getUnlockedAchievements,
} from '../../services/api/series';
import type { AchievementWithProgress, AchievementSummary } from '../../services/api/series';

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Fetch all achievements with progress
 */
export function useAchievements() {
  return useQuery({
    queryKey: queryKeys.achievements.list(),
    queryFn: getAchievements,
    staleTime: 60 * 1000, // Achievements don't change often
  });
}

/**
 * Fetch achievement summary (total counts)
 */
export function useAchievementSummary() {
  return useQuery({
    queryKey: queryKeys.achievements.summary(),
    queryFn: getAchievementSummary,
    staleTime: 60 * 1000,
  });
}

/**
 * Fetch unlocked achievements only
 */
export function useUnlockedAchievements() {
  return useQuery({
    queryKey: ['achievements', 'unlocked'] as const,
    queryFn: getUnlockedAchievements,
    staleTime: 60 * 1000,
  });
}

/**
 * Poll for recent achievement notifications
 *
 * This replaces the manual polling in AchievementContext.
 * Uses refetchInterval for automatic polling every 30 seconds.
 */
export function useRecentAchievements(limit = 5) {
  return useQuery({
    queryKey: queryKeys.achievements.recent(limit),
    queryFn: () => getRecentAchievements(limit),
    refetchInterval: 30 * 1000, // Poll every 30 seconds
    staleTime: 5 * 1000,
  });
}

/**
 * Get recent achievements that haven't been notified yet
 * For displaying in-app notifications
 */
export function useUnnotifiedAchievements(limit = 5) {
  const { data: achievements = [], ...rest } = useRecentAchievements(limit);

  // Filter to only unlocked achievements (these are what need notification)
  const unnotified = achievements.filter((a) => a.unlockedAt && a.isUnlocked);

  return {
    ...rest,
    data: unnotified,
    hasUnnotified: unnotified.length > 0,
  };
}

// =============================================================================
// Mutation Hooks
// =============================================================================

/**
 * Mark achievements as notified (user has seen them)
 */
export function useMarkAchievementsNotified() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAchievementsNotified,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.achievements.recent() });
    },
  });
}

// =============================================================================
// Utility Hooks
// =============================================================================

/**
 * Invalidate all achievement queries
 */
export function useInvalidateAchievements() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.achievements.all });
  };
}

// Re-export types for convenience
export type { AchievementWithProgress, AchievementSummary };
