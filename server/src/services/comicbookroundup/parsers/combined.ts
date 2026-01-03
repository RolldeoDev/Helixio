/**
 * ComicBookRoundup Combined Parser
 *
 * Combines rating and review parsing into a single CBRPageData result.
 */

import * as cheerio from 'cheerio';
import type { CBRPageData } from '../types.js';
import { parseRatings } from './ratings.js';
import { parseReviews } from './reviews.js';

/**
 * Parse all data from a CBR page HTML.
 *
 * @param html - The page HTML
 * @param sourceUrl - The URL that was scraped
 * @param reviewLimit - Maximum reviews per type (default 15)
 */
export function parsePage(
  html: string,
  sourceUrl: string,
  reviewLimit: number = 15
): CBRPageData {
  const $ = cheerio.load(html);

  // Parse ratings
  const ratings = parseRatings(html);

  // Parse reviews
  const reviews = parseReviews(html, reviewLimit);

  // Extract page name from h1
  // Clone h1, remove scripts/styles, then get text to avoid pollution from embedded widgets
  const h1Element = $('h1').first().clone();
  h1Element.find('script, style, noscript').remove();
  let pageName = h1Element.text().trim() || undefined;
  // Clean up any remaining JavaScript artifacts (e.g., "Tweet window.twttr = ...")
  if (pageName) {
    pageName = pageName
      .replace(/\s*Tweet\b.*/s, '') // Remove "Tweet" and everything after it (Twitter widget)
      .replace(/\s{2,}/g, ' ') // Collapse multiple whitespace
      .trim() || undefined;
  }

  // Try to extract issue number from URL or page content
  let issueNumber: string | undefined;
  const urlMatch = sourceUrl.match(/\/(\d+)(?:\?|#|$)/);
  if (urlMatch?.[1]) {
    issueNumber = urlMatch[1];
  }

  return {
    criticRating: ratings.critic,
    communityRating: ratings.community,
    criticReviews: reviews.critic,
    userReviews: reviews.user,
    pageName,
    issueNumber,
    fetchedAt: new Date(),
    sourceUrl,
  };
}
