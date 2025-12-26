/**
 * ComicInfo.xml Service
 *
 * Handles reading and writing ComicInfo.xml metadata within comic archives.
 * Follows the ComicRack/Kavita standard format.
 */

import { parseStringPromise, Builder } from 'xml2js';
import { readFile, writeFile } from 'fs/promises';
import {
  listArchiveContents,
  extractSingleFile,
  extractArchive,
  updateFileInArchive,
  createTempDir,
  cleanupTempDir,
} from './archive.service.js';
import { join, basename } from 'path';
import { readdir, stat } from 'fs/promises';
import { createServiceLogger } from './logger.service.js';

const logger = createServiceLogger('comicinfo');

// =============================================================================
// Types
// =============================================================================

/**
 * ComicInfo.xml schema based on ComicRack/Kavita standard.
 * All fields are optional.
 */
export interface ComicInfo {
  // Title Information
  Title?: string;
  Series?: string;
  Number?: string;
  Volume?: number;
  AlternateSeries?: string;
  AlternateNumber?: string;
  AlternateCount?: number;
  Summary?: string;
  Notes?: string;

  // Date Information
  Year?: number;
  Month?: number;
  Day?: number;

  // Credits
  Writer?: string;
  Penciller?: string;
  Inker?: string;
  Colorist?: string;
  Letterer?: string;
  CoverArtist?: string;
  Editor?: string;
  Translator?: string;

  // Publishing
  Publisher?: string;
  Imprint?: string;
  Genre?: string;
  Tags?: string;
  Web?: string;
  PageCount?: number;
  LanguageISO?: string;
  Format?: string;

  // Series Information
  Count?: number;
  SeriesGroup?: string;
  StoryArc?: string;
  StoryArcNumber?: string;

  // Content
  Characters?: string;
  Teams?: string;
  Locations?: string;

  // Reading
  AgeRating?: string;
  BlackAndWhite?: 'Yes' | 'No' | 'Unknown';
  Manga?: 'Yes' | 'No' | 'YesAndRightToLeft';
  ScanInformation?: string;

  // Review
  Review?: string;
  CommunityRating?: number;

  // External IDs
  GTIN?: string;

  // Pages information (optional, complex structure)
  Pages?: {
    Page: Array<{
      $: {
        Image: string;
        Type?: string;
        DoublePage?: string;
        ImageSize?: string;
        Key?: string;
        Bookmark?: string;
        ImageWidth?: string;
        ImageHeight?: string;
      };
    }>;
  };
}

export interface ComicInfoReadResult {
  success: boolean;
  comicInfo?: ComicInfo;
  rawXml?: string;
  error?: string;
}

export interface ComicInfoWriteResult {
  success: boolean;
  error?: string;
}

// =============================================================================
// XML Parsing/Building
// =============================================================================

/**
 * Parse ComicInfo.xml string into ComicInfo object.
 */
