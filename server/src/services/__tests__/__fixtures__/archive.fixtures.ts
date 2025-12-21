/**
 * Archive Fixtures
 *
 * Sample archive structures and file listings for testing.
 */

/**
 * Standard CBZ archive entry structure.
 */
export interface ArchiveEntryFixture {
  path: string;
  size: number;
  packedSize: number;
  isDirectory: boolean;
  date?: Date;
}

/**
 * Standard comic archive with ComicInfo.xml and numbered pages.
 */
export const STANDARD_CBZ_ENTRIES: ArchiveEntryFixture[] = [
  { path: 'ComicInfo.xml', size: 1024, packedSize: 512, isDirectory: false },
  { path: '001.jpg', size: 500000, packedSize: 480000, isDirectory: false },
  { path: '002.jpg', size: 520000, packedSize: 500000, isDirectory: false },
  { path: '003.jpg', size: 510000, packedSize: 490000, isDirectory: false },
  { path: '004.jpg', size: 530000, packedSize: 510000, isDirectory: false },
  { path: '005.jpg', size: 505000, packedSize: 485000, isDirectory: false },
  { path: '006.jpg', size: 515000, packedSize: 495000, isDirectory: false },
  { path: '007.jpg', size: 525000, packedSize: 505000, isDirectory: false },
  { path: '008.jpg', size: 500000, packedSize: 480000, isDirectory: false },
  { path: '009.jpg', size: 510000, packedSize: 490000, isDirectory: false },
  { path: '010.jpg', size: 520000, packedSize: 500000, isDirectory: false },
];

/**
 * Comic archive with cover.jpg as explicit cover file.
 */
export const COVER_FILE_CBZ_ENTRIES: ArchiveEntryFixture[] = [
  { path: 'cover.jpg', size: 600000, packedSize: 580000, isDirectory: false },
  { path: 'page_001.jpg', size: 500000, packedSize: 480000, isDirectory: false },
  { path: 'page_002.jpg', size: 520000, packedSize: 500000, isDirectory: false },
  { path: 'page_003.jpg', size: 510000, packedSize: 490000, isDirectory: false },
  { path: 'ComicInfo.xml', size: 1024, packedSize: 512, isDirectory: false },
];

/**
 * Comic archive with nested directory structure.
 */
export const NESTED_DIRECTORY_CBZ_ENTRIES: ArchiveEntryFixture[] = [
  { path: 'Batman #1/', size: 0, packedSize: 0, isDirectory: true },
  { path: 'Batman #1/ComicInfo.xml', size: 1024, packedSize: 512, isDirectory: false },
  { path: 'Batman #1/images/', size: 0, packedSize: 0, isDirectory: true },
  { path: 'Batman #1/images/001.jpg', size: 500000, packedSize: 480000, isDirectory: false },
  { path: 'Batman #1/images/002.jpg', size: 520000, packedSize: 500000, isDirectory: false },
  { path: 'Batman #1/images/003.jpg', size: 510000, packedSize: 490000, isDirectory: false },
];

/**
 * Comic archive without ComicInfo.xml.
 */
export const NO_COMICINFO_CBZ_ENTRIES: ArchiveEntryFixture[] = [
  { path: '001.jpg', size: 500000, packedSize: 480000, isDirectory: false },
  { path: '002.jpg', size: 520000, packedSize: 500000, isDirectory: false },
  { path: '003.jpg', size: 510000, packedSize: 490000, isDirectory: false },
  { path: '004.jpg', size: 530000, packedSize: 510000, isDirectory: false },
];

/**
 * Comic archive with mixed image formats.
 */
export const MIXED_FORMAT_CBZ_ENTRIES: ArchiveEntryFixture[] = [
  { path: 'cover.png', size: 800000, packedSize: 750000, isDirectory: false },
  { path: '001.jpg', size: 500000, packedSize: 480000, isDirectory: false },
  { path: '002.webp', size: 300000, packedSize: 290000, isDirectory: false },
  { path: '003.gif', size: 200000, packedSize: 180000, isDirectory: false },
  { path: '004.bmp', size: 2000000, packedSize: 1900000, isDirectory: false },
  { path: 'ComicInfo.xml', size: 1024, packedSize: 512, isDirectory: false },
];

/**
 * Empty archive (invalid comic).
 */
export const EMPTY_ARCHIVE_ENTRIES: ArchiveEntryFixture[] = [];

/**
 * Archive with only text files (invalid comic).
 */
