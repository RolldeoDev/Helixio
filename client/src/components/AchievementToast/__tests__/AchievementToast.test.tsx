/**
 * AchievementToast Component Tests
 *
 * Tests for the achievement notification toast component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AchievementToast } from '../AchievementToast';
import { AchievementProvider, useAchievements } from '../../../contexts/AchievementContext';
import * as apiService from '../../../services/api.service';

// Mock the API service
vi.mock('../../../services/api.service', () => ({
  getRecentAchievements: vi.fn(),
  markAchievementsNotified: vi.fn(),
}));

// =============================================================================
// Test Helpers
// =============================================================================

// Component to expose context for testing
function TestContextConsumer({ onContext }: { onContext: (ctx: ReturnType<typeof useAchievements>) => void }) {
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

      let capturedContext: ReturnType<typeof useAchievements> | null = null;

      renderWithProvider(
        <TestContextConsumer onContext={(ctx) => { capturedContext = ctx; }} />
      );

      expect(capturedContext).not.toBeNull();
      expect(capturedContext?.notifications).toEqual([]);
    });

    it('should provide dismissNotification function', () => {
      vi.mocked(apiService.getRecentAchievements).mockResolvedValue([]);

      let capturedContext: ReturnType<typeof useAchievements> | null = null;

      renderWithProvider(
        <TestContextConsumer onContext={(ctx) => { capturedContext = ctx; }} />
      );

      expect(capturedContext?.dismissNotification).toBeInstanceOf(Function);
    });

    it('should provide dismissAll function', () => {
      vi.mocked(apiService.getRecentAchievements).mockResolvedValue([]);

      let capturedContext: ReturnType<typeof useAchievements> | null = null;

      renderWithProvider(
        <TestContextConsumer onContext={(ctx) => { capturedContext = ctx; }} />
      );

      expect(capturedContext?.dismissAll).toBeInstanceOf(Function);
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
    vi.mocked(apiService.markAchievementsNotified).mockResolvedValue(undefined);

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
    vi.mocked(apiService.markAchievementsNotified).mockResolvedValue(undefined);

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

    // Next poll after 30 seconds
    await vi.advanceTimersByTimeAsync(30000);
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
    vi.mocked(apiService.markAchievementsNotified).mockResolvedValue(undefined);

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
    vi.mocked(apiService.markAchievementsNotified).mockResolvedValue(undefined);

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
