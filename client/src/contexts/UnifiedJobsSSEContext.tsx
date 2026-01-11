/**
 * Unified Jobs SSE Context
 *
 * Provides a shared SSE connection for unified jobs updates.
 * All components using this context share a single SSE connection.
 */

import { createContext, useContext, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useJobSSE } from '../hooks/useJobSSE';
import { unifiedJobsKeys } from '../hooks/queries/useUnifiedJobs';
import type { UnifiedJobsStateEvent, UnifiedJobCountEvent } from '../types/sse-events';

// =============================================================================
// Context
// =============================================================================

interface UnifiedJobsSSEContextValue {
  connected: boolean;
  reconnect: () => void;
  disconnect: () => void;
}

const UnifiedJobsSSEContext = createContext<UnifiedJobsSSEContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

interface UnifiedJobsSSEProviderProps {
  children: ReactNode;
}

export function UnifiedJobsSSEProvider({ children }: UnifiedJobsSSEProviderProps) {
  const queryClient = useQueryClient();

  // Create SSE connection (called unconditionally per React rules)
  const sseConnection = useJobSSE({
    endpoint: '/api/jobs/stream',
    enabled: true,

    // Custom event handlers for unified jobs events
    customEvents: {
      // Handle jobs-state event (full state broadcast)
      'jobs-state': (data: unknown) => {
        const event = data as UnifiedJobsStateEvent;

        // Update React Query cache with full state
        queryClient.setQueryData(
          unifiedJobsKeys.list({}),
          (oldData: unknown) => {
            const old = oldData as { success: boolean; data: { schedulers: unknown[] } } | undefined;
            return {
              success: true,
              data: {
                active: event.active,
                history: event.history,
                counts: event.counts,
                // Preserve schedulers from previous state
                schedulers: old?.data?.schedulers || [],
              },
            };
          }
        );
      },

      // Handle job-count event (active count for sidebar badge)
      'job-count': (data: unknown) => {
        const event = data as UnifiedJobCountEvent;

        queryClient.setQueryData(
          unifiedJobsKeys.count(),
          { success: true, count: event.count }
        );
      },
    },

    // Polling fallback when SSE disconnected
    fallbackPoll: () => {
      queryClient.invalidateQueries({ queryKey: unifiedJobsKeys.all });
    },

    // Slow polling interval (60s) when SSE connected
    fallbackInterval: 60000,
  });

  return (
    <UnifiedJobsSSEContext.Provider value={sseConnection}>
      {children}
    </UnifiedJobsSSEContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Use the shared unified jobs SSE connection.
 * Must be used within UnifiedJobsSSEProvider.
 */
export function useUnifiedJobsSSE(): UnifiedJobsSSEContextValue {
  const context = useContext(UnifiedJobsSSEContext);
  if (!context) {
    throw new Error('useUnifiedJobsSSE must be used within UnifiedJobsSSEProvider');
  }
  return context;
}