export async function parseComicInfoXml(xmlString: string): Promise<ComicInfo> {
  const result = await parseStringPromise(xmlString, {
    explicitArray: false,
    ignoreAttrs: false,
    mergeAttrs: false,
  });

  if (!result.ComicInfo) {
    throw new Error('Invalid ComicInfo.xml: missing ComicInfo root element');
  }

  const ci = result.ComicInfo;

  // Convert numeric fields
  const parseNum = (val: string | undefined): number | undefined => {
    if (val === undefined || val === '') return undefined;
    const num = parseInt(val, 10);
    return isNaN(num) ? undefined : num;
  };

  const parseFloat2 = (val: string | undefined): number | undefined => {
    if (val === undefined || val === '') return undefined;
    const num = parseFloat(val);
    return isNaN(num) ? undefined : num;
  };

  // Build ComicInfo object with proper type conversions
  const comicInfo: ComicInfo = {};

  // String fields
  if (ci.Title) comicInfo.Title = ci.Title;
  if (ci.Series) comicInfo.Series = ci.Series;
  if (ci.Number) comicInfo.Number = ci.Number;
  if (ci.AlternateSeries) comicInfo.AlternateSeries = ci.AlternateSeries;
  if (ci.AlternateNumber) comicInfo.AlternateNumber = ci.AlternateNumber;
  if (ci.Summary) comicInfo.Summary = ci.Summary;
  if (ci.Notes) comicInfo.Notes = ci.Notes;
  if (ci.Writer) comicInfo.Writer = ci.Writer;
  if (ci.Penciller) comicInfo.Penciller = ci.Penciller;
  if (ci.Inker) comicInfo.Inker = ci.Inker;
  if (ci.Colorist) comicInfo.Colorist = ci.Colorist;
  if (ci.Letterer) comicInfo.Letterer = ci.Letterer;
  if (ci.CoverArtist) comicInfo.CoverArtist = ci.CoverArtist;
  if (ci.Editor) comicInfo.Editor = ci.Editor;
  if (ci.Translator) comicInfo.Translator = ci.Translator;
  if (ci.Publisher) comicInfo.Publisher = ci.Publisher;
  if (ci.Imprint) comicInfo.Imprint = ci.Imprint;
  if (ci.Genre) comicInfo.Genre = ci.Genre;
  if (ci.Tags) comicInfo.Tags = ci.Tags;
  if (ci.Web) comicInfo.Web = ci.Web;
  if (ci.LanguageISO) comicInfo.LanguageISO = ci.LanguageISO;
  if (ci.Format) comicInfo.Format = ci.Format;
  if (ci.SeriesGroup) comicInfo.SeriesGroup = ci.SeriesGroup;
  if (ci.StoryArc) comicInfo.StoryArc = ci.StoryArc;
  if (ci.StoryArcNumber) comicInfo.StoryArcNumber = ci.StoryArcNumber;
  if (ci.Characters) comicInfo.Characters = ci.Characters;
  if (ci.Teams) comicInfo.Teams = ci.Teams;
  if (ci.Locations) comicInfo.Locations = ci.Locations;
  if (ci.AgeRating) comicInfo.AgeRating = ci.AgeRating;
  if (ci.ScanInformation) comicInfo.ScanInformation = ci.ScanInformation;
  if (ci.Review) comicInfo.Review = ci.Review;
  if (ci.GTIN) comicInfo.GTIN = ci.GTIN;

  // Numeric fields
  comicInfo.Volume = parseNum(ci.Volume);
  comicInfo.AlternateCount = parseNum(ci.AlternateCount);
  comicInfo.Year = parseNum(ci.Year);
  comicInfo.Month = parseNum(ci.Month);
  comicInfo.Day = parseNum(ci.Day);
  comicInfo.PageCount = parseNum(ci.PageCount);
  comicInfo.Count = parseNum(ci.Count);
  comicInfo.CommunityRating = parseFloat2(ci.CommunityRating);

  // Enum fields
  if (ci.BlackAndWhite === 'Yes' || ci.BlackAndWhite === 'No' || ci.BlackAndWhite === 'Unknown') {
    comicInfo.BlackAndWhite = ci.BlackAndWhite;
  }
  if (ci.Manga === 'Yes' || ci.Manga === 'No' || ci.Manga === 'YesAndRightToLeft') {
    comicInfo.Manga = ci.Manga;
  }

  // Pages (preserve structure)
  if (ci.Pages) {
    comicInfo.Pages = ci.Pages;
  }

  return comicInfo;
}

/**
 * Build ComicInfo.xml string from ComicInfo object.
 */
export function buildComicInfoXml(comicInfo: ComicInfo): string {
  // Build the object structure for xml2js
  const xmlObj: Record<string, unknown> = {};

  // Add fields in standard order
  const fieldOrder = [
    'Title', 'Series', 'Number', 'Volume', 'AlternateSeries', 'AlternateNumber',
    'AlternateCount', 'Summary', 'Notes', 'Year', 'Month', 'Day', 'Writer',
    'Penciller', 'Inker', 'Colorist', 'Letterer', 'CoverArtist', 'Editor',
    'Translator', 'Publisher', 'Imprint', 'Genre', 'Tags', 'Web', 'PageCount',
    'LanguageISO', 'Format', 'Count', 'SeriesGroup', 'StoryArc', 'StoryArcNumber',
    'Characters', 'Teams', 'Locations', 'AgeRating', 'BlackAndWhite', 'Manga',
    'ScanInformation', 'Review', 'CommunityRating', 'GTIN', 'Pages'
  ];

  for (const field of fieldOrder) {
    const value = comicInfo[field as keyof ComicInfo];
    if (value !== undefined && value !== null && value !== '') {
      xmlObj[field] = value;
    }
  }

  const builder = new Builder({
    rootName: 'ComicInfo',
    xmldec: { version: '1.0', encoding: 'UTF-8' },
    renderOpts: { pretty: true, indent: '  ', newline: '\n' },
  });

  return builder.buildObject(xmlObj);
}