export const TEXT_ONLY_ARCHIVE_ENTRIES: ArchiveEntryFixture[] = [
  { path: 'readme.txt', size: 1000, packedSize: 500, isDirectory: false },
  { path: 'credits.txt', size: 500, packedSize: 300, isDirectory: false },
];

/**
 * Archive with special characters in filenames.
 */
export const SPECIAL_CHARS_CBZ_ENTRIES: ArchiveEntryFixture[] = [
  { path: 'ComicInfo.xml', size: 1024, packedSize: 512, isDirectory: false },
  { path: "Batman - Issue #1 (2011) [Collector's Edition].jpg", size: 500000, packedSize: 480000, isDirectory: false },
  { path: 'Page (01).jpg', size: 520000, packedSize: 500000, isDirectory: false },
  { path: 'Page [02].jpg', size: 510000, packedSize: 490000, isDirectory: false },
  { path: 'Page {03}.jpg', size: 530000, packedSize: 510000, isDirectory: false },
];

/**
 * Large archive (high page count).
 */
export function createLargeArchiveEntries(pageCount: number): ArchiveEntryFixture[] {
  const entries: ArchiveEntryFixture[] = [
    { path: 'ComicInfo.xml', size: 2048, packedSize: 1024, isDirectory: false },
  ];

  for (let i = 1; i <= pageCount; i++) {
    entries.push({
      path: `${i.toString().padStart(4, '0')}.jpg`,
      size: 500000 + Math.floor(Math.random() * 100000),
      packedSize: 480000 + Math.floor(Math.random() * 90000),
      isDirectory: false,
    });
  }

  return entries;
}

/**
 * Calculate archive info from entries.
 */
export function calculateArchiveInfo(entries: ArchiveEntryFixture[]) {
  const fileCount = entries.filter((e) => !e.isDirectory).length;
  const totalSize = entries.reduce((sum, e) => sum + e.size, 0);
  const hasComicInfo = entries.some((e) =>
    e.path.toLowerCase().endsWith('comicinfo.xml')
  );
  const coverPath = entries.find((e) => {
    const name = e.path.toLowerCase();
    return (
      !e.isDirectory &&
      /\.(jpg|jpeg|png|webp)$/.test(name) &&
      (name.includes('cover') || name === '001.jpg' || name === 'page_001.jpg')
    );
  })?.path ?? entries.find((e) =>
    !e.isDirectory && /\.(jpg|jpeg|png|webp)$/.test(e.path.toLowerCase())
  )?.path ?? null;

  return {
    fileCount,
    totalSize,
    hasComicInfo,
    coverPath,
  };
}

/**
 * File paths for testing library scanning.
 */
export const MOCK_LIBRARY_STRUCTURE = {
  rootPath: '/comics',
  files: [
    // Batman series
    '/comics/Batman/Batman 001 (2011).cbz',
    '/comics/Batman/Batman 002 (2011).cbz',
    '/comics/Batman/Batman 003 (2011).cbz',
    '/comics/Batman/Batman 004 (2011).cbz',
    '/comics/Batman/Batman 005 (2011).cbz',
    // Superman series
    '/comics/Superman/Superman 001 (2018).cbz',
    '/comics/Superman/Superman 002 (2018).cbz',
    '/comics/Superman/Superman 003 (2018).cbr',
    // Nested structure
    '/comics/Marvel/Spider-Man/Amazing Spider-Man/Amazing Spider-Man 001.cbz',
    '/comics/Marvel/Spider-Man/Amazing Spider-Man/Amazing Spider-Man 002.cbz',
    // Special characters
    "/comics/Misc/X-Men - God Loves, Man Kills (Special Edition).cbz",
    '/comics/Misc/Batman & Robin (2011) #1.cbz',
  ],
};

/**
 * Hash values for testing move detection.
 */
export const MOCK_FILE_HASHES = {
  '/comics/Batman/Batman 001 (2011).cbz': 'abc123def456',
  '/comics/Batman/Batman 002 (2011).cbz': 'bcd234efg567',
  '/comics/Batman/Batman 003 (2011).cbz': 'cde345fgh678',
  '/comics/Batman/Batman 004 (2011).cbz': 'def456ghi789',
  '/comics/Batman/Batman 005 (2011).cbz': 'efg567hij890',
  '/comics/Superman/Superman 001 (2018).cbz': 'fgh678ijk901',
  '/comics/Superman/Superman 002 (2018).cbz': 'ghi789jkl012',
  '/comics/Superman/Superman 003 (2018).cbr': 'hij890klm123',
};
