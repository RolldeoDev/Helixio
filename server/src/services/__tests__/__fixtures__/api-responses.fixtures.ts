/**
 * API Response Fixtures
 *
 * Sample API responses for ComicVine and Metron testing.
 */

// =============================================================================
// ComicVine Fixtures
// =============================================================================

export const COMICVINE_BATMAN_VOLUME = {
  id: 42721,
  name: 'Batman',
  start_year: '2011',
  count_of_issues: 52,
  description: '<p>The New 52 Batman ongoing series written by Scott Snyder.</p>',
  publisher: {
    id: 10,
    name: 'DC Comics',
  },
  image: {
    medium_url: 'https://comicvine.gamespot.com/a/uploads/scale_medium/batman.jpg',
    original_url: 'https://comicvine.gamespot.com/a/uploads/original/batman.jpg',
  },
  site_detail_url: 'https://comicvine.gamespot.com/batman/4050-42721/',
  aliases: 'The Dark Knight\nCaped Crusader',
};

export const COMICVINE_BATMAN_ISSUE_1 = {
  id: 336469,
  name: 'The Court of Owls, Part One',
  issue_number: '1',
  volume: {
    id: 42721,
    name: 'Batman',
  },
  cover_date: '2011-09-01',
  store_date: '2011-09-07',
  description: '<p>Batman discovers a secret society lurking in Gotham.</p>',
  image: {
    medium_url: 'https://comicvine.gamespot.com/a/uploads/scale_medium/batman-1.jpg',
  },
  site_detail_url: 'https://comicvine.gamespot.com/batman-1/4000-336469/',
  person_credits: [
    { id: 40439, name: 'Scott Snyder', role: 'writer' },
    { id: 8686, name: 'Greg Capullo', role: 'penciler' },
    { id: 16992, name: 'Jonathan Glapion', role: 'inker' },
    { id: 26498, name: 'FCO Plascencia', role: 'colorist' },
    { id: 4169, name: 'Richard Starkings', role: 'letterer' },
  ],
  character_credits: [
    { id: 1699, name: 'Batman' },
    { id: 1710, name: 'James Gordon' },
    { id: 1691, name: 'Dick Grayson' },
  ],
  team_credits: [],
  location_credits: [
    { id: 55809, name: 'Gotham City' },
  ],
  story_arc_credits: [
    { id: 55965, name: 'Court of Owls' },
  ],
};

export const COMICVINE_SEARCH_RESULTS = {
  error: 'OK',
  limit: 10,
  offset: 0,
  number_of_page_results: 2,
  number_of_total_results: 2,
  status_code: 1,
  results: [
    COMICVINE_BATMAN_VOLUME,
    {
      id: 796,
      name: 'Batman',
      start_year: '1940',
      count_of_issues: 713,
      description: '<p>The original Batman ongoing series.</p>',
      publisher: {
        id: 10,
        name: 'DC Comics',
      },
      image: {
        medium_url: 'https://comicvine.gamespot.com/a/uploads/scale_medium/batman-1940.jpg',
      },
      site_detail_url: 'https://comicvine.gamespot.com/batman/4050-796/',
    },
  ],
};

// =============================================================================
// Metron Fixtures
// =============================================================================

export const METRON_BATMAN_SERIES = {
  id: 2085,
  name: 'Batman',
  sort_name: 'Batman',
  volume: 2,
  year_began: 2011,
  year_end: 2016,
  issue_count: 52,
  desc: 'The New 52 Batman ongoing series written by Scott Snyder.',
  publisher: {
    id: 1,
    name: 'DC Comics',
  },
  image: 'https://static.metron.cloud/media/issue/2021/08/14/batman-2011-1.jpg',
  modified: '2024-01-01T00:00:00Z',
};

export const METRON_BATMAN_ISSUE_1 = {
  id: 21573,
  series: {
    id: 2085,
    name: 'Batman',
  },
  number: '1',
  name: 'Court of Owls, Part One',
  cover_date: '2011-09',
  store_date: '2011-09-07',
  price: 2.99,
  sku: 'AUG110167',
  upc: '76194130627400111',
  page_count: 32,
  desc: 'Batman discovers a secret society lurking in Gotham City.',
  image: 'https://static.metron.cloud/media/issue/2021/08/14/batman-2011-1.jpg',
  credits: [
    {
      id: 1,
      creator: 'Scott Snyder',
      role: [{ id: 1, name: 'Writer' }],
    },
    {
      id: 2,
      creator: 'Greg Capullo',
      role: [{ id: 2, name: 'Penciller' }, { id: 6, name: 'Cover' }],
    },
    {
      id: 3,
      creator: 'Jonathan Glapion',
      role: [{ id: 3, name: 'Inker' }],
    },
    {
      id: 4,
      creator: 'FCO Plascencia',
      role: [{ id: 4, name: 'Colorist' }],
    },
    {
      id: 5,
      creator: 'Richard Starkings',
      role: [{ id: 5, name: 'Letterer' }],
    },
  ],
  characters: [
    { id: 1, name: 'Batman' },
    { id: 2, name: 'James Gordon' },
    { id: 3, name: 'Dick Grayson' },
  ],
  teams: [],
  arcs: [
    { id: 1, name: 'Court of Owls' },
  ],
  reprints: [],
  variants: [],
  modified: '2024-01-01T00:00:00Z',
};

