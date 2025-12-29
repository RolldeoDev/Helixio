/**
 * Similarity Service
 *
 * Computes similarity scores between series based on:
 * - Genres, tags, characters, teams, creators (Jaccard similarity)
 * - Publisher (exact match)
 * - Description keywords (Jaccard similarity on extracted keywords)
 *
 * Weights are configurable for future ML-based optimization.
 */

// =============================================================================
// Types
// =============================================================================

export interface SeriesData {
  id: string;
  name: string;
  genres: string | null;
  tags: string | null;
  characters: string | null;
  teams: string | null;
  creators: string | null;
  writer: string | null;
  penciller: string | null;
  publisher: string | null;
  summary: string | null;
}

export interface SimilarityScores {
  similarityScore: number;
  genreScore: number;
  tagScore: number;
  characterScore: number;
  teamScore: number;
  creatorScore: number;
  publisherScore: number;
  keywordScore: number;
}

// =============================================================================
// Similarity Weights
// =============================================================================

/**
 * Weights for each similarity dimension.
 * These can be adjusted based on user feedback or ML optimization.
 * All weights should sum to 1.0 for normalized scoring.
 */
export const SIMILARITY_WEIGHTS = {
  genres: 0.20,
  characters: 0.25,
  creators: 0.15,
  tags: 0.15,
  teams: 0.10,
  keywords: 0.10,
  publisher: 0.05,
} as const;

// Minimum similarity score to store (saves database space)
export const MINIMUM_SIMILARITY_THRESHOLD = 0.1;

// =============================================================================
// Stopwords for Keyword Extraction
// =============================================================================

const STOPWORDS = new Set([
  // Articles
  'the', 'a', 'an',
  // Conjunctions
  'and', 'or', 'but', 'nor', 'yet', 'so',
  // Prepositions
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under',
  'again', 'further', 'then', 'once',
  // Verbs (common)
  'is', 'was', 'are', 'were', 'been', 'be', 'being',
  'have', 'has', 'had', 'having',
  'do', 'does', 'did', 'doing',
  'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can',
  // Pronouns
  'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves',
  'you', 'your', 'yours', 'yourself', 'yourselves',
  'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself',
  'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves',
  'this', 'that', 'these', 'those', 'who', 'whom', 'which', 'what', 'whose',
  'when', 'where', 'why', 'how',
  // Determiners
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
  'such', 'no', 'not', 'only', 'own', 'same', 'than', 'too', 'very',
  // Adverbs
  'just', 'also', 'now', 'here', 'there', 'about', 'out', 'up', 'down',
  // Common words in comic descriptions
  'comic', 'comics', 'series', 'issue', 'issues', 'story', 'stories',
  'volume', 'part', 'chapter', 'book', 'new', 'first', 'one', 'two',
  'three', 'four', 'five', 'many', 'much', 'find', 'finds', 'found',
  'must', 'take', 'takes', 'taken', 'make', 'makes', 'made', 'become',
  'becomes', 'get', 'gets', 'got', 'goes', 'come', 'comes', 'came',
]);

// =============================================================================
// Tokenization
// =============================================================================

/**
 * Tokenize a comma-separated string into a lowercase Set
 */
export function tokenize(value: string | null): Set<string> {
  if (!value) return new Set();

  return new Set(
    value
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter((v) => v.length > 0)
  );
}

/**
 * Tokenize multiple comma-separated fields and merge into one Set
 */
export function tokenizeMultiple(...values: (string | null)[]): Set<string> {
  const result = new Set<string>();
  for (const value of values) {
    if (value) {
      for (const token of tokenize(value)) {
        result.add(token);
      }
    }
  }
  return result;
}

// =============================================================================
// Keyword Extraction
// =============================================================================

/**
 * Extract keywords from a description/summary text.
 * Uses simple frequency-based extraction with stopword filtering.
 *
 * @param description - The text to extract keywords from
 * @param maxKeywords - Maximum number of keywords to return (default: 20)
 * @returns Set of extracted keywords
 */
export function extractKeywords(
  description: string | null,
  maxKeywords = 20
): Set<string> {
  if (!description) return new Set();

  // Normalize: lowercase, remove special characters, split into words
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));

  // Count word frequencies
  const wordCounts = new Map<string, number>();
  for (const word of words) {
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
  }

  // Sort by frequency and take top N
  const topWords = Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);

  return new Set(topWords);
}

// =============================================================================
// Jaccard Similarity
// =============================================================================

/**
 * Compute Jaccard similarity between two sets: |A ∩ B| / |A ∪ B|
 *
 * @param setA - First set
 * @param setB - Second set
 * @returns Similarity score between 0.0 and 1.0
 */
export function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  // Handle empty sets
  if (setA.size === 0 && setB.size === 0) return 0;
  if (setA.size === 0 || setB.size === 0) return 0;

  // Compute intersection
  const intersection = new Set(Array.from(setA).filter((x) => setB.has(x)));

  // Compute union size (|A| + |B| - |A ∩ B|)
  const unionSize = setA.size + setB.size - intersection.size;

  return intersection.size / unionSize;
}

// =============================================================================
// Series Similarity Computation
// =============================================================================

