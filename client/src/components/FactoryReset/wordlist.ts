/**
 * Word List for Verification Phrase Generation
 *
 * Contains memorable, easy-to-type English words organized by category.
 * Used to generate random 3-word phrases like "Happy Sun House" for
 * factory reset verification.
 *
 * This prevents automated/scripted factory resets by requiring
 * the user to type a random phrase each time.
 */

// Adjectives - describing words
const ADJECTIVES = [
  'happy', 'sunny', 'bright', 'calm', 'swift', 'gentle', 'bold', 'warm',
  'cool', 'fresh', 'quiet', 'loud', 'soft', 'wild', 'free', 'golden',
  'silver', 'purple', 'crimson', 'azure', 'emerald', 'amber', 'coral',
  'royal', 'noble', 'brave', 'clever', 'quick', 'silent', 'ancient',
  'cosmic', 'hidden', 'frozen', 'mighty', 'gentle', 'tender', 'fierce',
  'proud', 'humble', 'radiant', 'glowing', 'shining', 'dancing', 'flowing',
  'dreamy', 'misty', 'foggy', 'stormy', 'cloudy', 'starry', 'lunar',
  'solar', 'crystal', 'velvet', 'marble', 'wooden', 'iron', 'copper',
];

// Nouns - objects and things
const NOUNS = [
  'sun', 'moon', 'star', 'tree', 'river', 'mountain', 'ocean', 'forest',
  'meadow', 'garden', 'castle', 'tower', 'bridge', 'house', 'door', 'window',
  'cloud', 'rain', 'snow', 'wind', 'fire', 'stone', 'leaf', 'flower',
  'rose', 'lily', 'daisy', 'tulip', 'orchid', 'lotus', 'fern', 'moss',
  'pearl', 'ruby', 'diamond', 'sapphire', 'opal', 'jade', 'onyx', 'topaz',
  'crown', 'sword', 'shield', 'arrow', 'spear', 'helm', 'cloak', 'ring',
  'book', 'scroll', 'quill', 'ink', 'lamp', 'candle', 'mirror', 'key',
  'path', 'road', 'trail', 'gate', 'arch', 'pillar', 'dome', 'spire',
  'island', 'harbor', 'shore', 'cliff', 'cave', 'valley', 'canyon', 'peak',
  'dawn', 'dusk', 'night', 'day', 'spring', 'summer', 'autumn', 'winter',
  'storm', 'breeze', 'gust', 'frost', 'mist', 'haze', 'fog', 'dew',
];

// Animals - creatures
const ANIMALS = [
  'fox', 'owl', 'hawk', 'wolf', 'bear', 'deer', 'rabbit', 'eagle',
  'lion', 'tiger', 'whale', 'dolphin', 'raven', 'sparrow', 'falcon',
  'crane', 'heron', 'swan', 'dove', 'finch', 'robin', 'jay', 'wren',
  'horse', 'stag', 'elk', 'moose', 'bison', 'lynx', 'puma', 'panther',
  'seal', 'otter', 'beaver', 'badger', 'mole', 'mouse', 'squirrel', 'chipmunk',
  'salmon', 'trout', 'bass', 'pike', 'perch', 'carp', 'eel', 'ray',
  'moth', 'butterfly', 'beetle', 'firefly', 'cricket', 'dragonfly', 'mantis', 'ant',
];

// Colors - descriptive colors
const COLORS = [
  'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'white',
  'black', 'gray', 'brown', 'gold', 'silver', 'teal', 'coral', 'ivory',
  'crimson', 'scarlet', 'azure', 'cobalt', 'navy', 'indigo', 'violet', 'magenta',
  'emerald', 'jade', 'olive', 'lime', 'mint', 'sage', 'forest', 'hunter',
  'amber', 'honey', 'bronze', 'copper', 'rust', 'mahogany', 'chestnut', 'walnut',
];

// Nature terms - natural phenomena
const NATURE = [
  'aurora', 'comet', 'meteor', 'nebula', 'galaxy', 'cosmos', 'horizon', 'zenith',
  'eclipse', 'solstice', 'equinox', 'tide', 'current', 'ripple', 'wave', 'cascade',
  'thunder', 'lightning', 'rainbow', 'prism', 'crystal', 'glacier', 'volcano', 'geyser',
  'delta', 'estuary', 'lagoon', 'reef', 'atoll', 'fjord', 'tundra', 'savanna',
  'prairie', 'steppe', 'marsh', 'swamp', 'grove', 'glade', 'thicket', 'copse',
];

// All word categories combined
const ALL_WORDS = [
  ...ADJECTIVES,
  ...NOUNS,
  ...ANIMALS,
  ...COLORS,
  ...NATURE,
];

/**
 * Get a cryptographically random integer in the range [0, max)
 */
function getSecureRandomInt(max: number): number {
  // Use crypto API for better randomness
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  // array[0] is guaranteed to exist since we created a 1-element array
  return (array[0] ?? 0) % max;
}

/**
 * Generate a random verification phrase of 3 capitalized words
 *
 * @returns A phrase like "Happy Sun House"
 */
export function generateVerificationPhrase(): string {
  const words: string[] = [];
  const usedIndices = new Set<number>();

  // Select 3 unique words
  while (words.length < 3) {
    const index = getSecureRandomInt(ALL_WORDS.length);
    if (!usedIndices.has(index)) {
      usedIndices.add(index);
      const word = ALL_WORDS[index];
      if (word) {
        // Capitalize first letter
        words.push(word.charAt(0).toUpperCase() + word.slice(1));
      }
    }
  }

  return words.join(' ');
}

/**
 * Validate a phrase matches the expected format (3 words, letters only)
 */
export function isValidPhraseFormat(phrase: string): boolean {
  const words = phrase.trim().split(/\s+/);
  if (words.length !== 3) {
    return false;
  }
  return words.every((word) => /^[a-zA-Z]+$/.test(word));
}

/**
 * Compare two phrases case-insensitively
 */
export function phrasesMatch(input: string, expected: string): boolean {
  return input.trim().toLowerCase() === expected.trim().toLowerCase();
}

// Export word lists for potential future use (e.g., displaying word count)
export const wordLists = {
  adjectives: ADJECTIVES,
  nouns: NOUNS,
  animals: ANIMALS,
  colors: COLORS,
  nature: NATURE,
  all: ALL_WORDS,
};

export default {
  generateVerificationPhrase,
  isValidPhraseFormat,
  phrasesMatch,
  wordLists,
};