export const METRON_SEARCH_RESULTS = {
  count: 2,
  next: null,
  previous: null,
  results: [
    METRON_BATMAN_SERIES,
    {
      id: 100,
      name: 'Batman',
      sort_name: 'Batman',
      volume: 1,
      year_began: 1940,
      year_end: 2011,
      issue_count: 713,
      desc: 'The original Batman ongoing series.',
      publisher: {
        id: 1,
        name: 'DC Comics',
      },
      image: 'https://static.metron.cloud/media/issue/batman-1940.jpg',
      modified: '2024-01-01T00:00:00Z',
    },
  ],
};

// =============================================================================
// Error Response Fixtures
// =============================================================================

export const COMICVINE_RATE_LIMIT_RESPONSE = {
  error: 'You have exceeded your API rate limit',
  limit: 0,
  offset: 0,
  number_of_page_results: 0,
  number_of_total_results: 0,
  status_code: 107,
  results: [],
};

export const COMICVINE_INVALID_API_KEY_RESPONSE = {
  error: 'Invalid API Key',
  limit: 0,
  offset: 0,
  number_of_page_results: 0,
  number_of_total_results: 0,
  status_code: 100,
  results: [],
};

export const COMICVINE_NOT_FOUND_RESPONSE = {
  error: 'Object Not Found',
  limit: 0,
  offset: 0,
  number_of_page_results: 0,
  number_of_total_results: 0,
  status_code: 101,
  results: [],
};

export const METRON_UNAUTHORIZED_RESPONSE = {
  detail: 'Authentication credentials were not provided.',
};

export const METRON_NOT_FOUND_RESPONSE = {
  detail: 'Not found.',
};

// =============================================================================
// Multi-Source Test Data
// =============================================================================

export const CROSS_SOURCE_BATMAN_DATA = {
  comicvine: {
    series: {
      source: 'comicvine' as const,
      sourceId: 'cv-42721',
      name: 'Batman',
      publisher: 'DC Comics',
      startYear: 2011,
      endYear: 2016,
      issueCount: 52,
      description: 'The New 52 Batman ongoing series written by Scott Snyder.',
      url: 'https://comicvine.gamespot.com/batman/4050-42721/',
      aliases: ['The Dark Knight', 'Caped Crusader'],
      creators: [
        { id: 40439, name: 'Scott Snyder' },
        { id: 8686, name: 'Greg Capullo' },
      ],
    },
    issue: {
      source: 'comicvine' as const,
      sourceId: 'cv-336469',
      seriesId: 'cv-42721',
      seriesName: 'Batman',
      number: '1',
      title: 'The Court of Owls, Part One',
      coverDate: '2011-09',
      storeDate: '2011-09-07',
      description: 'Batman discovers a secret society lurking in Gotham.',
      writer: 'Scott Snyder',
      penciller: 'Greg Capullo',
      inker: 'Jonathan Glapion',
      colorist: 'FCO Plascencia',
      letterer: 'Richard Starkings',
      characters: ['Batman', 'James Gordon', 'Dick Grayson'],
    },
  },
  metron: {
    series: {
      source: 'metron' as const,
      sourceId: 'mt-2085',
      name: 'Batman',
      publisher: 'DC Comics',
      startYear: 2011,
      endYear: 2016,
      issueCount: 52,
      description: 'The New 52 Batman ongoing series written by Scott Snyder.',
      url: 'https://metron.cloud/series/batman-2011/',
      aliases: [],
      creators: [
        { id: 1, name: 'Scott Snyder' },
        { id: 2, name: 'Greg Capullo' },
      ],
    },
    issue: {
      source: 'metron' as const,
      sourceId: 'mt-21573',
      seriesId: 'mt-2085',
      seriesName: 'Batman',
      number: '1',
      title: 'Court of Owls, Part One',
      coverDate: '2011-09',
      storeDate: '2011-09-07',
      description: 'Batman discovers a secret society lurking in Gotham City.',
      writer: 'Scott Snyder',
      penciller: 'Greg Capullo',
      inker: 'Jonathan Glapion',
      colorist: 'FCO Plascencia',
      letterer: 'Richard Starkings',
      characters: ['Batman', 'James Gordon', 'Dick Grayson'],
    },
  },
};

// =============================================================================
// Publisher Variations
// =============================================================================

export const PUBLISHER_VARIATIONS = {
  dc: ['DC', 'DC Comics', 'DC Comics, Inc.', 'DC Entertainment'],
  marvel: ['Marvel', 'Marvel Comics', 'Marvel Comics Group', 'Marvel Entertainment'],
  image: ['Image', 'Image Comics'],
  darkHorse: ['Dark Horse', 'Dark Horse Comics'],
  boom: ['BOOM!', 'Boom Studios', 'BOOM! Studios'],
  idw: ['IDW', 'IDW Publishing'],
  dynamite: ['Dynamite', 'Dynamite Entertainment'],
  valiant: ['Valiant', 'Valiant Comics', 'Valiant Entertainment'],
};
