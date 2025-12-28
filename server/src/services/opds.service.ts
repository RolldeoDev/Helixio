/**
 * OPDS Service
 *
 * Generates OPDS (Open Publication Distribution System) feeds for third-party readers.
 * Supports OPDS 1.2 catalog format with streaming acquisition links.
 */

import { PrismaClient } from '@prisma/client';
import * as path from 'path';

const prisma = new PrismaClient();

// =============================================================================
// Types
// =============================================================================

export interface OPDSLink {
  rel: string;
  href: string;
  type: string;
  title?: string;
}

export interface OPDSAuthor {
  name: string;
  uri?: string;
}

export interface OPDSEntry {
  id: string;
  title: string;
  updated: string;
  authors?: OPDSAuthor[];
  summary?: string;
  content?: string;
  links: OPDSLink[];
  categories?: string[];
}

export interface OPDSFeed {
  id: string;
  title: string;
  updated: string;
  author?: OPDSAuthor;
  links: OPDSLink[];
  entries: OPDSEntry[];
  totalResults?: number;
  itemsPerPage?: number;
  startIndex?: number;
}

// =============================================================================
// Constants
// =============================================================================

const OPDS_MIME_TYPES = {
  feed: 'application/atom+xml;profile=opds-catalog;kind=navigation',
  acquisition: 'application/atom+xml;profile=opds-catalog;kind=acquisition',
  search: 'application/opensearchdescription+xml',
  cbz: 'application/vnd.comicbook+zip',
  cbr: 'application/vnd.comicbook-rar',
  image: 'image/jpeg',
};

// =============================================================================
// XML Generation Helpers
// =============================================================================

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(date: Date): string {
  return date.toISOString();
}

function generateLinkXml(link: OPDSLink): string {
  let xml = `<link rel="${escapeXml(link.rel)}" href="${escapeXml(link.href)}" type="${escapeXml(link.type)}"`;
  if (link.title) {
    xml += ` title="${escapeXml(link.title)}"`;
  }
  xml += '/>';
  return xml;
}

function generateEntryXml(entry: OPDSEntry): string {
  let xml = '<entry>\n';
  xml += `  <id>${escapeXml(entry.id)}</id>\n`;
  xml += `  <title>${escapeXml(entry.title)}</title>\n`;
  xml += `  <updated>${entry.updated}</updated>\n`;

  if (entry.authors) {
    for (const author of entry.authors) {
      xml += '  <author>\n';
      xml += `    <name>${escapeXml(author.name)}</name>\n`;
      if (author.uri) {
        xml += `    <uri>${escapeXml(author.uri)}</uri>\n`;
      }
      xml += '  </author>\n';
    }
  }

  if (entry.summary) {
    xml += `  <summary type="text">${escapeXml(entry.summary)}</summary>\n`;
  }

  if (entry.content) {
    xml += `  <content type="html">${escapeXml(entry.content)}</content>\n`;
  }

  if (entry.categories) {
    for (const category of entry.categories) {
      xml += `  <category term="${escapeXml(category)}"/>\n`;
    }
  }

  for (const link of entry.links) {
    xml += `  ${generateLinkXml(link)}\n`;
  }

  xml += '</entry>';
  return xml;
}

export function generateFeedXml(feed: OPDSFeed): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<feed xmlns="http://www.w3.org/2005/Atom"\n';
  xml += '      xmlns:opds="http://opds-spec.org/2010/catalog"\n';
  xml += '      xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">\n';

  xml += `  <id>${escapeXml(feed.id)}</id>\n`;
  xml += `  <title>${escapeXml(feed.title)}</title>\n`;
  xml += `  <updated>${feed.updated}</updated>\n`;

  if (feed.author) {
    xml += '  <author>\n';
    xml += `    <name>${escapeXml(feed.author.name)}</name>\n`;
    xml += '  </author>\n';
  }

  for (const link of feed.links) {
    xml += `  ${generateLinkXml(link)}\n`;
  }

  if (feed.totalResults !== undefined) {
    xml += `  <opensearch:totalResults>${feed.totalResults}</opensearch:totalResults>\n`;
  }
  if (feed.itemsPerPage !== undefined) {
    xml += `  <opensearch:itemsPerPage>${feed.itemsPerPage}</opensearch:itemsPerPage>\n`;
  }
  if (feed.startIndex !== undefined) {
    xml += `  <opensearch:startIndex>${feed.startIndex}</opensearch:startIndex>\n`;
  }

  for (const entry of feed.entries) {
    xml += `  ${generateEntryXml(entry)}\n`;
  }

  xml += '</feed>';
  return xml;
}

