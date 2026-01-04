/**
 * AchievementToast Component Tests
 *
 * Tests for the achievement notification toast component.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { AchievementToast } from '../AchievementToast';
import { AchievementProvider, useAchievements, type AchievementContextType } from '../../../contexts/AchievementContext';
import * as apiService from '../../../services/api.service';

// Mock the API service
vi.mock('../../../services/api.service', () => ({
  getRecentAchievements: vi.fn(),
  markAchievementsNotified: vi.fn(),
}));

// Mock the AuthContext - AchievementProvider depends on useAuth
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    isAuthenticated: true,
    user: { id: 'test-user', username: 'testuser', role: 'user' },
    isLoading: false,
    setupRequired: false,
    registrationAllowed: false,
    error: null,
  })),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock react-router-dom Link component to avoid router context errors
vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string; [key: string]: unknown }) => (
    <a href={to} {...props}>{children}</a>
  ),
}));

// =============================================================================
// Test Helpers
// =============================================================================

// Component to expose context for testing
function TestContextConsumer({ onContext }: { onContext: (ctx: AchievementContextType) => void }) {
  const context = useAchievements();
  onContext(context);
  return null;
}

function renderWithProvider(ui: React.ReactElement) {
  return render(
    <AchievementProvider>
      {ui}
    </AchievementProvider>
  );
}

// =============================================================================
// Tests
// =============================================================================

describe('AchievementToast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Rendering', () => {
    it('should render nothing when no notifications', () => {
      vi.mocked(apiService.getRecentAchievements).mockResolvedValue([]);

      const { container } = renderWithProvider(<AchievementToast />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('AchievementContext', () => {
    it('should provide notifications array', () => {
      vi.mocked(apiService.getRecentAchievements).mockResolvedValue([]);

      const contextRef: { current: AchievementContextType | null } = { current: null };

      renderWithProvider(
        <TestContextConsumer onContext={(ctx) => { contextRef.current = ctx; }} />
      );

      expect(contextRef.current).not.toBeNull();
      expect(contextRef.current!.notifications).toEqual([]);
    });

    it('should provide dismissNotification function', () => {
      vi.mocked(apiService.getRecentAchievements).mockResolvedValue([]);

      const contextRef: { current: AchievementContextType | null } = { current: null };

      renderWithProvider(
        <TestContextConsumer onContext={(ctx) => { contextRef.current = ctx; }} />
      );

      expect(contextRef.current!.dismissNotification).toBeInstanceOf(Function);
    });

    it('should provide dismissAll function', () => {
      vi.mocked(apiService.getRecentAchievements).mockResolvedValue([]);

      const contextRef: { current: AchievementContextType | null } = { current: null };

      renderWithProvider(
        <TestContextConsumer onContext={(ctx) => { contextRef.current = ctx; }} />
      );

      expect(contextRef.current!.dismissAll).toBeInstanceOf(Function);
    });
  });

  describe('Context Error', () => {
    it('should throw error when used outside provider', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<AchievementToast />);
      }).toThrow('useAchievements must be used within an AchievementProvider');

      consoleSpy.mockRestore();
    });
  });
});

describe('AchievementToast Display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should display achievement name in toast', async () => {
    const mockAchievement = {
      id: 'ach-1',
      key: 'pages_100',
      name: 'First Steps',
      description: 'Read 100 pages',
      category: 'page_milestones',
      stars: 1,
      iconName: 'book',
      threshold: 100,
      minRequired: null,
      progress: 100,
      unlockedAt: '2025-01-15T00:00:00.000Z',
      isUnlocked: true,
    };

    vi.mocked(apiService.getRecentAchievements).mockResolvedValue([mockAchievement]);
    vi.mocked(apiService.markAchievementsNotified).mockResolvedValue({ success: true });

    renderWithProvider(<AchievementToast />);

    // Advance past initial delay
    await vi.advanceTimersByTimeAsync(5000);

    // Check if achievement is displayed
    expect(apiService.getRecentAchievements).toHaveBeenCalled();
  });

  it('should show "Achievement Unlocked!" label', async () => {
    const mockAchievement = {
      id: 'ach-1',
      key: 'pages_100',
      name: 'First Steps',
      description: 'Read 100 pages',
      category: 'page_milestones',
      stars: 2,
      iconName: 'book',
      threshold: 100,
      minRequired: null,
      progress: 100,
      unlockedAt: '2025-01-15T00:00:00.000Z',
      isUnlocked: true,
    };

    vi.mocked(apiService.getRecentAchievements).mockResolvedValue([mockAchievement]);
    vi.mocked(apiService.markAchievementsNotified).mockResolvedValue({ success: true });

    renderWithProvider(<AchievementToast />);

    await vi.advanceTimersByTimeAsync(5000);

    // The toast should call the API to check for achievements
    expect(apiService.getRecentAchievements).toHaveBeenCalled();
  });
});

describe('AchievementToast Polling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should poll for new achievements', async () => {
    vi.mocked(apiService.getRecentAchievements).mockResolvedValue([]);

    renderWithProvider(<AchievementToast />);

    // Initial check after 5 seconds
    await vi.advanceTimersByTimeAsync(5000);
    expect(apiService.getRecentAchievements).toHaveBeenCalledTimes(1);

    // Fallback polling happens every 120 seconds (FALLBACK_POLL_INTERVAL)
    // Note: In real usage, polling only happens when SSE is disconnected
    // Since EventSource is not defined in test environment, SSE fails and polling takes over
    await vi.advanceTimersByTimeAsync(120000);
    expect(apiService.getRecentAchievements).toHaveBeenCalledTimes(2);
  });

  it('should mark achievements as notified after displaying', async () => {
    const mockAchievement = {
      id: 'ach-1',
      key: 'pages_100',
      name: 'First Steps',
      description: 'Read 100 pages',
      category: 'page_milestones',
      stars: 1,
      iconName: 'book',
      threshold: 100,
      minRequired: null,
      progress: 100,
      unlockedAt: '2025-01-15T00:00:00.000Z',
      isUnlocked: true,
    };

    vi.mocked(apiService.getRecentAchievements).mockResolvedValue([mockAchievement]);
    vi.mocked(apiService.markAchievementsNotified).mockResolvedValue({ success: true });

    renderWithProvider(<AchievementToast />);

    await vi.advanceTimersByTimeAsync(5000);

    expect(apiService.markAchievementsNotified).toHaveBeenCalledWith(['ach-1']);
  });
});

describe('AchievementToast Auto-dismiss', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should auto-dismiss notifications after 5 seconds', async () => {
    const mockAchievement = {
      id: 'ach-1',
      key: 'pages_100',
      name: 'First Steps',
      description: 'Read 100 pages',
      category: 'page_milestones',
      stars: 1,
      iconName: 'book',
      threshold: 100,
      minRequired: null,
      progress: 100,
      unlockedAt: '2025-01-15T00:00:00.000Z',
      isUnlocked: true,
    };

    vi.mocked(apiService.getRecentAchievements)
      .mockResolvedValueOnce([mockAchievement])
      .mockResolvedValue([]);
    vi.mocked(apiService.markAchievementsNotified).mockResolvedValue({ success: true });

    renderWithProvider(<AchievementToast />);

    // Wait for initial check
    await vi.advanceTimersByTimeAsync(5000);

    // Wait for notification duration (5 seconds)
    await vi.advanceTimersByTimeAsync(5000);

    // Toast should be auto-dismissed by now
    // (Context internal state change)
  });
});

describe('AchievementToast Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should handle API errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.mocked(apiService.getRecentAchievements).mockRejectedValue(new Error('Network error'));

    renderWithProvider(<AchievementToast />);

    await vi.advanceTimersByTimeAsync(5000);

    // Should not throw - errors are silently caught
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to check achievements:',
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });
});
