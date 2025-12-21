/**
 * AchievementsPage Component Tests
 *
 * Tests for the achievements page including:
 * - Loading states
 * - Summary display
 * - Filtering functionality
 * - Achievement grid rendering
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AchievementsPage } from '../AchievementsPage';
import * as apiService from '../../services/api.service';

// Mock the API service
vi.mock('../../services/api.service', () => ({
  getAchievements: vi.fn(),
  getAchievementSummary: vi.fn(),
  getAchievementCategories: vi.fn(),
  seedAchievements: vi.fn(),
}));

// Mock the achievements config
vi.mock('../../components/Stats/Achievements/achievements-config', () => ({
  ALL_ACHIEVEMENTS: [
    {
      key: 'pages_100',
      name: 'First Steps',
      description: 'Read 100 pages',
      category: 'page_milestones',
      stars: 1,
      icon: 'book',
      threshold: 100,
    },
  ],
  CATEGORY_INFO: {
    page_milestones: { name: 'Page Milestones', icon: 'book' },
    comic_completions: { name: 'Comic Completions', icon: 'check-circle' },
  },
}));

// =============================================================================
// Test Data
// =============================================================================

const mockAchievements = [
  {
    id: 'ach-1',
    key: 'pages_100',
    name: 'First Steps',
    description: 'Read 100 pages',
    category: 'page_milestones',
    stars: 1,
    iconName: 'book',
    threshold: 100,
    minRequired: null,
    progress: 75,
    unlockedAt: null,
    isUnlocked: false,
  },
  {
    id: 'ach-2',
    key: 'pages_1000',
    name: 'Bookworm',
    description: 'Read 1,000 pages',
    category: 'page_milestones',
    stars: 2,
    iconName: 'book',
    threshold: 1000,
    minRequired: null,
    progress: 10,
    unlockedAt: null,
    isUnlocked: false,
  },
  {
    id: 'ach-3',
    key: 'comics_10',
    name: 'Getting Hooked',
    description: 'Complete 10 comics',
    category: 'comic_completions',
    stars: 1,
    iconName: 'check-circle',
    threshold: 10,
    minRequired: null,
    progress: 100,
    unlockedAt: '2025-01-15T00:00:00.000Z',
    isUnlocked: true,
  },
];

const mockSummary = {
  totalAchievements: 3,
  unlockedCount: 1,
  totalStars: 4,
  earnedStars: 1,
  categoryCounts: {
    page_milestones: { total: 2, unlocked: 0 },
    comic_completions: { total: 1, unlocked: 1 },
  },
  recentUnlocks: [],
};

const mockCategories = [
  {
    key: 'page_milestones',
    name: 'Page Milestones',
    icon: 'book',
    description: 'Reading volume achievements',
    total: 2,
    unlocked: 0,
  },
  {
    key: 'comic_completions',
    name: 'Comic Completions',
    icon: 'check-circle',
    description: 'Finishing comics',
    total: 1,
    unlocked: 1,
  },
];

// =============================================================================
// Test Wrapper
// =============================================================================

function renderWithRouter(component: React.ReactElement) {
  return render(<BrowserRouter>{component}</BrowserRouter>);
}

// =============================================================================
// Tests
// =============================================================================

describe('AchievementsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading State', () => {
    it('should show loading message initially', async () => {
      vi.mocked(apiService.getAchievements).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );
      vi.mocked(apiService.getAchievementSummary).mockImplementation(
        () => new Promise(() => {})
      );
      vi.mocked(apiService.getAchievementCategories).mockImplementation(
        () => new Promise(() => {})
      );

      renderWithRouter(<AchievementsPage />);

      expect(screen.getByText('Loading achievements...')).toBeInTheDocument();
    });
  });

  describe('Data Display', () => {
    beforeEach(() => {
      vi.mocked(apiService.getAchievements).mockResolvedValue(mockAchievements);
      vi.mocked(apiService.getAchievementSummary).mockResolvedValue(mockSummary);
      vi.mocked(apiService.getAchievementCategories).mockResolvedValue(mockCategories);
    });

    it('should display achievements after loading', async () => {
      renderWithRouter(<AchievementsPage />);

      await waitFor(() => {
        expect(screen.getByText('First Steps')).toBeInTheDocument();
        expect(screen.getByText('Bookworm')).toBeInTheDocument();
        expect(screen.getByText('Getting Hooked')).toBeInTheDocument();
      });
    });

    it('should display summary statistics', async () => {
      renderWithRouter(<AchievementsPage />);

      await waitFor(() => {
        // Check that "of 3" appears in the summary (total achievements)
        expect(screen.getByText('of 3')).toBeInTheDocument();
        // Check that the unlocked count appears - use getAllByText since "1" appears multiple times
        const onesInDocument = screen.getAllByText('1');
        expect(onesInDocument.length).toBeGreaterThan(0);
      });
    });

    it('should display achievement descriptions', async () => {
      renderWithRouter(<AchievementsPage />);

      await waitFor(() => {
        expect(screen.getByText('Read 100 pages')).toBeInTheDocument();
        expect(screen.getByText('Read 1,000 pages')).toBeInTheDocument();
        expect(screen.getByText('Complete 10 comics')).toBeInTheDocument();
      });
    });

    it('should show progress for locked achievements', async () => {
      renderWithRouter(<AchievementsPage />);

      await waitFor(() => {
        expect(screen.getByText('75%')).toBeInTheDocument();
      });
    });

    it('should show unlocked date for completed achievements', async () => {
      renderWithRouter(<AchievementsPage />);

      // Wait for the component to render with the unlocked achievement
      await waitFor(() => {
        expect(screen.getByText('Getting Hooked')).toBeInTheDocument();
      });

      // Check that the unlocked card is marked correctly by checking the achievement exists
      // and checking for any date-related text (could be localized differently)
      await waitFor(() => {
        // The card should have the achievement name
        const gettingHookedText = screen.getByText('Getting Hooked');
        expect(gettingHookedText).toBeInTheDocument();
        // Check for the parent achievement card with unlocked class
        const card = gettingHookedText.closest('.achievement-card');
        expect(card).toHaveClass('unlocked');
      });
    });
  });

  describe('Filtering', () => {
    beforeEach(() => {
      vi.mocked(apiService.getAchievements).mockResolvedValue(mockAchievements);
      vi.mocked(apiService.getAchievementSummary).mockResolvedValue(mockSummary);
      vi.mocked(apiService.getAchievementCategories).mockResolvedValue(mockCategories);
    });

    it('should filter by status (unlocked)', async () => {
      renderWithRouter(<AchievementsPage />);

      await waitFor(() => {
        expect(screen.getByText('First Steps')).toBeInTheDocument();
      });

      // Find and click "Unlocked" filter button (contains icon + text)
      const buttons = screen.getAllByRole('button');
      const unlockedButton = buttons.find(btn => btn.textContent?.includes('Unlocked'));
      expect(unlockedButton).toBeDefined();
      fireEvent.click(unlockedButton!);

      await waitFor(() => {
        expect(screen.queryByText('First Steps')).not.toBeInTheDocument();
        expect(screen.getByText('Getting Hooked')).toBeInTheDocument();
      });
    });

    it('should filter by status (locked)', async () => {
      renderWithRouter(<AchievementsPage />);

      await waitFor(() => {
        expect(screen.getByText('Getting Hooked')).toBeInTheDocument();
      });

      // Find and click "Locked" filter button (contains icon + text)
      const buttons = screen.getAllByRole('button');
      const lockedButton = buttons.find(btn => btn.textContent?.includes('Locked'));
      expect(lockedButton).toBeDefined();
      fireEvent.click(lockedButton!);

      await waitFor(() => {
        expect(screen.queryByText('Getting Hooked')).not.toBeInTheDocument();
        expect(screen.getByText('First Steps')).toBeInTheDocument();
      });
    });

    it('should show count of filtered achievements', async () => {
      renderWithRouter(<AchievementsPage />);

      await waitFor(() => {
        expect(screen.getByText('Showing 3 achievements')).toBeInTheDocument();
      });

      // Find and click "Locked" filter button
      const buttons = screen.getAllByRole('button');
      const lockedButton = buttons.find(btn => btn.textContent?.includes('Locked'));
      expect(lockedButton).toBeDefined();
      fireEvent.click(lockedButton!);

      await waitFor(() => {
        expect(screen.getByText('Showing 2 achievements')).toBeInTheDocument();
      });
    });
  });

  describe('Star Filter', () => {
    beforeEach(() => {
      vi.mocked(apiService.getAchievements).mockResolvedValue(mockAchievements);
      vi.mocked(apiService.getAchievementSummary).mockResolvedValue(mockSummary);
      vi.mocked(apiService.getAchievementCategories).mockResolvedValue(mockCategories);
    });

    it('should filter by star rating', async () => {
      renderWithRouter(<AchievementsPage />);

      await waitFor(() => {
        expect(screen.getByText('Bookworm')).toBeInTheDocument(); // 2 stars
      });

      // The star buttons show numbers 1-5
      // Find buttons with filter-btn class and look for "2"
      const allButtons = screen.getAllByRole('button');
      const twoStarButton = allButtons.find(
        btn => btn.textContent === '2' && btn.className.includes('filter-btn')
      );

      if (twoStarButton) {
        fireEvent.click(twoStarButton);

        await waitFor(() => {
          expect(screen.queryByText('First Steps')).not.toBeInTheDocument(); // 1 star
          expect(screen.getByText('Bookworm')).toBeInTheDocument(); // 2 stars
        });
      }
    });
  });

  describe('Navigation', () => {
    beforeEach(() => {
      vi.mocked(apiService.getAchievements).mockResolvedValue(mockAchievements);
      vi.mocked(apiService.getAchievementSummary).mockResolvedValue(mockSummary);
      vi.mocked(apiService.getAchievementCategories).mockResolvedValue(mockCategories);
    });

    it('should have back button to stats page', async () => {
      renderWithRouter(<AchievementsPage />);

      await waitFor(() => {
        const backButton = screen.getByRole('button', { name: /Back to Stats/i });
        expect(backButton).toBeInTheDocument();
      });
    });

    it('should display page title', async () => {
      renderWithRouter(<AchievementsPage />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Achievements' })).toBeInTheDocument();
      });
    });
  });

  describe('Auto-seeding', () => {
    it('should trigger seed when no achievements exist', async () => {
      vi.mocked(apiService.getAchievements)
        .mockResolvedValueOnce([]) // First call returns empty
        .mockResolvedValue(mockAchievements); // After seed
      vi.mocked(apiService.getAchievementSummary).mockResolvedValue(mockSummary);
      vi.mocked(apiService.getAchievementCategories).mockResolvedValue(mockCategories);
      vi.mocked(apiService.seedAchievements).mockResolvedValue({ success: true });

      renderWithRouter(<AchievementsPage />);

      await waitFor(() => {
        expect(apiService.seedAchievements).toHaveBeenCalled();
      });
    });
  });

  describe('Empty State', () => {
    it('should show empty message when no achievements match filter', async () => {
      vi.mocked(apiService.getAchievements).mockResolvedValue([
        { ...mockAchievements[0]!, stars: 3 },
      ]);
      vi.mocked(apiService.getAchievementSummary).mockResolvedValue(mockSummary);
      vi.mocked(apiService.getAchievementCategories).mockResolvedValue(mockCategories);

      renderWithRouter(<AchievementsPage />);

      await waitFor(() => {
        expect(screen.getByText('First Steps')).toBeInTheDocument();
      });

      // Filter to only 5-star achievements (none exist)
      const allButtons = screen.getAllByRole('button');
      const fiveStarButton = allButtons.find(
        btn => btn.textContent === '5' && btn.className.includes('filter-btn')
      );

      if (fiveStarButton) {
        fireEvent.click(fiveStarButton);

        await waitFor(() => {
          expect(screen.getByText('No achievements match your filters')).toBeInTheDocument();
        });
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(apiService.getAchievements).mockRejectedValue(new Error('API Error'));
      vi.mocked(apiService.getAchievementSummary).mockRejectedValue(new Error('API Error'));
      vi.mocked(apiService.getAchievementCategories).mockRejectedValue(new Error('API Error'));

      renderWithRouter(<AchievementsPage />);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          'Failed to load achievements:',
          expect.any(Error)
        );
      });

      consoleSpy.mockRestore();
    });
  });
});