// =============================================================================
// Feed Generators
// =============================================================================

export async function generateRootFeed(baseUrl: string): Promise<string> {
  const libraries = await prisma.library.findMany({
    orderBy: { name: 'asc' },
  });

  const feed: OPDSFeed = {
    id: `${baseUrl}/opds`,
    title: 'Helixio Comic Library',
    updated: formatDate(new Date()),
    author: { name: 'Helixio' },
    links: [
      { rel: 'self', href: `${baseUrl}/opds`, type: OPDS_MIME_TYPES.feed },
      { rel: 'start', href: `${baseUrl}/opds`, type: OPDS_MIME_TYPES.feed },
      { rel: 'search', href: `${baseUrl}/opds/search.xml`, type: OPDS_MIME_TYPES.search },
    ],
    entries: [
      // All Comics entry
      {
        id: `${baseUrl}/opds/all`,
        title: 'All Comics',
        updated: formatDate(new Date()),
        content: 'Browse all comics in your library',
        links: [
          { rel: 'subsection', href: `${baseUrl}/opds/all`, type: OPDS_MIME_TYPES.acquisition },
        ],
      },
      // Recent entry
      {
        id: `${baseUrl}/opds/recent`,
        title: 'Recently Added',
        updated: formatDate(new Date()),
        content: 'Recently added comics',
        links: [
          { rel: 'subsection', href: `${baseUrl}/opds/recent`, type: OPDS_MIME_TYPES.acquisition },
        ],
      },
      // By Series entry
      {
        id: `${baseUrl}/opds/series`,
        title: 'By Series',
        updated: formatDate(new Date()),
        content: 'Browse comics by series',
        links: [
          { rel: 'subsection', href: `${baseUrl}/opds/series`, type: OPDS_MIME_TYPES.feed },
        ],
      },
      // By Publisher entry
      {
        id: `${baseUrl}/opds/publishers`,
        title: 'By Publisher',
        updated: formatDate(new Date()),
        content: 'Browse comics by publisher',
        links: [
          { rel: 'subsection', href: `${baseUrl}/opds/publishers`, type: OPDS_MIME_TYPES.feed },
        ],
      },
      // Libraries
      ...libraries.map((lib) => ({
        id: `${baseUrl}/opds/library/${lib.id}`,
        title: lib.name,
        updated: formatDate(lib.updatedAt),
        content: `Browse ${lib.name} library`,
        links: [
          { rel: 'subsection', href: `${baseUrl}/opds/library/${lib.id}`, type: OPDS_MIME_TYPES.acquisition },
        ],
      })),
    ],
  };

  return generateFeedXml(feed);
}

export async function generateAllComicsFeed(
  baseUrl: string,
  page: number = 1,
  pageSize: number = 50
): Promise<string> {
  const skip = (page - 1) * pageSize;

  const [comics, total] = await Promise.all([
    prisma.comicFile.findMany({
      where: { status: 'indexed' },
      include: { metadata: true },
      orderBy: [
        { metadata: { series: 'asc' } },
        { metadata: { number: 'asc' } },
        { filename: 'asc' },
      ],
      skip,
      take: pageSize,
    }),
    prisma.comicFile.count({ where: { status: 'indexed' } }),
  ]);

  const entries = comics.map((comic) => createComicEntry(comic, baseUrl));

  const feed: OPDSFeed = {
    id: `${baseUrl}/opds/all`,
    title: 'All Comics',
    updated: formatDate(new Date()),
    totalResults: total,
    itemsPerPage: pageSize,
    startIndex: skip + 1,
    links: [
      { rel: 'self', href: `${baseUrl}/opds/all?page=${page}`, type: OPDS_MIME_TYPES.acquisition },
      { rel: 'start', href: `${baseUrl}/opds`, type: OPDS_MIME_TYPES.feed },
    ],
    entries,
  };

  // Add pagination links
  if (page > 1) {
    feed.links.push({
      rel: 'previous',
      href: `${baseUrl}/opds/all?page=${page - 1}`,
      type: OPDS_MIME_TYPES.acquisition,
    });
  }
  if (skip + pageSize < total) {
    feed.links.push({
      rel: 'next',
      href: `${baseUrl}/opds/all?page=${page + 1}`,
      type: OPDS_MIME_TYPES.acquisition,
    });
  }

  return generateFeedXml(feed);
}