// =============================================================================
// Archive Operations
// =============================================================================

/**
 * Read ComicInfo.xml from a comic archive.
 */
export async function readComicInfo(archivePath: string): Promise<ComicInfoReadResult> {
  logger.debug({ archivePath }, 'Reading ComicInfo from archive');
  try {
    // Check if archive has ComicInfo.xml
    logger.debug('Listing archive contents');
    const archiveInfo = await listArchiveContents(archivePath);
    logger.debug({ entryCount: archiveInfo.entries.length, hasComicInfo: archiveInfo.hasComicInfo }, 'Found archive entries');

    const comicInfoEntry = archiveInfo.entries.find(
      (e) => basename(e.path).toLowerCase() === 'comicinfo.xml'
    );

    if (!comicInfoEntry) {
      logger.debug({ firstEntries: archiveInfo.entries.slice(0, 5).map(e => e.path) }, 'ComicInfo.xml not found in entries');
      return {
        success: false,
        error: 'Archive does not contain ComicInfo.xml',
      };
    }

    logger.debug({ comicInfoPath: comicInfoEntry.path }, 'Found ComicInfo.xml');

    // Extract ComicInfo.xml to temp location
    const tempDir = await createTempDir('comicinfo-');
    const tempFile = join(tempDir, 'ComicInfo.xml');
    logger.debug({ tempFile }, 'Extracting to temp');

    try {
      let extractedPath = tempFile;
      const extractResult = await extractSingleFile(
        archivePath,
        comicInfoEntry.path,
        tempFile
      );

      if (!extractResult.success) {
        logger.debug({ error: extractResult.error }, 'Single file extraction failed, trying full extraction');

        // Fallback: extract entire archive and find ComicInfo.xml
        const fullExtractResult = await extractArchive(archivePath, tempDir);

        if (!fullExtractResult.success) {
          logger.debug({ error: fullExtractResult.error }, 'Full extraction also failed');
          return {
            success: false,
            error: fullExtractResult.error || 'Failed to extract archive',
          };
        }

        // Find ComicInfo.xml in extracted files
        logger.debug({ fileCount: fullExtractResult.fileCount }, 'Full extraction succeeded');
        const findComicInfo = async (dir: string): Promise<string | null> => {
          const entries = await readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
              const found = await findComicInfo(fullPath);
              if (found) return found;
            } else if (entry.name.toLowerCase() === 'comicinfo.xml') {
              return fullPath;
            }
          }
          return null;
        };

        const foundPath = await findComicInfo(tempDir);
        if (!foundPath) {
          logger.debug('ComicInfo.xml not found in extracted files');
          return {
            success: false,
            error: 'ComicInfo.xml not found in extracted archive',
          };
        }

        logger.debug({ foundPath }, 'Found ComicInfo.xml in extracted files');
        extractedPath = foundPath;
      }

      logger.debug({ extractedPath }, 'Reading ComicInfo.xml');

      // Read and parse the XML
      const rawXml = await readFile(extractedPath, 'utf-8');
      logger.debug({ size: rawXml.length }, 'Read XML, parsing...');

      const comicInfo = await parseComicInfoXml(rawXml);
      logger.debug({ series: comicInfo.Series, number: comicInfo.Number }, 'Parse successful');

      return {
        success: true,
        comicInfo,
        rawXml,
      };
    } finally {
      await cleanupTempDir(tempDir);
    }
  } catch (err) {
    logger.error({ error: err }, 'Exception reading ComicInfo');
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Write ComicInfo.xml to a comic archive.
 * Creates new or updates existing ComicInfo.xml.
 */
export async function writeComicInfo(
  archivePath: string,
  comicInfo: ComicInfo
): Promise<ComicInfoWriteResult> {
  try {
    const xmlString = buildComicInfoXml(comicInfo);
    const xmlBuffer = Buffer.from(xmlString, 'utf-8');

    const result = await updateFileInArchive(
      archivePath,
      'ComicInfo.xml',
      xmlBuffer
    );

    return result;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Merge new metadata into existing ComicInfo.xml.
 * Only updates fields that are provided, preserves others.
 * Fields in the `removals` array will be deleted from the result.
 */
export async function mergeComicInfo(
  archivePath: string,
  updates: Partial<ComicInfo>,
  removals?: string[]
): Promise<ComicInfoWriteResult> {
  try {
    // Try to read existing ComicInfo
    const existing = await readComicInfo(archivePath);

    // Merge with existing or create new
    const merged: ComicInfo = existing.success && existing.comicInfo
      ? { ...existing.comicInfo, ...updates }
      : { ...updates };

    // Remove fields that were explicitly cleared
    if (removals && removals.length > 0) {
      for (const field of removals) {
        delete (merged as Record<string, unknown>)[field];
      }
    }

    // Write merged result
    return writeComicInfo(archivePath, merged);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Write ComicInfo.xml to a file (not inside archive).
 * Used for folder-level ComicInfo.xml files.
 */
export async function writeComicInfoToFile(
  filePath: string,
  comicInfo: ComicInfo
): Promise<ComicInfoWriteResult> {
  try {
    const xmlString = buildComicInfoXml(comicInfo);
    await writeFile(filePath, xmlString, 'utf-8');
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Read ComicInfo.xml from a file (not inside archive).
 */
export async function readComicInfoFromFile(
  filePath: string
): Promise<ComicInfoReadResult> {
  try {
    const rawXml = await readFile(filePath, 'utf-8');
    const comicInfo = await parseComicInfoXml(rawXml);
    return {
      success: true,
      comicInfo,
      rawXml,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Extract metadata fields as a flat object for database storage.
 */
export function flattenComicInfo(comicInfo: ComicInfo): Record<string, unknown> {
  const flat: Record<string, unknown> = {};

  // Copy all scalar fields
  for (const [key, value] of Object.entries(comicInfo)) {
    if (key !== 'Pages' && value !== undefined && value !== null && value !== '') {
      flat[key] = value;
    }
  }

  // Handle Pages separately (store as JSON)
  if (comicInfo.Pages) {
    flat.pagesJson = JSON.stringify(comicInfo.Pages);
  }

  return flat;
}

/**
 * Parse comma-separated field into array.
 */
export function parseCommaSeparated(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Join array into comma-separated string.
 */
export function joinCommaSeparated(values: string[]): string {
  return values.join(', ');
}

/**
 * Format a date from Year, Month, Day fields.
 */
export function formatComicDate(
  year?: number,
  month?: number,
  day?: number
): string | null {
  if (!year) return null;

  let dateStr = year.toString();
  if (month) {
    dateStr += `-${month.toString().padStart(2, '0')}`;
    if (day) {
      dateStr += `-${day.toString().padStart(2, '0')}`;
    }
  }
  return dateStr;
}

/**
 * Parse a date string into Year, Month, Day components.
 */
export function parseComicDate(dateStr: string): {
  year?: number;
  month?: number;
  day?: number;
} {
  const parts = dateStr.split('-');
  const result: { year?: number; month?: number; day?: number } = {};

  if (parts[0]) {
    const year = parseInt(parts[0], 10);
    if (!isNaN(year)) result.year = year;
  }
  if (parts[1]) {
    const month = parseInt(parts[1], 10);
    if (!isNaN(month) && month >= 1 && month <= 12) result.month = month;
  }
  if (parts[2]) {
    const day = parseInt(parts[2], 10);
    if (!isNaN(day) && day >= 1 && day <= 31) result.day = day;
  }

  return result;
}

/**
 * Get display title from ComicInfo.
 */
export function getDisplayTitle(comicInfo: ComicInfo): string {
  if (comicInfo.Title) return comicInfo.Title;
  if (comicInfo.Series && comicInfo.Number) {
    return `${comicInfo.Series} #${comicInfo.Number}`;
  }
  if (comicInfo.Series) return comicInfo.Series;
  return 'Unknown';
}

/**
 * Alias for mergeComicInfo - updates ComicInfo.xml with new values.
 * Merges the provided updates into existing metadata.
 */
export const updateComicInfo = mergeComicInfo;
