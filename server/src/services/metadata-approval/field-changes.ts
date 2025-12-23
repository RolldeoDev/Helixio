/**
 * Metadata Approval Field Changes
 *
 * Converts API issue data into field changes for approval.
 */

import { getDatabase } from '../database.service.js';
import { readComicInfo } from '../comicinfo.service.js';
import type { ComicVineIssue } from '../comicvine.service.js';
import type { MetronIssue } from '../metron.service.js';
import type { SeriesMatch, FieldChange } from './types.js';
import {
  classifyMangaFile,
  generateDisplayTitle,
  type MangaClassificationResult,
} from '../manga-classification.service.js';
import { getMangaClassificationSettings } from '../config.service.js';

// =============================================================================
// Current Metadata Extraction
// =============================================================================

/**
 * Get current metadata from a file (from ComicInfo.xml or database cache)
 */
async function getCurrentMetadata(
  fileId: string
): Promise<Record<string, string | number | null>> {
  const prisma = getDatabase();

  const file = await prisma.comicFile.findUnique({
    where: { id: fileId },
    include: { metadata: true },
  });

  if (!file) {
    return {};
  }

  // Try to read ComicInfo.xml from the archive
  try {
    const result = await readComicInfo(file.path);
    const comicInfo = result.comicInfo;
    if (comicInfo) {
      return {
        // Basic Info
        series: comicInfo.Series ?? null,
        number: comicInfo.Number ?? null,
        title: comicInfo.Title ?? null,
        volume: comicInfo.Volume ?? null,
        alternateSeries: comicInfo.AlternateSeries ?? null,
        alternateNumber: comicInfo.AlternateNumber ?? null,
        alternateCount: comicInfo.AlternateCount ?? null,
        summary: comicInfo.Summary ?? null,
        notes: comicInfo.Notes ?? null,
        // Dates
        year: comicInfo.Year ?? null,
        month: comicInfo.Month ?? null,
        day: comicInfo.Day ?? null,
        // Credits
        writer: comicInfo.Writer ?? null,
        penciller: comicInfo.Penciller ?? null,
        inker: comicInfo.Inker ?? null,
        colorist: comicInfo.Colorist ?? null,
        letterer: comicInfo.Letterer ?? null,
        coverArtist: comicInfo.CoverArtist ?? null,
        editor: comicInfo.Editor ?? null,
        translator: comicInfo.Translator ?? null,
        // Content
        characters: comicInfo.Characters ?? null,
        teams: comicInfo.Teams ?? null,
        locations: comicInfo.Locations ?? null,
        storyArc: comicInfo.StoryArc ?? null,
        storyArcNumber: comicInfo.StoryArcNumber ?? null,
        // Publishing
        publisher: comicInfo.Publisher ?? null,
        imprint: comicInfo.Imprint ?? null,
        genre: comicInfo.Genre ?? null,
        tags: comicInfo.Tags ?? null,
        format: comicInfo.Format ?? null,
        pageCount: comicInfo.PageCount ?? null,
        languageISO: comicInfo.LanguageISO ?? null,
        web: comicInfo.Web ?? null,
        gtin: comicInfo.GTIN ?? null,
        count: comicInfo.Count ?? null,
        seriesGroup: comicInfo.SeriesGroup ?? null,
        // Ratings
        ageRating: comicInfo.AgeRating ?? null,
        manga: comicInfo.Manga ?? null,
        blackAndWhite: comicInfo.BlackAndWhite ?? null,
        communityRating: comicInfo.CommunityRating ?? null,
        review: comicInfo.Review ?? null,
        // Scan Info
        scanInformation: comicInfo.ScanInformation ?? null,
      };
    }
  } catch {
    // Fall through to cached metadata
  }

  // Use cached metadata as fallback
  if (file.metadata) {
    return {
      series: file.metadata.series,
      number: file.metadata.number,
      title: file.metadata.title,
      volume: file.metadata.volume,
      year: file.metadata.year,
      month: file.metadata.month,
      day: file.metadata.day,
      writer: file.metadata.writer,
      penciller: file.metadata.penciller,
      inker: file.metadata.inker,
      colorist: file.metadata.colorist,
      letterer: file.metadata.letterer,
      coverArtist: file.metadata.coverArtist,
      editor: file.metadata.editor,
      publisher: file.metadata.publisher,
      summary: file.metadata.summary,
      genre: file.metadata.genre,
      characters: file.metadata.characters,
      teams: file.metadata.teams,
      locations: file.metadata.locations,
      storyArc: file.metadata.storyArc,
    };
  }

  return {};
}

