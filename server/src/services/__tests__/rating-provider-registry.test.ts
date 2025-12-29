/**
 * Rating Provider Registry Tests
 *
 * Tests for the rating provider registry:
 * - Provider registration and retrieval
 * - Enabled/priority filtering
 * - Rating type and issue support filtering
 * - Availability checking
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RatingProvider, RatingSource } from '../rating-providers/types.js';

// Mock config service
vi.mock('../config.service.js', () => ({
  getExternalRatingsSettings: vi.fn(() => null),
}));

// Mock logger
vi.mock('../logger.service.js', () => ({
  createServiceLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Import after mocking
const {
  register,
  get,
  getAll,
  getAllSources,
  getEnabled,
  getEnabledByPriority,
  getByRatingType,
  getWithIssueSupport,
  has,
  isEnabled,
  count,
  enabledCount,
  clear,
  checkAllAvailability,
} = await import('../rating-providers/registry.js');

const { getExternalRatingsSettings } = await import('../config.service.js');

// =============================================================================
// Mock Providers
// =============================================================================

function createMockProvider(
  name: RatingSource,
  options: {
    displayName?: string;
    supportsIssueRatings?: boolean;
    ratingTypes?: ('community' | 'critic')[];
    available?: boolean;
  } = {}
): RatingProvider {
  return {
    name,
    displayName: options.displayName || name,
    supportsIssueRatings: options.supportsIssueRatings ?? false,
    ratingTypes: options.ratingTypes || ['community'],
    checkAvailability: vi.fn().mockResolvedValue({
      available: options.available ?? true,
    }),
    searchSeries: vi.fn().mockResolvedValue(null),
    getSeriesRatings: vi.fn().mockResolvedValue([]),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('Rating Provider Registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clear(); // Clear registry between tests
    (getExternalRatingsSettings as ReturnType<typeof vi.fn>).mockReturnValue(null);
  });

  // ===========================================================================
  // Registration
  // ===========================================================================

  describe('register', () => {
    it('should register a provider', () => {
      const provider = createMockProvider('comicbookroundup');
      register(provider);

      expect(has('comicbookroundup')).toBe(true);
      expect(count()).toBe(1);
    });

    it('should overwrite existing provider with same name', () => {
      const provider1 = createMockProvider('comicbookroundup', { displayName: 'First' });
      const provider2 = createMockProvider('comicbookroundup', { displayName: 'Second' });

      register(provider1);
      register(provider2);

      expect(count()).toBe(1);
      expect(get('comicbookroundup')?.displayName).toBe('Second');
    });
  });

  // ===========================================================================
  // Retrieval
  // ===========================================================================

  describe('get', () => {
    it('should return provider by source name', () => {
      const provider = createMockProvider('comicbookroundup');
      register(provider);

      expect(get('comicbookroundup')).toBe(provider);
    });

    it('should return undefined for unregistered source', () => {
      expect(get('comicbookroundup')).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return all registered providers', () => {
      register(createMockProvider('comicbookroundup'));
      register(createMockProvider('comicvine'));
      register(createMockProvider('anilist'));

      const all = getAll();
      expect(all).toHaveLength(3);
    });

    it('should return empty array when no providers registered', () => {
      expect(getAll()).toEqual([]);
    });
  });

  describe('getAllSources', () => {
    it('should return all registered source names', () => {
      register(createMockProvider('comicbookroundup'));
      register(createMockProvider('comicvine'));

      const sources = getAllSources();
      expect(sources).toContain('comicbookroundup');
      expect(sources).toContain('comicvine');
    });
  });

  // ===========================================================================
  // Enabled Filtering
  // ===========================================================================

  describe('getEnabled', () => {
    it('should return all providers when no config set', () => {
      register(createMockProvider('comicbookroundup'));
      register(createMockProvider('comicvine'));

      const enabled = getEnabled();
      expect(enabled).toHaveLength(2);
    });

    it('should filter by enabled sources from config', () => {
      register(createMockProvider('comicbookroundup'));
      register(createMockProvider('comicvine'));
      register(createMockProvider('anilist'));

      (getExternalRatingsSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        enabledSources: ['comicbookroundup', 'anilist'],
      });

      const enabled = getEnabled();
      expect(enabled).toHaveLength(2);
      expect(enabled.map((p) => p.name)).toContain('comicbookroundup');
      expect(enabled.map((p) => p.name)).toContain('anilist');
      expect(enabled.map((p) => p.name)).not.toContain('comicvine');
    });

    it('should skip sources not registered', () => {
      register(createMockProvider('comicbookroundup'));

      (getExternalRatingsSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        enabledSources: ['comicbookroundup', 'nonexistent' as RatingSource],
      });

      const enabled = getEnabled();
      expect(enabled).toHaveLength(1);
    });
  });

  describe('getEnabledByPriority', () => {
    it('should return providers in priority order', () => {
      // Register in reverse order
      register(createMockProvider('anilist'));
      register(createMockProvider('metron'));
      register(createMockProvider('comicvine'));
      register(createMockProvider('leagueofcomicgeeks'));
      register(createMockProvider('comicbookroundup'));

      const prioritized = getEnabledByPriority();

      // Should be in priority order
      expect(prioritized[0]!.name).toBe('comicbookroundup');
      expect(prioritized[1]!.name).toBe('leagueofcomicgeeks');
      expect(prioritized[2]!.name).toBe('comicvine');
      expect(prioritized[3]!.name).toBe('metron');
      expect(prioritized[4]!.name).toBe('anilist');
    });

    it('should respect enabled filter with priority order', () => {
      register(createMockProvider('anilist'));
      register(createMockProvider('comicvine'));
      register(createMockProvider('comicbookroundup'));

      (getExternalRatingsSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        enabledSources: ['anilist', 'comicbookroundup'],
      });

      const prioritized = getEnabledByPriority();

      expect(prioritized).toHaveLength(2);
      expect(prioritized[0]!.name).toBe('comicbookroundup');
      expect(prioritized[1]!.name).toBe('anilist');
    });
  });

  // ===========================================================================
  // Type Filtering
  // ===========================================================================

  describe('getByRatingType', () => {
    it('should return providers supporting community ratings', () => {
      register(createMockProvider('comicbookroundup', { ratingTypes: ['community', 'critic'] }));
      register(createMockProvider('anilist', { ratingTypes: ['community'] }));

      const community = getByRatingType('community');
      expect(community).toHaveLength(2);
    });

    it('should return providers supporting critic ratings', () => {
      register(createMockProvider('comicbookroundup', { ratingTypes: ['community', 'critic'] }));
      register(createMockProvider('anilist', { ratingTypes: ['community'] }));

      const critic = getByRatingType('critic');
      expect(critic).toHaveLength(1);
      expect(critic[0]!.name).toBe('comicbookroundup');
    });
  });

  describe('getWithIssueSupport', () => {
    it('should return only providers with issue-level ratings', () => {
      register(createMockProvider('comicbookroundup', { supportsIssueRatings: true }));
      register(createMockProvider('anilist', { supportsIssueRatings: false }));

      const withIssue = getWithIssueSupport();
      expect(withIssue).toHaveLength(1);
      expect(withIssue[0]!.name).toBe('comicbookroundup');
    });
  });

  // ===========================================================================
  // Status Checks
  // ===========================================================================

  describe('has', () => {
    it('should return true for registered source', () => {
      register(createMockProvider('comicbookroundup'));
      expect(has('comicbookroundup')).toBe(true);
    });

    it('should return false for unregistered source', () => {
      expect(has('comicbookroundup')).toBe(false);
    });
  });

  describe('isEnabled', () => {
    it('should return true for enabled and registered source', () => {
      register(createMockProvider('comicbookroundup'));
      expect(isEnabled('comicbookroundup')).toBe(true);
    });

    it('should return false for disabled source', () => {
      register(createMockProvider('comicbookroundup'));

      (getExternalRatingsSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        enabledSources: ['anilist'],
      });

      expect(isEnabled('comicbookroundup')).toBe(false);
    });

    it('should return false for unregistered source', () => {
      expect(isEnabled('comicbookroundup')).toBe(false);
    });
  });

  describe('count and enabledCount', () => {
    it('should return correct counts', () => {
      register(createMockProvider('comicbookroundup'));
      register(createMockProvider('anilist'));
      register(createMockProvider('comicvine'));

      expect(count()).toBe(3);
      expect(enabledCount()).toBe(3);

      (getExternalRatingsSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        enabledSources: ['comicbookroundup'],
      });

      expect(count()).toBe(3); // Still registered
      expect(enabledCount()).toBe(1); // Only 1 enabled
    });
  });

  // ===========================================================================
  // Availability
  // ===========================================================================

  describe('checkAllAvailability', () => {
    it('should check availability of all enabled providers', async () => {
      const p1 = createMockProvider('comicbookroundup', { available: true });
      const p2 = createMockProvider('anilist', { available: false });

      register(p1);
      register(p2);

      const results = await checkAllAvailability();

      expect(results.get('comicbookroundup')).toEqual({ available: true });
      expect(results.get('anilist')).toEqual({ available: false });
      expect(p1.checkAvailability).toHaveBeenCalled();
      expect(p2.checkAvailability).toHaveBeenCalled();
    });

    it('should handle provider errors gracefully', async () => {
      const p1 = createMockProvider('comicbookroundup');
      (p1.checkAvailability as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

      register(p1);

      const results = await checkAllAvailability();

      expect(results.get('comicbookroundup')).toEqual({
        available: false,
        error: 'Network error',
      });
    });
  });

  // ===========================================================================
  // Clear
  // ===========================================================================

  describe('clear', () => {
    it('should remove all registered providers', () => {
      register(createMockProvider('comicbookroundup'));
      register(createMockProvider('anilist'));

      expect(count()).toBe(2);

      clear();

      expect(count()).toBe(0);
      expect(getAll()).toEqual([]);
    });
  });
});
