/**
 * API Key Scopes Tests
 *
 * Tests for scope validation, role-based access, and implied permissions.
 */

import { describe, it, expect } from 'vitest';
import {
  API_SCOPES,
  SCOPE_PRESETS,
  SCOPE_CATEGORIES,
  isValidScope,
  isAdminScope,
  filterValidScopes,
  filterNonAdminScopes,
  getAvailableScopesForRole,
  validateScopesForRole,
  scopeGrantsAccess,
  type ApiScope,
} from '../api-key-scopes.js';

describe('API Key Scopes', () => {
  // ==========================================================================
  // Constants Tests
  // ==========================================================================

  describe('API_SCOPES constant', () => {
    it('contains all expected scopes', () => {
      const allScopes = Object.keys(API_SCOPES);

      // Should have 20 scopes total
      expect(allScopes).toHaveLength(20);

      // Check for expected scope categories
      expect(allScopes).toContain('library:read');
      expect(allScopes).toContain('library:write');
      expect(allScopes).toContain('progress:read');
      expect(allScopes).toContain('progress:write');
      expect(allScopes).toContain('collections:read');
      expect(allScopes).toContain('collections:write');
      expect(allScopes).toContain('metadata:read');
      expect(allScopes).toContain('metadata:write');
      expect(allScopes).toContain('stats:read');
      expect(allScopes).toContain('achievements:read');
      expect(allScopes).toContain('files:read');
      expect(allScopes).toContain('files:download');
      expect(allScopes).toContain('opds:read');
      expect(allScopes).toContain('queue:read');
      expect(allScopes).toContain('queue:write');
      expect(allScopes).toContain('series:read');
      expect(allScopes).toContain('series:write');
      expect(allScopes).toContain('admin:users');
      expect(allScopes).toContain('admin:system');
      expect(allScopes).toContain('admin:api-keys');
    });

    it('has descriptions for all scopes', () => {
      for (const [scope, description] of Object.entries(API_SCOPES) as [string, string][]) {
        expect(description).toBeTruthy();
        expect(typeof description).toBe('string');
        expect(description.length).toBeGreaterThan(5);
      }
    });
  });

  describe('SCOPE_PRESETS constant', () => {
    it('contains all expected presets', () => {
      expect(Object.keys(SCOPE_PRESETS)).toEqual([
        'read-only',
        'full-access',
        'opds-only',
        'sync-client',
        'automation',
      ]);
    });

    it('read-only preset contains only read scopes', () => {
      const readOnlyScopes = SCOPE_PRESETS['read-only'];

      for (const scope of readOnlyScopes) {
        expect(scope).toMatch(/:read$/);
      }
    });

    it('full-access preset excludes admin scopes', () => {
      const fullAccessScopes = SCOPE_PRESETS['full-access'];

      for (const scope of fullAccessScopes) {
        expect(scope).not.toMatch(/^admin:/);
      }
    });

    it('opds-only preset has minimal required scopes', () => {
      const opdsScopes = SCOPE_PRESETS['opds-only'];

      expect(opdsScopes).toContain('opds:read');
      expect(opdsScopes).toContain('library:read');
      expect(opdsScopes).toContain('files:read');
      expect(opdsScopes).toHaveLength(3);
    });

    it('all presets contain only valid scopes', () => {
      for (const [presetName, scopes] of Object.entries(SCOPE_PRESETS) as [string, ApiScope[]][]) {
        for (const scope of scopes) {
          expect(isValidScope(scope)).toBe(true);
        }
      }
    });
  });

  describe('SCOPE_CATEGORIES constant', () => {
    it('contains all expected categories', () => {
      expect(Object.keys(SCOPE_CATEGORIES)).toEqual([
        'Library',
        'Reading',
        'Collections',
        'Metadata',
        'Series',
        'Statistics',
        'Files',
        'Admin',
      ]);
    });

    it('Admin category contains only admin scopes', () => {
      const adminScopes = SCOPE_CATEGORIES.Admin;

      for (const scope of adminScopes) {
        expect(scope).toMatch(/^admin:/);
      }
    });

    it('categories cover all scopes', () => {
      const allCategorizedScopes = Object.values(SCOPE_CATEGORIES).flat();
      const allDefinedScopes = Object.keys(API_SCOPES);

      // Every scope should be in at least one category
      for (const scope of allDefinedScopes) {
        expect(allCategorizedScopes).toContain(scope);
      }
    });
  });

  // ==========================================================================
  // isValidScope Tests
  // ==========================================================================

  describe('isValidScope', () => {
    it('returns true for all valid scopes', () => {
      const allScopes = Object.keys(API_SCOPES);

      for (const scope of allScopes) {
        expect(isValidScope(scope)).toBe(true);
      }
    });

    it('returns false for invalid scopes', () => {
      expect(isValidScope('invalid:scope')).toBe(false);
      expect(isValidScope('library:delete')).toBe(false);
      expect(isValidScope('')).toBe(false);
      expect(isValidScope('library')).toBe(false);
      expect(isValidScope('read')).toBe(false);
      expect(isValidScope('admin')).toBe(false);
    });

    it('returns false for similar but incorrect scopes', () => {
      expect(isValidScope('Library:read')).toBe(false); // wrong case
      expect(isValidScope('library:Read')).toBe(false); // wrong case
      expect(isValidScope('library: read')).toBe(false); // space
      expect(isValidScope('library:read ')).toBe(false); // trailing space
    });
  });

  // ==========================================================================
  // isAdminScope Tests
  // ==========================================================================

  describe('isAdminScope', () => {
    it('returns true for admin scopes', () => {
      expect(isAdminScope('admin:users')).toBe(true);
      expect(isAdminScope('admin:system')).toBe(true);
      expect(isAdminScope('admin:api-keys')).toBe(true);
    });

    it('returns false for non-admin scopes', () => {
      expect(isAdminScope('library:read')).toBe(false);
      expect(isAdminScope('library:write')).toBe(false);
      expect(isAdminScope('progress:read')).toBe(false);
      expect(isAdminScope('files:download')).toBe(false);
    });

    it('returns true for any string starting with admin:', () => {
      // Even invalid scopes that start with admin: are considered admin scopes
      expect(isAdminScope('admin:invalid')).toBe(true);
      expect(isAdminScope('admin:anything')).toBe(true);
    });

    it('returns false for empty or non-admin strings', () => {
      expect(isAdminScope('')).toBe(false);
      expect(isAdminScope('admin')).toBe(false);
      expect(isAdminScope('administrator:users')).toBe(false);
    });
  });

  // ==========================================================================
  // filterValidScopes Tests
  // ==========================================================================

  describe('filterValidScopes', () => {
    it('keeps all valid scopes', () => {
      const scopes = ['library:read', 'library:write', 'progress:read'];
      const result = filterValidScopes(scopes);

      expect(result).toEqual(['library:read', 'library:write', 'progress:read']);
    });

    it('removes invalid scopes', () => {
      const scopes = ['library:read', 'invalid:scope', 'progress:read', 'fake'];
      const result = filterValidScopes(scopes);

      expect(result).toEqual(['library:read', 'progress:read']);
    });

    it('returns empty array when all scopes are invalid', () => {
      const scopes = ['invalid', 'fake:scope', 'wrong'];
      const result = filterValidScopes(scopes);

      expect(result).toEqual([]);
    });

    it('handles empty array', () => {
      const result = filterValidScopes([]);
      expect(result).toEqual([]);
    });

    it('handles mixed valid and invalid scopes', () => {
      const scopes = [
        'library:read',
        '',
        'admin:users',
        'not:valid',
        'files:download',
        'Library:read', // wrong case
      ];
      const result = filterValidScopes(scopes);

      expect(result).toEqual(['library:read', 'admin:users', 'files:download']);
    });
  });

  // ==========================================================================
  // filterNonAdminScopes Tests
  // ==========================================================================

  describe('filterNonAdminScopes', () => {
    it('removes admin scopes from list', () => {
      const scopes: ApiScope[] = ['library:read', 'admin:users', 'progress:read', 'admin:system'];
      const result = filterNonAdminScopes(scopes);

      expect(result).toEqual(['library:read', 'progress:read']);
    });

    it('keeps all scopes when no admin scopes present', () => {
      const scopes: ApiScope[] = ['library:read', 'library:write', 'files:read'];
      const result = filterNonAdminScopes(scopes);

      expect(result).toEqual(['library:read', 'library:write', 'files:read']);
    });

    it('returns empty array when all scopes are admin', () => {
      const scopes: ApiScope[] = ['admin:users', 'admin:system', 'admin:api-keys'];
      const result = filterNonAdminScopes(scopes);

      expect(result).toEqual([]);
    });

    it('handles empty array', () => {
      const result = filterNonAdminScopes([]);
      expect(result).toEqual([]);
    });
  });

  // ==========================================================================
  // getAvailableScopesForRole Tests
  // ==========================================================================

  describe('getAvailableScopesForRole', () => {
    it('admin role gets all scopes including admin scopes', () => {
      const scopes = getAvailableScopesForRole('admin');

      expect(scopes).toContain('admin:users');
      expect(scopes).toContain('admin:system');
      expect(scopes).toContain('admin:api-keys');
      expect(scopes).toContain('library:read');
      expect(scopes).toContain('library:write');
      expect(scopes).toHaveLength(Object.keys(API_SCOPES).length);
    });

    it('user role gets all non-admin scopes', () => {
      const scopes = getAvailableScopesForRole('user');

      // Should not have admin scopes
      expect(scopes).not.toContain('admin:users');
      expect(scopes).not.toContain('admin:system');
      expect(scopes).not.toContain('admin:api-keys');

      // Should have all other scopes
      expect(scopes).toContain('library:read');
      expect(scopes).toContain('library:write');
      expect(scopes).toContain('files:download');

      const allNonAdminScopes = Object.keys(API_SCOPES).filter(s => !s.startsWith('admin:'));
      expect(scopes).toHaveLength(allNonAdminScopes.length);
    });

    it('guest role gets read-only scopes', () => {
      const scopes = getAvailableScopesForRole('guest');

      // Should match read-only preset
      expect(scopes).toEqual(SCOPE_PRESETS['read-only']);

      // Should not have write scopes
      expect(scopes).not.toContain('library:write');
      expect(scopes).not.toContain('progress:write');
      expect(scopes).not.toContain('collections:write');

      // Should not have admin scopes
      expect(scopes).not.toContain('admin:users');

      // Should not have download
      expect(scopes).not.toContain('files:download');
    });
  });

  // ==========================================================================
  // validateScopesForRole Tests
  // ==========================================================================

  describe('validateScopesForRole', () => {
    describe('admin role', () => {
      it('allows all valid scopes', () => {
        const allScopes = Object.keys(API_SCOPES);
        const result = validateScopesForRole(allScopes, 'admin');

        expect(result.valid).toBe(true);
        expect(result.invalidScopes).toEqual([]);
      });

      it('rejects invalid scopes', () => {
        const scopes = ['library:read', 'invalid:scope', 'admin:users'];
        const result = validateScopesForRole(scopes, 'admin');

        expect(result.valid).toBe(false);
        expect(result.invalidScopes).toContain('invalid:scope');
      });
    });

    describe('user role', () => {
      it('allows non-admin scopes', () => {
        const scopes = ['library:read', 'library:write', 'files:download'];
        const result = validateScopesForRole(scopes, 'user');

        expect(result.valid).toBe(true);
        expect(result.invalidScopes).toEqual([]);
      });

      it('rejects admin scopes with appropriate message', () => {
        const scopes = ['library:read', 'admin:users'];
        const result = validateScopesForRole(scopes, 'user');

        expect(result.valid).toBe(false);
        expect(result.invalidScopes).toContain('admin:users');
        expect(result.reason).toBe('Admin scopes require admin role');
      });

      it('rejects all admin scopes', () => {
        const scopes = ['admin:users', 'admin:system', 'admin:api-keys'];
        const result = validateScopesForRole(scopes, 'user');

        expect(result.valid).toBe(false);
        expect(result.invalidScopes).toHaveLength(3);
        expect(result.reason).toBe('Admin scopes require admin role');
      });
    });

    describe('guest role', () => {
      it('allows read-only scopes', () => {
        const scopes = ['library:read', 'progress:read', 'files:read'];
        const result = validateScopesForRole(scopes, 'guest');

        expect(result.valid).toBe(true);
        expect(result.invalidScopes).toEqual([]);
      });

      it('rejects write scopes', () => {
        const scopes = ['library:read', 'library:write'];
        const result = validateScopesForRole(scopes, 'guest');

        expect(result.valid).toBe(false);
        expect(result.invalidScopes).toContain('library:write');
        expect(result.reason).toBe('One or more scopes are invalid or not available for your role');
      });

      it('rejects download scope', () => {
        const scopes = ['files:read', 'files:download'];
        const result = validateScopesForRole(scopes, 'guest');

        expect(result.valid).toBe(false);
        expect(result.invalidScopes).toContain('files:download');
      });

      it('rejects admin scopes with admin message', () => {
        const scopes = ['library:read', 'admin:users'];
        const result = validateScopesForRole(scopes, 'guest');

        expect(result.valid).toBe(false);
        expect(result.invalidScopes).toContain('admin:users');
        expect(result.reason).toBe('Admin scopes require admin role');
      });
    });

    it('handles empty scopes array', () => {
      const result = validateScopesForRole([], 'user');

      expect(result.valid).toBe(true);
      expect(result.invalidScopes).toEqual([]);
    });

    it('identifies multiple invalid scopes', () => {
      const scopes = ['library:read', 'invalid1', 'invalid2', 'admin:users'];
      const result = validateScopesForRole(scopes, 'user');

      expect(result.valid).toBe(false);
      expect(result.invalidScopes).toContain('invalid1');
      expect(result.invalidScopes).toContain('invalid2');
      expect(result.invalidScopes).toContain('admin:users');
    });
  });

  // ==========================================================================
  // scopeGrantsAccess Tests
  // ==========================================================================

  describe('scopeGrantsAccess', () => {
    describe('direct match', () => {
      it('returns true for exact scope match', () => {
        expect(scopeGrantsAccess(['library:read'], 'library:read')).toBe(true);
        expect(scopeGrantsAccess(['admin:users'], 'admin:users')).toBe(true);
      });

      it('returns true when scope is in list of multiple', () => {
        const scopes = ['library:read', 'progress:read', 'files:read'];
        expect(scopeGrantsAccess(scopes, 'progress:read')).toBe(true);
      });

      it('returns false when scope is not in list', () => {
        const scopes = ['library:read', 'progress:read'];
        expect(scopeGrantsAccess(scopes, 'library:write')).toBe(false);
      });
    });

    describe('write implies read', () => {
      it('library:write implies library:read', () => {
        expect(scopeGrantsAccess(['library:write'], 'library:read')).toBe(true);
      });

      it('progress:write implies progress:read', () => {
        expect(scopeGrantsAccess(['progress:write'], 'progress:read')).toBe(true);
      });

      it('collections:write implies collections:read', () => {
        expect(scopeGrantsAccess(['collections:write'], 'collections:read')).toBe(true);
      });

      it('metadata:write implies metadata:read', () => {
        expect(scopeGrantsAccess(['metadata:write'], 'metadata:read')).toBe(true);
      });

      it('queue:write implies queue:read', () => {
        expect(scopeGrantsAccess(['queue:write'], 'queue:read')).toBe(true);
      });

      it('series:write implies series:read', () => {
        expect(scopeGrantsAccess(['series:write'], 'series:read')).toBe(true);
      });
    });

    describe('implied access does not work in reverse', () => {
      it('library:read does NOT imply library:write', () => {
        expect(scopeGrantsAccess(['library:read'], 'library:write')).toBe(false);
      });

      it('progress:read does NOT imply progress:write', () => {
        expect(scopeGrantsAccess(['progress:read'], 'progress:write')).toBe(false);
      });
    });

    describe('no implied access for non-paired scopes', () => {
      it('files:read does not imply files:download', () => {
        expect(scopeGrantsAccess(['files:read'], 'files:download')).toBe(false);
      });

      it('files:download does not imply files:read', () => {
        expect(scopeGrantsAccess(['files:download'], 'files:read')).toBe(false);
      });

      it('stats:read has no implied scopes', () => {
        expect(scopeGrantsAccess(['stats:read'], 'achievements:read')).toBe(false);
      });

      it('admin scopes have no implied access', () => {
        expect(scopeGrantsAccess(['admin:users'], 'admin:system')).toBe(false);
        expect(scopeGrantsAccess(['admin:system'], 'admin:users')).toBe(false);
      });
    });

    describe('empty scopes', () => {
      it('returns false for empty granted scopes', () => {
        expect(scopeGrantsAccess([], 'library:read')).toBe(false);
      });
    });

    describe('complex scenarios', () => {
      it('handles multiple scopes with implied access', () => {
        const scopes = ['library:write', 'progress:read', 'files:download'];

        // Direct matches
        expect(scopeGrantsAccess(scopes, 'library:write')).toBe(true);
        expect(scopeGrantsAccess(scopes, 'progress:read')).toBe(true);
        expect(scopeGrantsAccess(scopes, 'files:download')).toBe(true);

        // Implied from library:write
        expect(scopeGrantsAccess(scopes, 'library:read')).toBe(true);

        // Not granted
        expect(scopeGrantsAccess(scopes, 'progress:write')).toBe(false);
        expect(scopeGrantsAccess(scopes, 'collections:read')).toBe(false);
      });
    });
  });
});