// =============================================================================
// Field Change Builders
// =============================================================================

/**
 * Build field changes by comparing current and proposed metadata
 */
function buildFieldChanges(
  currentMetadata: Record<string, string | number | null>,
  proposedMetadata: Record<string, string | number | null>
): Record<string, FieldChange> {
  const fields: Record<string, FieldChange> = {};
  const allKeys = new Set([...Object.keys(currentMetadata), ...Object.keys(proposedMetadata)]);

  for (const key of allKeys) {
    const current = currentMetadata[key] ?? null;
    const proposed = proposedMetadata[key] ?? null;

    // Only include if there's a proposed value and it's different from current
    if (proposed !== null && proposed !== current) {
      fields[key] = {
        current,
        proposed,
        approved: true, // Default to approved
        edited: false,
      };
    }
  }

  return fields;
}

/**
 * Parse date string into year, month, day components
 */
function parseCoverDate(coverDate: string | undefined): {
  year: number | null;
  month: number | null;
  day: number | null;
} {
  let year: number | null = null;
  let month: number | null = null;
  let day: number | null = null;

  if (coverDate) {
    const dateParts = coverDate.split('-');
    if (dateParts[0]) year = parseInt(dateParts[0], 10);
    if (dateParts[1]) month = parseInt(dateParts[1], 10);
    if (dateParts[2]) day = parseInt(dateParts[2], 10);
  }

  return { year, month, day };
}

// =============================================================================
// ComicVine Field Changes
// =============================================================================

/**
 * Convert ComicVine issue to field changes
 */
export async function issueToFieldChanges(
  fileId: string,
  issue: ComicVineIssue,
  seriesMatch: SeriesMatch
): Promise<Record<string, FieldChange>> {
  const currentMetadata = await getCurrentMetadata(fileId);

  // Build proposed metadata from issue
  const personCredits = issue.person_credits || [];
  const getCreators = (role: string): string =>
    personCredits
      .filter((p) => p.role.toLowerCase().includes(role.toLowerCase()))
      .map((p) => p.name)
      .join(', ');

  const { year, month, day } = parseCoverDate(issue.cover_date);

  // Parse volume aliases for alternate series
  const parseAliases = (aliases?: string): string | null => {
    if (!aliases) return null;
    const aliasList = aliases.split('\n').map(a => a.trim()).filter(a => a.length > 0);
    return aliasList[0] ?? null;
  };

  const proposedMetadata: Record<string, string | number | null> = {
    // Basic Info
    series: seriesMatch.name,
    number: issue.issue_number,
    title: issue.name ?? null,
    summary: issue.description?.replace(/<[^>]*>/g, '').substring(0, 2000) ?? null, // Strip HTML
    alternateSeries: parseAliases(issue.aliases) ?? null,
    // Dates
    year,
    month,
    day,
    // Credits
    writer: getCreators('writer') || null,
    penciller: getCreators('pencil') || null,
    inker: getCreators('ink') || null,
    colorist: getCreators('color') || null,
    letterer: getCreators('letter') || null,
    coverArtist: getCreators('cover') || null,
    editor: getCreators('editor') || null,
    // Content
    characters: issue.character_credits?.map((c) => c.name).join(', ') ?? null,
    teams: issue.team_credits?.map((t) => t.name).join(', ') ?? null,
    locations: issue.location_credits?.map((l) => l.name).join(', ') ?? null,
    storyArc: issue.story_arc_credits?.map((s) => s.name).join(', ') ?? null,
    // Publishing Info
    publisher: seriesMatch.publisher ?? null,
    count: seriesMatch.issueCount ?? null,
    web: issue.site_detail_url ?? null,
  };

  return buildFieldChanges(currentMetadata, proposedMetadata);
}

// =============================================================================
// Metron Field Changes
// =============================================================================

/**
 * Convert Metron issue to field changes
 */
