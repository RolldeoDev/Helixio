/**
 * Series Lookup Service
 *
 * Search, identity resolution, and alias management for Series.
 */

import { getDatabase } from '../database.service.js';
import type { Series } from '@prisma/client';

// =============================================================================
// Search Operations
// =============================================================================

/**
 * Search series by name with fuzzy matching.
 * Excludes soft-deleted series by default.
 */
export async function searchSeries(
  query: string,
  limit = 10,
  includeDeleted = false
): Promise<Series[]> {
  const db = getDatabase();

  // Search in name and aliases, exclude soft-deleted by default
  return db.series.findMany({
    where: {
      deletedAt: includeDeleted ? undefined : null,
      OR: [{ name: { contains: query } }, { aliases: { contains: query } }],
    },
    take: limit,
    orderBy: {
      name: 'asc',
    },
  });
}

/**
 * Get a Series by its unique identity (name + publisher only).
 * Year is not part of the identity to avoid splitting multi-year runs.
 * Uses case-insensitive comparison for both name and publisher (via PostgreSQL CITEXT).
 * Excludes soft-deleted series by default.
 */
export async function getSeriesByIdentity(
  name: string,
  _startYear: number | null | undefined, // Kept for API compatibility, but not used in lookup
  publisher: string | null | undefined,
  includeDeleted = false
): Promise<Series | null> {
  const db = getDatabase();

  // CITEXT columns in PostgreSQL handle case-insensitive comparison natively
  return db.series.findFirst({
    where: {
      name,
      publisher: publisher ?? null,
      deletedAt: includeDeleted ? undefined : null,
    },
  });
}

// =============================================================================
// Alias Management
// =============================================================================

/**
 * Add an alias to a series for fuzzy matching.
 */
export async function addAlias(
  seriesId: string,
  alias: string
): Promise<void> {
  const db = getDatabase();

  const series = await db.series.findUnique({
    where: { id: seriesId },
  });

  if (!series) {
    throw new Error(`Series ${seriesId} not found`);
  }

  const aliases = series.aliases
    ? series.aliases.split(',').map((a) => a.trim())
    : [];

  if (!aliases.includes(alias)) {
    aliases.push(alias);

    await db.series.update({
      where: { id: seriesId },
      data: {
        aliases: aliases.join(','),
      },
    });
  }
}

/**
 * Remove an alias from a series.
 */
export async function removeAlias(
  seriesId: string,
  alias: string
): Promise<void> {
  const db = getDatabase();

  const series = await db.series.findUnique({
    where: { id: seriesId },
  });

  if (!series) {
    throw new Error(`Series ${seriesId} not found`);
  }

  const aliases = series.aliases
    ? series.aliases.split(',').map((a) => a.trim())
    : [];

  const index = aliases.indexOf(alias);
  if (index !== -1) {
    aliases.splice(index, 1);

    await db.series.update({
      where: { id: seriesId },
      data: {
        aliases: aliases.length > 0 ? aliases.join(',') : null,
      },
    });
  }
}

/**
 * Find a series by alias.
 * Excludes soft-deleted series by default.
 */
export async function findSeriesByAlias(
  alias: string,
  includeDeleted = false
): Promise<Series | null> {
  const db = getDatabase();

  return db.series.findFirst({
    where: {
      aliases: { contains: alias },
      deletedAt: includeDeleted ? undefined : null,
    },
  });
}

// =============================================================================
// Filter Data
// =============================================================================

/**
 * Get all unique publishers for filtering.
 * Excludes soft-deleted series.
 */
export async function getAllPublishers(): Promise<string[]> {
  const db = getDatabase();

  const series = await db.series.findMany({
    where: {
      publisher: { not: null },
      deletedAt: null,
    },
    select: { publisher: true },
    distinct: ['publisher'],
  });

  return series
    .map((s) => s.publisher)
    .filter((p): p is string => p !== null)
    .sort();
}

/**
 * Get all unique genres for filtering.
 * Uses PostgreSQL unnest() for efficient aggregation instead of loading all series.
 * Excludes soft-deleted series.
 */
export async function getAllGenres(): Promise<string[]> {
  const db = getDatabase();

  // Use PostgreSQL unnest + string_to_array for efficient database-level aggregation
  // This avoids loading 5000+ series into memory just to parse genres
  const result = await db.$queryRaw<Array<{ genre: string }>>`
    SELECT DISTINCT trim(unnest(string_to_array(genres, ','))) as genre
    FROM "Series"
    WHERE genres IS NOT NULL AND "deletedAt" IS NULL
    ORDER BY genre
  `;

  return result.map((r) => r.genre).filter((g) => g.length > 0);
}