export async function generateRecentFeed(baseUrl: string, limit: number = 50): Promise<string> {
  const comics = await prisma.comicFile.findMany({
    where: { status: 'indexed' },
    include: { metadata: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  const entries = comics.map((comic) => createComicEntry(comic, baseUrl));

  const feed: OPDSFeed = {
    id: `${baseUrl}/opds/recent`,
    title: 'Recently Added',
    updated: formatDate(new Date()),
    links: [
      { rel: 'self', href: `${baseUrl}/opds/recent`, type: OPDS_MIME_TYPES.acquisition },
      { rel: 'start', href: `${baseUrl}/opds`, type: OPDS_MIME_TYPES.feed },
    ],
    entries,
  };

  return generateFeedXml(feed);
}

export async function generateSeriesListFeed(baseUrl: string): Promise<string> {
  const seriesData = await prisma.fileMetadata.groupBy({
    by: ['series'],
    where: { series: { not: null } },
    _count: { series: true },
    orderBy: { series: 'asc' },
  });

  const entries = seriesData
    .filter((s) => s.series)
    .map((s) => ({
      id: `${baseUrl}/opds/series/${encodeURIComponent(s.series!)}`,
      title: s.series!,
      updated: formatDate(new Date()),
      content: `${s._count.series} issues`,
      links: [
        {
          rel: 'subsection',
          href: `${baseUrl}/opds/series/${encodeURIComponent(s.series!)}`,
          type: OPDS_MIME_TYPES.acquisition,
        },
      ],
    }));

  const feed: OPDSFeed = {
    id: `${baseUrl}/opds/series`,
    title: 'Series',
    updated: formatDate(new Date()),
    links: [
      { rel: 'self', href: `${baseUrl}/opds/series`, type: OPDS_MIME_TYPES.feed },
      { rel: 'start', href: `${baseUrl}/opds`, type: OPDS_MIME_TYPES.feed },
    ],
    entries,
  };

  return generateFeedXml(feed);
}

export async function generateSeriesFeed(baseUrl: string, series: string): Promise<string> {
  const comics = await prisma.comicFile.findMany({
    where: {
      status: 'indexed',
      metadata: { series },
    },
    include: { metadata: true },
    orderBy: [
      { metadata: { issueNumberSort: { sort: 'asc', nulls: 'last' } } },
      { filename: 'asc' },
    ],
  });

  const entries = comics.map((comic) => createComicEntry(comic, baseUrl));

  const feed: OPDSFeed = {
    id: `${baseUrl}/opds/series/${encodeURIComponent(series)}`,
    title: series,
    updated: formatDate(new Date()),
    links: [
      { rel: 'self', href: `${baseUrl}/opds/series/${encodeURIComponent(series)}`, type: OPDS_MIME_TYPES.acquisition },
      { rel: 'start', href: `${baseUrl}/opds`, type: OPDS_MIME_TYPES.feed },
      { rel: 'up', href: `${baseUrl}/opds/series`, type: OPDS_MIME_TYPES.feed },
    ],
    entries,
  };

  return generateFeedXml(feed);
}

export async function generatePublisherListFeed(baseUrl: string): Promise<string> {
  const publisherData = await prisma.fileMetadata.groupBy({
    by: ['publisher'],
    where: { publisher: { not: null } },
    _count: { publisher: true },
    orderBy: { publisher: 'asc' },
  });

  const entries = publisherData
    .filter((p) => p.publisher)
    .map((p) => ({
      id: `${baseUrl}/opds/publishers/${encodeURIComponent(p.publisher!)}`,
      title: p.publisher!,
      updated: formatDate(new Date()),
      content: `${p._count.publisher} comics`,
      links: [
        {
          rel: 'subsection',
          href: `${baseUrl}/opds/publishers/${encodeURIComponent(p.publisher!)}`,
          type: OPDS_MIME_TYPES.acquisition,
        },
      ],
    }));

  const feed: OPDSFeed = {
    id: `${baseUrl}/opds/publishers`,
    title: 'Publishers',
    updated: formatDate(new Date()),
    links: [
      { rel: 'self', href: `${baseUrl}/opds/publishers`, type: OPDS_MIME_TYPES.feed },
      { rel: 'start', href: `${baseUrl}/opds`, type: OPDS_MIME_TYPES.feed },
    ],
    entries,
  };

  return generateFeedXml(feed);
}

export async function generatePublisherFeed(baseUrl: string, publisher: string): Promise<string> {
  const comics = await prisma.comicFile.findMany({
    where: {
      status: 'indexed',
      metadata: { publisher },
    },
    include: { metadata: true },
    orderBy: [
      { metadata: { series: 'asc' } },
      { metadata: { number: 'asc' } },
    ],
  });

  const entries = comics.map((comic) => createComicEntry(comic, baseUrl));

  const feed: OPDSFeed = {
    id: `${baseUrl}/opds/publishers/${encodeURIComponent(publisher)}`,
    title: publisher,
    updated: formatDate(new Date()),
    links: [
      { rel: 'self', href: `${baseUrl}/opds/publishers/${encodeURIComponent(publisher)}`, type: OPDS_MIME_TYPES.acquisition },
      { rel: 'start', href: `${baseUrl}/opds`, type: OPDS_MIME_TYPES.feed },
      { rel: 'up', href: `${baseUrl}/opds/publishers`, type: OPDS_MIME_TYPES.feed },
    ],
    entries,
  };

  return generateFeedXml(feed);
}

export async function generateLibraryFeed(
  baseUrl: string,
  libraryId: string,
  page: number = 1,
  pageSize: number = 50
): Promise<string> {
  const library = await prisma.library.findUnique({
    where: { id: libraryId },
  });

  if (!library) {
    throw new Error('Library not found');
  }

  const skip = (page - 1) * pageSize;

  const [comics, total] = await Promise.all([
    prisma.comicFile.findMany({
      where: { libraryId, status: 'indexed' },
      include: { metadata: true },
      orderBy: [
        { metadata: { series: 'asc' } },
        { metadata: { number: 'asc' } },
        { filename: 'asc' },
      ],
      skip,
      take: pageSize,
    }),
    prisma.comicFile.count({ where: { libraryId, status: 'indexed' } }),
  ]);

  const entries = comics.map((comic) => createComicEntry(comic, baseUrl));

  const feed: OPDSFeed = {
    id: `${baseUrl}/opds/library/${libraryId}`,
    title: library.name,
    updated: formatDate(library.updatedAt),
    totalResults: total,
    itemsPerPage: pageSize,
    startIndex: skip + 1,
    links: [
      { rel: 'self', href: `${baseUrl}/opds/library/${libraryId}?page=${page}`, type: OPDS_MIME_TYPES.acquisition },
      { rel: 'start', href: `${baseUrl}/opds`, type: OPDS_MIME_TYPES.feed },
    ],
    entries,
  };

  // Add pagination links
  if (page > 1) {
    feed.links.push({
      rel: 'previous',
      href: `${baseUrl}/opds/library/${libraryId}?page=${page - 1}`,
      type: OPDS_MIME_TYPES.acquisition,
    });
  }
  if (skip + pageSize < total) {
    feed.links.push({
      rel: 'next',
      href: `${baseUrl}/opds/library/${libraryId}?page=${page + 1}`,
      type: OPDS_MIME_TYPES.acquisition,
    });
  }

  return generateFeedXml(feed);
}

export async function generateSearchFeed(
  baseUrl: string,
  query: string,
  page: number = 1,
  pageSize: number = 50
): Promise<string> {
  const skip = (page - 1) * pageSize;

  const searchTerms = query.toLowerCase().split(/\s+/).filter(Boolean);

  const [comics, total] = await Promise.all([
    prisma.comicFile.findMany({
      where: {
        status: 'indexed',
        OR: [
          { filename: { contains: query } },
          { metadata: { series: { contains: query } } },
          { metadata: { title: { contains: query } } },
          { metadata: { writer: { contains: query } } },
          { metadata: { publisher: { contains: query } } },
        ],
      },
      include: { metadata: true },
      orderBy: { filename: 'asc' },
      skip,
      take: pageSize,
    }),
    prisma.comicFile.count({
      where: {
        status: 'indexed',
        OR: [
          { filename: { contains: query } },
          { metadata: { series: { contains: query } } },
          { metadata: { title: { contains: query } } },
          { metadata: { writer: { contains: query } } },
          { metadata: { publisher: { contains: query } } },
        ],
      },
    }),
  ]);

  const entries = comics.map((comic) => createComicEntry(comic, baseUrl));

  const feed: OPDSFeed = {
    id: `${baseUrl}/opds/search?q=${encodeURIComponent(query)}`,
    title: `Search: ${query}`,
    updated: formatDate(new Date()),
    totalResults: total,
    itemsPerPage: pageSize,
    startIndex: skip + 1,
    links: [
      { rel: 'self', href: `${baseUrl}/opds/search?q=${encodeURIComponent(query)}&page=${page}`, type: OPDS_MIME_TYPES.acquisition },
      { rel: 'start', href: `${baseUrl}/opds`, type: OPDS_MIME_TYPES.feed },
    ],
    entries,
  };

  if (page > 1) {
    feed.links.push({
      rel: 'previous',
      href: `${baseUrl}/opds/search?q=${encodeURIComponent(query)}&page=${page - 1}`,
      type: OPDS_MIME_TYPES.acquisition,
    });
  }
  if (skip + pageSize < total) {
    feed.links.push({
      rel: 'next',
      href: `${baseUrl}/opds/search?q=${encodeURIComponent(query)}&page=${page + 1}`,
      type: OPDS_MIME_TYPES.acquisition,
    });
  }

  return generateFeedXml(feed);
}

export function generateOpenSearchDescription(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>Helixio</ShortName>
  <Description>Search Helixio Comic Library</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <OutputEncoding>UTF-8</OutputEncoding>
  <Url type="application/atom+xml;profile=opds-catalog;kind=acquisition"
       template="${baseUrl}/opds/search?q={searchTerms}"/>
</OpenSearchDescription>`;
}

// =============================================================================
// Helpers
// =============================================================================

interface ComicWithMetadata {
  id: string;
  filename: string;
  path: string;
  extension: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
  metadata?: {
    series: string | null;
    number: string | null;
    title: string | null;
    summary: string | null;
    writer: string | null;
    publisher: string | null;
    year: number | null;
    genre: string | null;
    pageCount: number | null;
  } | null;
}

function createComicEntry(comic: ComicWithMetadata, baseUrl: string): OPDSEntry {
  const meta = comic.metadata;
  const title = meta?.series
    ? `${meta.series}${meta.number ? ` #${meta.number}` : ''}${meta.title ? ` - ${meta.title}` : ''}`
    : path.basename(comic.filename, path.extname(comic.filename));

  const mimeType = comic.extension.toLowerCase() === 'cbr' ? OPDS_MIME_TYPES.cbr : OPDS_MIME_TYPES.cbz;

  const entry: OPDSEntry = {
    id: `${baseUrl}/opds/comic/${comic.id}`,
    title,
    updated: formatDate(comic.updatedAt),
    links: [
      // Cover image
      {
        rel: 'http://opds-spec.org/image',
        href: `${baseUrl}/api/files/${comic.id}/cover`,
        type: OPDS_MIME_TYPES.image,
      },
      {
        rel: 'http://opds-spec.org/image/thumbnail',
        href: `${baseUrl}/api/files/${comic.id}/cover?width=200`,
        type: OPDS_MIME_TYPES.image,
      },
      // Acquisition link (download)
      {
        rel: 'http://opds-spec.org/acquisition',
        href: `${baseUrl}/api/files/${comic.id}/download`,
        type: mimeType,
        title: 'Download',
      },
      // Stream link (for page-by-page reading)
      {
        rel: 'http://opds-spec.org/acquisition/open-access',
        href: `${baseUrl}/api/archive/${comic.id}/stream`,
        type: mimeType,
        title: 'Stream',
      },
    ],
  };

  // Add authors
  if (meta?.writer) {
    entry.authors = meta.writer.split(',').map((w) => ({ name: w.trim() }));
  }

  // Add summary
  if (meta?.summary) {
    entry.summary = meta.summary;
  }

  // Add categories/genres
  if (meta?.genre) {
    entry.categories = meta.genre.split(',').map((g) => g.trim());
  }

  return entry;
}