export async function metronIssueToFieldChanges(
  fileId: string,
  issue: MetronIssue,
  seriesMatch: SeriesMatch
): Promise<Record<string, FieldChange>> {
  const currentMetadata = await getCurrentMetadata(fileId);

  // Build proposed metadata from Metron issue
  const credits = issue.credits || [];
  const getCreatorsByRole = (roleName: string): string | null => {
    const creators = credits.filter((c) =>
      c.role.some((r) => r.name.toLowerCase().includes(roleName.toLowerCase()))
    );
    if (creators.length === 0) return null;
    return creators.map((c) => c.creator).join(', ');
  };

  const { year, month, day } = parseCoverDate(issue.cover_date);

  const proposedMetadata: Record<string, string | number | null> = {
    // Basic Info
    series: seriesMatch.name,
    number: issue.number,
    title: issue.title ?? null,
    summary: issue.desc ?? null,
    // Dates
    year,
    month,
    day,
    // Credits
    writer: getCreatorsByRole('writer'),
    penciller: getCreatorsByRole('pencil') || getCreatorsByRole('artist'),
    inker: getCreatorsByRole('ink'),
    colorist: getCreatorsByRole('color'),
    letterer: getCreatorsByRole('letter'),
    coverArtist: getCreatorsByRole('cover'),
    editor: getCreatorsByRole('editor'),
    // Content
    characters: issue.characters?.map((c) => c.name).join(', ') ?? null,
    teams: issue.teams?.map((t) => t.name).join(', ') ?? null,
    storyArc: issue.arcs?.map((a) => a.name).join(', ') ?? null,
    // Publishing Info
    publisher: seriesMatch.publisher ?? null,
    pageCount: issue.page ?? null,
    count: seriesMatch.issueCount ?? null,
    gtin: issue.upc || issue.isbn || null,
    web: issue.resource_url ?? null,
  };

  return buildFieldChanges(currentMetadata, proposedMetadata);
}

// =============================================================================
// Manga Field Changes (Chapter-Only Mode)
// =============================================================================

/**
 * Options for manga chapter field changes
 */
export interface MangaChapterOptions {
  /** Pre-computed classification result (to avoid re-parsing) */
  classification?: MangaClassificationResult;
  /** Page count for classification (if not pre-computed) */
  pageCount?: number;
  /** Filename for classification (if not pre-computed) */
  filename?: string;
}

/**
 * Convert manga series metadata + parsed chapter number to field changes.
 *
 * Used for AniList and MAL sources which don't provide per-chapter metadata.
 * Applies series-level metadata with the chapter number parsed from the filename.
 * Includes smart chapter/volume classification based on page count.
 */
export async function mangaChapterToFieldChanges(
  fileId: string,
  chapterNumber: string,
  seriesMatch: SeriesMatch,
  options: MangaChapterOptions = {}
): Promise<Record<string, FieldChange>> {
  const currentMetadata = await getCurrentMetadata(fileId);
  const settings = getMangaClassificationSettings();

  // Get or compute classification
  let classification = options.classification;
  if (!classification && settings.enabled && options.filename && options.pageCount !== undefined) {
    classification = classifyMangaFile(options.filename, options.pageCount, settings);
  }

  // Get all creators from the series match
  // Note: SeriesCredit interface doesn't have role info, so we get all creators
  // For manga, typically all creators are author/artist anyway
  const getAllCreators = (): string | null => {
    if (!seriesMatch.creators) return null;
    const creators = seriesMatch.creators.map((c) => c.name);
    return creators.length > 0 ? creators.join(', ') : null;
  };

  // Determine display title based on classification
  let displayTitle: string | null = null;
  if (classification && settings.enabled) {
    displayTitle = classification.displayTitle;
  }

  // Determine the primary number to use
  const primaryNumber = classification?.primaryNumber || chapterNumber;

  const proposedMetadata: Record<string, string | number | null> = {
    // Basic Info
    series: seriesMatch.name,
    number: primaryNumber,
    title: displayTitle, // Use generated display title
    summary: seriesMatch.description ?? null,

    // Dates - use series start year for manga
    year: seriesMatch.startYear ?? null,
    month: null,
    day: null,

    // Credits - apply series-level creators (inheritance)
    // For manga, we apply all creators to both writer and penciller
    // since manga typically has author/artist doing both
    writer: getAllCreators(),
    penciller: getAllCreators(),

    // Content - from series level
    characters: seriesMatch.characters?.map((c) => c.name).join(', ') ?? null,

    // Publishing Info
    publisher: seriesMatch.publisher ?? null,
    count: seriesMatch.issueCount ?? null,
    web: seriesMatch.url ?? null,

    // Manga-specific
    manga: 'Yes', // Mark as manga format
    format: classification?.contentType === 'volume' ? 'Volume' : 'Chapter',

    // Manga classification fields (new)
    contentType: classification?.contentType ?? null,
    parsedVolume: classification?.volume ?? null,
    parsedChapter: classification?.chapter ?? null,
  };

  return buildFieldChanges(currentMetadata, proposedMetadata);
}
