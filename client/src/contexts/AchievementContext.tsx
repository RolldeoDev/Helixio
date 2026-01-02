/**
 * Achievement Context
 *
 * Provides achievement notification functionality across the app.
 * Uses SSE for real-time notifications with polling as fallback.
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { getRecentAchievements, markAchievementsNotified, type AchievementWithProgress } from '../services/api.service';
import { useAuth } from './AuthContext';

interface AchievementNotification {
  id: string;
  achievement: AchievementWithProgress;
  timestamp: number;
}

export interface AchievementContextType {
  notifications: AchievementNotification[];
  dismissNotification: (id: string) => void;
  dismissAll: () => void;
  pauseTimers: () => void;
  resumeTimers: () => void;
}

const AchievementContext = createContext<AchievementContextType | null>(null);

// Fallback poll interval (2 minutes - only used if SSE fails)
const FALLBACK_POLL_INTERVAL = 120000;

// How long to show each notification (5 seconds)
const NOTIFICATION_DURATION = 5000;

// Maximum notifications to show at once
const MAX_NOTIFICATIONS = 3;

// SSE reconnect delay (5 seconds)
const SSE_RECONNECT_DELAY = 5000;

interface AchievementProviderProps {
  children: ReactNode;
}

// BroadcastChannel for cross-tab coordination
const ACHIEVEMENT_CHANNEL_NAME = 'helixio-achievements';

export function AchievementProvider({ children }: AchievementProviderProps) {
  const { isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<AchievementNotification[]>([]);
  const [processedIds, setProcessedIds] = useState<Set<string>>(new Set());
  const [sseConnected, setSseConnected] = useState(false);
  const [timersPaused, setTimersPaused] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // Pause all auto-dismiss timers (when user hovers over toasts)
  const pauseTimers = useCallback(() => {
    setTimersPaused(true);
  }, []);

  // Resume auto-dismiss timers
  const resumeTimers = useCallback(() => {
    setTimersPaused(false);
    // Reset timestamps so timers restart fresh
    setNotifications(prev => prev.map(n => ({ ...n, timestamp: Date.now() })));
  }, []);

  // Dismiss a single notification
  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // Dismiss all notifications
  const dismissAll = useCallback(() => {
    setNotifications([]);
  }, []);

  // Mark achievement as processed without showing toast (for cross-tab sync)
  const markAsProcessed = useCallback((achievementId: string) => {
    setProcessedIds(prev => {
      const updated = new Set(prev);
      updated.add(achievementId);
      return updated;
    });
  }, []);

  // Add notification from achievement data
  const addNotification = useCallback((achievement: AchievementWithProgress, showToast = true) => {
    const notificationId = `${achievement.id}-${Date.now()}`;

    // Skip if already processed
    if (processedIds.has(achievement.id)) return;

    // Mark as processed
    setProcessedIds(prev => {
      const updated = new Set(prev);
      updated.add(achievement.id);
      return updated;
    });

    // Broadcast to other tabs so they don't show duplicate toasts
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({
        type: 'achievement-processed',
        achievementId: achievement.id,
      });
    }

    // Only show toast if requested (false when received from broadcast)
    if (showToast) {
      const notification: AchievementNotification = {
        id: notificationId,
        achievement,
        timestamp: Date.now(),
      };
      setNotifications(prev => [...prev, notification].slice(-MAX_NOTIFICATIONS));
    }

    // Mark as notified on server (fire and forget)
    markAchievementsNotified([achievement.id]).catch(() => {
      // Will retry on next poll
    });
  }, [processedIds]);

  // Connect to SSE stream
  const connectSSE = useCallback(() => {
    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    try {
      const eventSource = new EventSource('/api/achievements/stream', {
        withCredentials: true,
      });

      eventSource.onopen = () => {
        setSseConnected(true);
        console.debug('Achievement SSE connected');
        // Immediately check for any missed achievements when SSE connects
        checkAchievements();
      };

      eventSource.addEventListener('achievement-unlocked', (event) => {
        try {
          const data = JSON.parse(event.data);
          const achievement = data.achievement as AchievementWithProgress;

          // Use the complete achievement data from SSE payload
          // The server now sends all required fields including progress, isUnlocked, unlockedAt
          addNotification({
            ...achievement,
            // Use server values, with fallbacks for backwards compatibility
            isUnlocked: achievement.isUnlocked ?? true,
            unlockedAt: achievement.unlockedAt ?? new Date().toISOString(),
            progress: achievement.progress ?? 100,
          });
        } catch (error) {
          console.debug('Failed to parse achievement event:', error);
        }
      });

      eventSource.onerror = () => {
        setSseConnected(false);
        eventSource.close();
        eventSourceRef.current = null;

        // Schedule reconnect
        reconnectTimeoutRef.current = setTimeout(() => {
          console.debug('Attempting SSE reconnect...');
          connectSSE();
        }, SSE_RECONNECT_DELAY);
      };

      eventSourceRef.current = eventSource;
    } catch (error) {
      console.debug('Failed to create EventSource:', error);
      setSseConnected(false);
    }
  }, [addNotification]);

  // Fallback polling check for achievements
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

  // Set up BroadcastChannel for cross-tab coordination
  useEffect(() => {
    // Create broadcast channel for cross-tab sync
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(ACHIEVEMENT_CHANNEL_NAME);

      channel.onmessage = (event) => {
        if (event.data?.type === 'achievement-processed') {
          // Another tab already handled this achievement, just mark as processed
          markAsProcessed(event.data.achievementId);
        }
      };

      broadcastChannelRef.current = channel;

      return () => {
        channel.close();
        broadcastChannelRef.current = null;
      };
    }
  }, [markAsProcessed]);

  // Set up SSE connection and fallback polling (only when authenticated)
  useEffect(() => {
    // Don't connect if not authenticated
    if (!isAuthenticated) {
      // Clean up any existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      setSseConnected(false);
      return;
    }

    // Connect to SSE
    connectSSE();

    // Initial poll check (delayed to not interfere with app startup)
    const initialTimeout = setTimeout(checkAchievements, 5000);

    // Fallback polling (at slower rate since SSE is primary)
    const pollInterval = setInterval(() => {
      // Only poll if SSE is disconnected
      if (!sseConnected) {
        checkAchievements();
      }
    }, FALLBACK_POLL_INTERVAL);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(pollInterval);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [isAuthenticated, connectSSE, checkAchievements]);

  // Auto-dismiss notifications after duration (pauses when user hovers)
  useEffect(() => {
    if (notifications.length === 0 || timersPaused) return;

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
  }, [notifications, dismissNotification, timersPaused]);

  return (
    <AchievementContext.Provider value={{ notifications, dismissNotification, dismissAll, pauseTimers, resumeTimers }}>
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
