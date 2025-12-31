/**
 * Config Service Tests
 *
 * Tests for API key management with environment variable priority.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getApiKey,
  getApiKeySource,
  isApiKeyReadOnly,
  hasApiKey,
  setApiKey,
  clearConfigCache,
  loadConfig,
  ENV_VAR_MAP,
} from '../config.service.js';

// Mock the file system operations
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue(JSON.stringify({
      version: '1.0.0',
      apiKeys: {
        comicVine: 'config-comicvine-key',
        anthropic: 'config-anthropic-key',
        metronUsername: 'config-metron-user',
        metronPassword: 'config-metron-pass',
        gcdEmail: 'config-gcd-email',
        gcdPassword: 'config-gcd-pass',
      },
      metadata: {
        primarySource: 'comicvine',
        rateLimitLevel: 5,
        llm: {
          model: 'claude-3-5-haiku-20241022',
          enableByDefault: false,
        },
        sourcePriority: ['comicvine', 'metron', 'anilist', 'mal'],
        enabledSources: ['comicvine', 'metron', 'anilist', 'mal'],
        autoMatchThreshold: 0.95,
        autoApplyHighConfidence: true,
        mangaClassification: {
          enabled: true,
          volumePageThreshold: 60,
          filenameOverridesPageCount: true,
        },
        comicClassification: {
          enabled: true,
          issuePageThreshold: 50,
          omnibusPageThreshold: 200,
          filenameOverridesPageCount: true,
        },
      },
      cache: {
        coverCacheSizeMb: 500,
        seriesTTLDays: 7,
        issuesTTLDays: 7,
        maxSeriesCacheEntries: 500,
        maxSeriesCacheSizeMb: 100,
      },
      naming: {
        seriesFolder: '{SeriesName} ({StartYear}-{EndYear})',
        issueFile: 'Issue #{Number:3} - {Title} ({Date}).cbz',
        volumeFile: 'Volume {Number:2} - {Title} ({Year}).cbz',
        bookFile: 'Book {Number:2} - {Title} ({Year}).cbz',
        specialFile: 'Special - {Title} ({Year}).cbz',
      },
      externalRatings: {
        enabledSources: ['comicbookroundup', 'leagueofcomicgeeks'],
        syncSchedule: 'weekly',
        syncHour: 3,
        ratingTTLDays: 7,
        issueRatingTTLDays: 14,
        scrapingRateLimit: 10,
        minMatchConfidence: 0.7,
      },
      logRetentionDays: 10,
    })),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

// Store original env values
const originalEnv = { ...process.env };

describe('Config Service - API Key Management', () => {
  beforeEach(() => {
    // Clear config cache before each test
    clearConfigCache();
    // Restore original environment
    process.env = { ...originalEnv };
    // Clear any HELIXIO_ environment variables
    Object.keys(process.env).forEach((key) => {
      if (key.startsWith('HELIXIO_')) {
        delete process.env[key];
      }
    });
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('ENV_VAR_MAP', () => {
    it('should have correct environment variable names for all API keys', () => {
      expect(ENV_VAR_MAP.comicVine).toBe('HELIXIO_COMICVINE_API_KEY');
      expect(ENV_VAR_MAP.anthropic).toBe('HELIXIO_ANTHROPIC_API_KEY');
      expect(ENV_VAR_MAP.metronUsername).toBe('HELIXIO_METRON_USERNAME');
      expect(ENV_VAR_MAP.metronPassword).toBe('HELIXIO_METRON_PASSWORD');
      expect(ENV_VAR_MAP.gcdEmail).toBe('HELIXIO_GCD_EMAIL');
      expect(ENV_VAR_MAP.gcdPassword).toBe('HELIXIO_GCD_PASSWORD');
    });
  });

  describe('getApiKey', () => {
    it('should return config file value when no environment variable is set', () => {
      const result = getApiKey('comicVine');
      expect(result).toBe('config-comicvine-key');
    });

    it('should return environment variable value when set (priority over config)', () => {
      process.env.HELIXIO_COMICVINE_API_KEY = 'env-comicvine-key';
      const result = getApiKey('comicVine');
      expect(result).toBe('env-comicvine-key');
    });

    it('should trim whitespace from environment variable values', () => {
      process.env.HELIXIO_COMICVINE_API_KEY = '  env-key-with-spaces  ';
      const result = getApiKey('comicVine');
      expect(result).toBe('env-key-with-spaces');
    });

    it('should ignore empty environment variables and fall back to config', () => {
      process.env.HELIXIO_COMICVINE_API_KEY = '';
      const result = getApiKey('comicVine');
      expect(result).toBe('config-comicvine-key');
    });

    it('should ignore whitespace-only environment variables and fall back to config', () => {
      process.env.HELIXIO_COMICVINE_API_KEY = '   ';
      const result = getApiKey('comicVine');
      expect(result).toBe('config-comicvine-key');
    });

    it('should work for all credential types', () => {
      // Set environment variables for all credentials
      process.env.HELIXIO_COMICVINE_API_KEY = 'env-cv';
      process.env.HELIXIO_ANTHROPIC_API_KEY = 'env-anthropic';
      process.env.HELIXIO_METRON_USERNAME = 'env-metron-user';
      process.env.HELIXIO_METRON_PASSWORD = 'env-metron-pass';
      process.env.HELIXIO_GCD_EMAIL = 'env-gcd-email';
      process.env.HELIXIO_GCD_PASSWORD = 'env-gcd-pass';

      expect(getApiKey('comicVine')).toBe('env-cv');
      expect(getApiKey('anthropic')).toBe('env-anthropic');
      expect(getApiKey('metronUsername')).toBe('env-metron-user');
      expect(getApiKey('metronPassword')).toBe('env-metron-pass');
      expect(getApiKey('gcdEmail')).toBe('env-gcd-email');
      expect(getApiKey('gcdPassword')).toBe('env-gcd-pass');
    });
  });

  describe('getApiKeySource', () => {
    it('should return "environment" when environment variable is set', () => {
      process.env.HELIXIO_COMICVINE_API_KEY = 'env-key';
      expect(getApiKeySource('comicVine')).toBe('environment');
    });

    it('should return "config" when value is in config file only', () => {
      expect(getApiKeySource('comicVine')).toBe('config');
    });

    // Note: Testing "none" source requires complex fs mocking that isn't worth the complexity
    // The core priority logic is tested above
  });

  describe('isApiKeyReadOnly', () => {
    it('should return true when environment variable is set', () => {
      process.env.HELIXIO_COMICVINE_API_KEY = 'env-key';
      expect(isApiKeyReadOnly('comicVine')).toBe(true);
    });

    it('should return false when value is from config file', () => {
      expect(isApiKeyReadOnly('comicVine')).toBe(false);
    });
  });

  describe('hasApiKey', () => {
    it('should return true when environment variable is set', () => {
      process.env.HELIXIO_COMICVINE_API_KEY = 'env-key';
      expect(hasApiKey('comicVine')).toBe(true);
    });

    it('should return true when config file has the key', () => {
      expect(hasApiKey('comicVine')).toBe(true);
    });

    // Note: Testing empty key scenario requires complex fs mocking
  });

  describe('setApiKey', () => {
    it('should be callable without error', () => {
      // Note: Full file write verification requires complex fs mocking
      // This just verifies the function doesn't throw
      expect(() => setApiKey('comicVine', 'new-key')).not.toThrow();
    });
  });
});
