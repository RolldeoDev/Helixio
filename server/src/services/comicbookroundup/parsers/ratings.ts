/**
 * ComicBookRoundup Ratings Parser
 *
 * Extracts aggregate critic and community ratings from CBR HTML.
 */

import * as cheerio from 'cheerio';
import type { CBRRatingData } from '../types.js';

// =============================================================================
// Types
// =============================================================================

export interface ParsedRatings {
  critic?: CBRRatingData;
  community?: CBRRatingData;
}

// =============================================================================
// Rating Parsing
// =============================================================================

/**
 * Parse aggregate ratings from CBR page HTML.
 *
 * CBR displays ratings in multiple formats:
 * 1. JSON-LD structured data
 * 2. Text like "6.8 Avg. Critic Rating" and "7.4 Avg. User Rating"
 * 3. HTML elements with specific classes
 */
export function parseRatings(html: string): ParsedRatings {
  const $ = cheerio.load(html);
  const result: ParsedRatings = {};

  // Strategy 1: Try JSON-LD structured data first
  const jsonLdScript = $('script[type="application/ld+json"]').text();
  if (jsonLdScript) {
    try {
      const jsonLd = JSON.parse(jsonLdScript);
      if (jsonLd.aggregateRating) {
        result.critic = {
          value: parseFloat(jsonLd.aggregateRating.ratingValue) || 0,
          count: parseInt(jsonLd.aggregateRating.ratingCount) || 0,
        };
      }
    } catch {
      // JSON-LD parsing failed, continue with other strategies
    }
  }

  // Strategy 2: Parse from page text
  const pageText = $('body').text();

  // Critic rating pattern: "6.8 Avg. Critic Rating" or "6.8 Critic Rating"
  if (!result.critic) {
    const criticMatch = pageText.match(
      /(\d+\.?\d*)\s*(?:Avg\.?\s*)?Critic\s*Rating/i
    );
    if (criticMatch?.[1]) {
      result.critic = {
        value: parseFloat(criticMatch[1]),
        count: 0,
      };
    }
  }

  // User/community rating pattern: "7.4 Avg. User Rating" or "7.4 User Rating"
  const userMatch = pageText.match(
    /(\d+\.?\d*)\s*(?:Avg\.?\s*)?User\s*Rating/i
  );
  if (userMatch?.[1]) {
    result.community = {
      value: parseFloat(userMatch[1]),
      count: 0,
    };
  }

  // Parse review counts separately
  // Pattern 1: "Critic Reviews: 3" (CBR format with colon)
  // Pattern 2: "3 Critic Reviews" (some pages use this format)
  // Be careful with pattern 2 - must require tighter spacing to avoid matching prices like "$24.99"
  const criticCountMatch1 = pageText.match(/Critic\s*Reviews?:?\s*(\d+)/i);
  const criticCountMatch2 = pageText.match(/(\d+)\s+Critic\s+Reviews?/i); // Require at least one space
  if (result.critic) {
    if (criticCountMatch1?.[1]) {
      result.critic.count = parseInt(criticCountMatch1[1]);
    } else if (criticCountMatch2?.[1]) {
      result.critic.count = parseInt(criticCountMatch2[1]);
    }
  }

  // Same for user reviews
  const userCountMatch1 = pageText.match(/User\s*Reviews?:?\s*(\d+)/i);
  const userCountMatch2 = pageText.match(/(\d+)\s+User\s+Reviews?/i); // Require at least one space
  if (result.community) {
    if (userCountMatch1?.[1]) {
      result.community.count = parseInt(userCountMatch1[1]);
    } else if (userCountMatch2?.[1]) {
      result.community.count = parseInt(userCountMatch2[1]);
    }
  }

  // Strategy 3: Try HTML elements with specific classes
  if (!result.critic) {
    const criticRatingEl = $(
      '[class*="CriticRating"], .critic-rating, .avgRating.critic'
    ).first();
    if (criticRatingEl.length) {
      const ratingText = criticRatingEl.text();
      const value = parseFloat(ratingText);
      if (!isNaN(value) && value > 0 && value <= 10) {
        result.critic = { value, count: 0 };
      }
    }
  }

  if (!result.community) {
    const userRatingEl = $(
      '[class*="UserRating"], .user-rating, .avgRating.user'
    ).first();
    if (userRatingEl.length) {
      const ratingText = userRatingEl.text();
      const value = parseFloat(ratingText);
      if (!isNaN(value) && value > 0 && value <= 10) {
        result.community = { value, count: 0 };
      }
    }
  }

  return result;
}