/**
 * Compute the overall similarity between two series.
 *
 * @param seriesA - First series data
 * @param seriesB - Second series data
 * @returns Similarity scores object with overall and component scores
 */
export function computeSeriesSimilarity(
  seriesA: SeriesData,
  seriesB: SeriesData
): SimilarityScores {
  // Genre similarity
  const genresA = tokenize(seriesA.genres);
  const genresB = tokenize(seriesB.genres);
  const genreScore = jaccardSimilarity(genresA, genresB);

  // Tag similarity
  const tagsA = tokenize(seriesA.tags);
  const tagsB = tokenize(seriesB.tags);
  const tagScore = jaccardSimilarity(tagsA, tagsB);

  // Character similarity
  const charactersA = tokenize(seriesA.characters);
  const charactersB = tokenize(seriesB.characters);
  const characterScore = jaccardSimilarity(charactersA, charactersB);

  // Team similarity
  const teamsA = tokenize(seriesA.teams);
  const teamsB = tokenize(seriesB.teams);
  const teamScore = jaccardSimilarity(teamsA, teamsB);

  // Creator similarity (combine all creator fields)
  const creatorsA = tokenizeMultiple(
    seriesA.creators,
    seriesA.writer,
    seriesA.penciller
  );
  const creatorsB = tokenizeMultiple(
    seriesB.creators,
    seriesB.writer,
    seriesB.penciller
  );
  const creatorScore = jaccardSimilarity(creatorsA, creatorsB);

  // Publisher similarity (exact match)
  const publisherScore =
    seriesA.publisher &&
    seriesB.publisher &&
    seriesA.publisher.toLowerCase() === seriesB.publisher.toLowerCase()
      ? 1
      : 0;

  // Keyword similarity (from description/summary)
  const keywordsA = extractKeywords(seriesA.summary);
  const keywordsB = extractKeywords(seriesB.summary);
  const keywordScore = jaccardSimilarity(keywordsA, keywordsB);

  // Compute weighted sum
  const similarityScore =
    genreScore * SIMILARITY_WEIGHTS.genres +
    tagScore * SIMILARITY_WEIGHTS.tags +
    characterScore * SIMILARITY_WEIGHTS.characters +
    teamScore * SIMILARITY_WEIGHTS.teams +
    creatorScore * SIMILARITY_WEIGHTS.creators +
    publisherScore * SIMILARITY_WEIGHTS.publisher +
    keywordScore * SIMILARITY_WEIGHTS.keywords;

  return {
    similarityScore,
    genreScore,
    tagScore,
    characterScore,
    teamScore,
    creatorScore,
    publisherScore,
    keywordScore,
  };
}

/**
 * Check if two series should have their similarity computed and stored.
 * Returns true if the similarity score meets the minimum threshold.
 *
 * @param seriesA - First series data
 * @param seriesB - Second series data
 * @returns Similarity scores if above threshold, null otherwise
 */
export function computeAndFilterSimilarity(
  seriesA: SeriesData,
  seriesB: SeriesData
): SimilarityScores | null {
  const scores = computeSeriesSimilarity(seriesA, seriesB);

  if (scores.similarityScore >= MINIMUM_SIMILARITY_THRESHOLD) {
    return scores;
  }

  return null;
}

/**
 * Get the primary match reasons for a similarity score.
 * Useful for displaying why two series are similar.
 *
 * @param scores - The similarity scores
 * @returns Array of reasons sorted by contribution to similarity
 */
export function getMatchReasons(
  scores: SimilarityScores
): Array<{ type: string; score: number; weight: number; contribution: number }> {
  const reasons = [
    {
      type: 'genres',
      score: scores.genreScore,
      weight: SIMILARITY_WEIGHTS.genres,
      contribution: scores.genreScore * SIMILARITY_WEIGHTS.genres,
    },
    {
      type: 'characters',
      score: scores.characterScore,
      weight: SIMILARITY_WEIGHTS.characters,
      contribution: scores.characterScore * SIMILARITY_WEIGHTS.characters,
    },
    {
      type: 'creators',
      score: scores.creatorScore,
      weight: SIMILARITY_WEIGHTS.creators,
      contribution: scores.creatorScore * SIMILARITY_WEIGHTS.creators,
    },
    {
      type: 'tags',
      score: scores.tagScore,
      weight: SIMILARITY_WEIGHTS.tags,
      contribution: scores.tagScore * SIMILARITY_WEIGHTS.tags,
    },
    {
      type: 'teams',
      score: scores.teamScore,
      weight: SIMILARITY_WEIGHTS.teams,
      contribution: scores.teamScore * SIMILARITY_WEIGHTS.teams,
    },
    {
      type: 'keywords',
      score: scores.keywordScore,
      weight: SIMILARITY_WEIGHTS.keywords,
      contribution: scores.keywordScore * SIMILARITY_WEIGHTS.keywords,
    },
    {
      type: 'publisher',
      score: scores.publisherScore,
      weight: SIMILARITY_WEIGHTS.publisher,
      contribution: scores.publisherScore * SIMILARITY_WEIGHTS.publisher,
    },
  ];

  // Sort by contribution (descending) and filter out zero contributions
  return reasons
    .filter((r) => r.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution);
}
