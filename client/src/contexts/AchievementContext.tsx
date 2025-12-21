/**
 * Achievement Context
 *
 * Provides achievement notification functionality across the app.
 * Polls for recently unlocked achievements and displays toast notifications.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { getRecentAchievements, markAchievementsNotified, type AchievementWithProgress } from '../services/api.service';

interface AchievementNotification {
  id: string;
  achievement: AchievementWithProgress;
  timestamp: number;
}

interface AchievementContextType {
  notifications: AchievementNotification[];
  dismissNotification: (id: string) => void;
  dismissAll: () => void;
}

const AchievementContext = createContext<AchievementContextType | null>(null);

// Poll interval in milliseconds (check every 30 seconds)
const POLL_INTERVAL = 30000;

// How long to show each notification (5 seconds)
const NOTIFICATION_DURATION = 5000;

// Maximum notifications to show at once
const MAX_NOTIFICATIONS = 3;

interface AchievementProviderProps {
  children: ReactNode;
}

export function AchievementProvider({ children }: AchievementProviderProps) {
  const [notifications, setNotifications] = useState<AchievementNotification[]>([]);
  const [processedIds, setProcessedIds] = useState<Set<string>>(new Set());

  // Dismiss a single notification
  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // Dismiss all notifications
  const dismissAll = useCallback(() => {
    setNotifications([]);
  }, []);

  // Check for new achievements
  const checkAchievements = useCallback(async () => {
    try {
      const recent = await getRecentAchievements(5);

      // Filter to only unnotified achievements we haven't processed in this session
      const newUnlocks = recent.filter(
        a => a.isUnlocked && !processedIds.has(a.id)
      );

      if (newUnlocks.length > 0) {
        // Create notifications for new unlocks
        const newNotifications: AchievementNotification[] = newUnlocks
          .slice(0, MAX_NOTIFICATIONS)
          .map(achievement => ({
            id: `${achievement.id}-${Date.now()}`,
            achievement,
            timestamp: Date.now(),
          }));

        setNotifications(prev => [...prev, ...newNotifications].slice(-MAX_NOTIFICATIONS));

        // Mark as processed locally
        setProcessedIds(prev => {
          const updated = new Set(prev);
          newUnlocks.forEach(a => updated.add(a.id));
          return updated;
        });

        // Mark as notified on the server
        await markAchievementsNotified(newUnlocks.map(a => a.id));
      }
    } catch (error) {
      // Silently fail - achievements are non-critical
      console.debug('Failed to check achievements:', error);
    }
  }, [processedIds]);

  // Set up polling
  useEffect(() => {
    // Initial check (delayed to not interfere with app startup)
    const initialTimeout = setTimeout(checkAchievements, 5000);

    // Regular polling
    const pollInterval = setInterval(checkAchievements, POLL_INTERVAL);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(pollInterval);
    };
  }, [checkAchievements]);

  // Auto-dismiss notifications after duration
  useEffect(() => {
    if (notifications.length === 0) return;

    const now = Date.now();
    const timers = notifications.map(notification => {
      const elapsed = now - notification.timestamp;
      const remaining = Math.max(0, NOTIFICATION_DURATION - elapsed);

      return setTimeout(() => {
        dismissNotification(notification.id);
      }, remaining);
    });

    return () => {
      timers.forEach(timer => clearTimeout(timer));
    };
  }, [notifications, dismissNotification]);

  return (
    <AchievementContext.Provider value={{ notifications, dismissNotification, dismissAll }}>
      {children}
    </AchievementContext.Provider>
  );
}

export function useAchievements() {
  const context = useContext(AchievementContext);
  if (!context) {
    throw new Error('useAchievements must be used within an AchievementProvider');
  }
  return context;
}
