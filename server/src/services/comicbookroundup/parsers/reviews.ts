/**
 * ComicBookRoundup Reviews Parser
 *
 * Extracts individual critic and user reviews from CBR HTML.
 * Uses multiple parsing strategies with fallbacks.
 */

import * as cheerio from 'cheerio';
import type { Cheerio, CheerioAPI } from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { CBRParsedReview } from '../types.js';
import { createServiceLogger } from '../../logger.service.js';
import { generateSummary } from '../../review-providers/types.js';

const logger = createServiceLogger('cbr-review-parser');

// Re-export for convenience
export { generateSummary };

// =============================================================================
// Types
// =============================================================================

export interface ParsedReviews {
  critic: CBRParsedReview[];
  user: CBRParsedReview[];
}

/**
 * Check if text looks like actual review content vs garbage.
 * Garbage includes: just ratings, dates, UI text, short fragments.
 */
function isValidReviewText(text: string): boolean {
  if (!text || text.length < 20) return false;

  // Remove common UI text patterns
  const cleaned = text
    .replace(/\+ ?like/gi, '')
    .replace(/comment/gi, '')
    .replace(/read full review/gi, '')
    .replace(/user rating/gi, '')
    .replace(/\d+(\.\d+)?/g, '') // Remove numbers
    .replace(/\w{3,9}\s+\d{1,2},?\s+\d{4}/g, '') // Remove dates
    .replace(/[•·|]/g, '') // Remove separators
    .trim();

  // After removing garbage, should still have substantial text
  // At least 20 chars of actual words
  return cleaned.length >= 20;
}

/**
 * Parse a rating value from text.
 * Handles formats like "8.5", "8/10", "8.5 out of 10"
 */
function parseRatingValue(text: string): number | undefined {
  if (!text) return undefined;

  // Match patterns like "8.5/10" or "8.5 out of 10"
  const scaleMatch = text.match(/(\d+\.?\d*)\s*(?:\/|out of)\s*(\d+)/i);
  if (scaleMatch?.[1] && scaleMatch[2]) {
    const value = parseFloat(scaleMatch[1]);
    const scale = parseFloat(scaleMatch[2]);
    if (scale > 0) {
      // Normalize to 0-10 scale
      return (value / scale) * 10;
    }
  }

  // Match standalone number (assume 0-10 scale)
  const numMatch = text.match(/(\d+\.?\d*)/);
  if (numMatch?.[1]) {
    const value = parseFloat(numMatch[1]);
    if (value >= 0 && value <= 10) {
      return value;
    }
  }

  return undefined;
}

/**
 * Parse a date from text.
 * Handles formats like "Dec 17, 2020", "December 17, 2020"
 */
function parseDate(text: string): Date | undefined {
  if (!text) return undefined;

  const dateMatch = text.match(/(\w{3,9})\s+(\d{1,2}),?\s+(\d{4})/);
  if (dateMatch?.[1] && dateMatch[2] && dateMatch[3]) {
    try {
      const date = new Date(`${dateMatch[1]} ${dateMatch[2]}, ${dateMatch[3]}`);
      if (!isNaN(date.getTime())) {
        return date;
      }
    } catch {
      // Date parsing failed
    }
  }

  return undefined;
}

// =============================================================================
// Critic Review Parsing
// =============================================================================

/**
 * Parse critic reviews from the page.
 * Critic reviews typically have publication names, reviewer names, and excerpts.
 *
 * CBR HTML structure for critic reviews:
 * <div class="critic-review">
 *   <div class="rating">9.0</div>
 *   <strong>Major Spoilers</strong> -
 *   <a href="/comic-books/reviewer/matthew-peterson">Matthew Peterson</a>
 *   Aug 23, 2014
 *   <p>Review text excerpt...</p>
 *   <a href="http://majorspoilers.com/...">Read Full Review</a>
 * </div>
 */
function parseCriticReviews(
  $: CheerioAPI,
  limit: number
): CBRParsedReview[] {
  const reviews: CBRParsedReview[] = [];

  // Look for critic review containers
  const criticSelectors = [
    '.critic-review',
    '#critic-reviews .review',
    '[id*="critic-review"]',
    '.critic-reviews .review',
    'table.critic-reviews tr',
    '#critics tr',
  ];

  for (const containerSelector of criticSelectors) {
    $(containerSelector).each((_, el) => {
      if (reviews.length >= limit) return false;

      const $el = $(el);

      // Extract publication name from <strong> or bold text
      const publication =
        $el.find('strong, b').first().text().trim() ||
        $el.find('.publication, .site-name').text().trim();

      // Extract reviewer name from /comic-books/reviewer/ links
      const reviewerLink = $el.find('a[href*="/reviewer/"], a[href*="/comic-books/reviewer/"]').first();
      const reviewerName = reviewerLink.text().trim();
      const reviewerUrl = reviewerLink.attr('href');

      // Prefer reviewer name if available, fall back to publication
      const authorName = reviewerName || publication || 'Critic';

      // Extract rating - look for .rating class or standalone numbers
      let ratingText =
        $el.find('.rating, .score, [class*="rating"]').first().text().trim();

      // If no rating found in class, try to find a standalone number
      if (!ratingText) {
        const textContent = $el.text();
        const ratingMatch = textContent.match(/\b(\d+\.?\d*)\s*$/m) ||
          textContent.match(/\b(\d+\.?\d*)\b/);
        if (ratingMatch?.[1]) {
          const num = parseFloat(ratingMatch[1]);
          if (num >= 0 && num <= 10) {
            ratingText = ratingMatch[1];
          }
        }
      }

      // Extract review excerpt from <p> tags
      const excerpt =
        $el.find('p').first().text().trim() ||
        $el.find('.excerpt, .review-excerpt, .snippet, .review-text').text().trim();

      // Extract "Read Full Review" link
      const reviewLinkEl = $el.find('a[href*="http"]').filter((_, a) => {
        const text = $(a).text().toLowerCase();
        return text.includes('read full review') ||
          text.includes('full review') ||
          text.includes('read review');
      }).first();
      const reviewUrl = reviewLinkEl.attr('href');

      // Extract date - look for date pattern in text
      const fullText = $el.text();
      const dateMatch = fullText.match(/(\w{3,9})\s+(\d{1,2}),?\s+(\d{4})/);
      const date = dateMatch ? parseDate(dateMatch[0]) : undefined;

      // Must have either excerpt or a meaningful review
      if ((authorName || publication) && excerpt && excerpt.length >= 10) {
        reviews.push({
          author: reviewerName ? `${reviewerName} (${publication})` : authorName,
          authorUrl: reviewerUrl ? `https://comicbookroundup.com${reviewerUrl}` : undefined,
          publication: publication || undefined,
          rating: parseRatingValue(ratingText),
          text: excerpt,
          date,
          type: 'critic',
          reviewUrl,
        });
      }

      return true;
    });

    if (reviews.length > 0) break;
  }

  // Fallback: Look for critic review list items
  if (reviews.length === 0) {
    $('[class*="critic"] li, .critic-list li, .reviews-critic li').each((_, el) => {
      if (reviews.length >= limit) return false;

      const $el = $(el);

      // Extract reviewer from /comic-books/reviewer/ link
      const reviewerLink = $el.find('a[href*="/reviewer/"]').first();
      const reviewerName = reviewerLink.text().trim();

      // Extract publication from bold text
      const publication = $el.find('strong, b').first().text().trim();

      // Extract rating
      const ratingText = $el.find('.rating').text().trim();

      // Extract review text
      const excerpt = $el.find('p').first().text().trim();

      // Extract review URL
      const reviewUrl = $el.find('a[href*="http"]').filter((_, a) =>
        $(a).text().toLowerCase().includes('review')
      ).first().attr('href');

      if ((reviewerName || publication) && excerpt && excerpt.length >= 10) {
        reviews.push({
          author: reviewerName
            ? `${reviewerName} (${publication})`
            : publication || 'Critic',
          publication,
          rating: parseRatingValue(ratingText),
          text: excerpt,
          type: 'critic',
          reviewUrl,
        });
      }

      return true;
    });
  }

  logger.debug({ count: reviews.length }, 'Parsed critic reviews');
  return reviews;
}

// =============================================================================
// User Review Parsing
// =============================================================================

/**
 * Parse user reviews from the page.
 *
 * CBR HTML structure: User reviews are in a section with class "user-review"
 * or within a #user-reviews container.
 */
function parseUserReviews(
  $: CheerioAPI,
  limit: number
): CBRParsedReview[] {
  const reviews: CBRParsedReview[] = [];

  // Selectors for user review elements (ordered by likelihood for CBR)
  const reviewSelectors = [
    '.user-review',
    '#user-reviews .review',
    '#user-reviews li',
    '.user-reviews .review',
    '.user-reviews li',
    '.review-item',
    '.review-card',
    '[class*="userReview"]',
    '.reviews-list > div',
    'ul.reviews > li',
  ];

  for (const selector of reviewSelectors) {
    const elements = $(selector);
    if (elements.length > 0) {
      logger.debug({ selector, count: elements.length }, 'Found user review elements');

      elements.each((_, el) => {
        if (reviews.length >= limit) return false;

        const review = parseUserReviewElement($, $(el));
        if (review) {
          reviews.push(review);
        }

        return true;
      });

      if (reviews.length > 0) break;
    }
  }

  // Fallback: Look for user review section and parse its children
  if (reviews.length === 0) {
    const userSection = $('#user-reviews, [id*="user-review"]').first().parent();
    if (userSection.length) {
      userSection.find('li, .review, [class*="review"]').each((_, el) => {
        if (reviews.length >= limit) return false;

        const review = parseUserReviewElement($, $(el));
        if (review) {
          reviews.push(review);
        }

        return true;
      });
    }
  }

  // Last resort: Regex extraction from page text
  if (reviews.length === 0) {
    const pageText = $('body').text();
    const extracted = extractReviewsFromText(pageText, limit);
    reviews.push(...extracted);
  }

  logger.debug({ count: reviews.length }, 'Parsed user reviews');
  return reviews;
}

/**
 * Parse a single user review element.
 * Returns null if no actual review text is found (rating-only reviews are skipped).
 *
 * CBR HTML structure for user reviews:
 * <div class="user-review">
 *   <div class="rating">7.5</div>
 *   <img src="/img/users/avatars/6506.png" />
 *   <a href="/user/profile/6506">Adsun22</a>
 *   Aug 25, 2024
 *   [+ Like] • Comment
 * </div>
 *
 * Note: Most CBR user reviews are rating-only with no text content.
 */
function parseUserReviewElement(
  $: CheerioAPI,
  $el: Cheerio<AnyNode>
): CBRParsedReview | null {
  // Extract author from /user/profile/ links (primary method for CBR)
  const userProfileLink = $el.find('a[href*="/user/profile/"]').first();
  let authorName = userProfileLink.text().trim();
  let authorUrl = userProfileLink.attr('href');

  // Fallback to other selectors
  if (!authorName) {
    authorName =
      $el.find('.author, .reviewer-name, .user-name, .username').first().text().trim() ||
      $el.find('a[href*="/user/"]').first().text().trim();
  }
  if (!authorUrl) {
    authorUrl = $el.find('a[href*="/user/"]').attr('href');
  }

  // Prepend base URL if relative
  if (authorUrl && !authorUrl.startsWith('http')) {
    authorUrl = `https://comicbookroundup.com${authorUrl}`;
  }

  // Extract rating - look for .rating class first
  let ratingText =
    $el.find('.rating, .score, [class*="rating"]').first().text().trim();

  // If no rating from class, try to find standalone number in element
  if (!ratingText) {
    const textContent = $el.text();
    const ratingMatch = textContent.match(/\b(\d+\.?\d*)\b/);
    if (ratingMatch?.[1]) {
      const num = parseFloat(ratingMatch[1]);
      if (num >= 0 && num <= 10) {
        ratingText = ratingMatch[1];
      }
    }
  }

  // Extract review text - ONLY from dedicated text containers
  // Do NOT fall back to $el.text() as that grabs ratings, dates, buttons, etc.
  const reviewTextSelectors = [
    '.review-text',
    '.review-body',
    '.comment-text',
    '.review-content',
    '.user-review-text',
    '.review-excerpt',
  ];

  let reviewText = '';
  for (const selector of reviewTextSelectors) {
    const found = $el.find(selector).first().text().trim();
    if (found && found.length > 0) {
      reviewText = found;
      break;
    }
  }

  // Also try p tags, but only if they're substantial
  if (!reviewText) {
    const pText = $el.find('p').first().text().trim();
    if (pText && isValidReviewText(pText)) {
      reviewText = pText;
    }
  }

  // Skip reviews with no actual text content
  // CBR user reviews are often rating-only with no text
  if (!reviewText || !isValidReviewText(reviewText)) {
    return null;
  }

  // Extract date - look for date pattern in text
  const fullText = $el.text();
  const dateMatch = fullText.match(/(\w{3,9})\s+(\d{1,2}),?\s+(\d{4})/);
  const date = dateMatch ? parseDate(dateMatch[0]) : undefined;

  // Extract likes - CBR shows as "X likes" or just a number near a like button
  const likesText =
    $el.find('.likes, [class*="like"], .helpful').first().text().trim();
  const likesMatch = likesText.match(/(\d+)/);
  const likes = likesMatch?.[1] ? parseInt(likesMatch[1]) : undefined;

  // Clean up review text - remove author name if it's at the start
  let cleanedText = reviewText;
  if (authorName && cleanedText.startsWith(authorName)) {
    cleanedText = cleanedText.slice(authorName.length).replace(/^[:\s-]+/, '').trim();
  }

  // Final validation
  if (!isValidReviewText(cleanedText)) {
    return null;
  }

  return {
    author: authorName || 'Anonymous',
    authorUrl,
    rating: parseRatingValue(ratingText),
    text: cleanedText,
    date,
    likes,
    type: 'user',
  };
}

/**
 * Extract reviews from raw page text using regex patterns.
 * Last resort fallback when HTML structure parsing fails.
 */
function extractReviewsFromText(
  pageText: string,
  limit: number
): CBRParsedReview[] {
  const reviews: CBRParsedReview[] = [];

  // Pattern: Author name followed by rating and review text
  // Example: "Swift Planet 10 Dec 17, 2020 Great issue..."
  const reviewPattern =
    /([A-Za-z][A-Za-z0-9_\s]{2,20})\s+(\d+\.?\d*)\s+(\w{3}\s+\d{1,2},?\s+\d{4})\s+(.+?)(?=(?:[A-Za-z][A-Za-z0-9_\s]{2,20}\s+\d+\.?\d*\s+\w{3})|$)/gs;

  let match;
  let lastIndex = -1;
  let iterations = 0;
  const MAX_ITERATIONS = 1000;

  while (
    (match = reviewPattern.exec(pageText)) !== null &&
    reviews.length < limit &&
    iterations++ < MAX_ITERATIONS
  ) {
    // Safety check: prevent infinite loop if lastIndex doesn't advance
    if (reviewPattern.lastIndex === lastIndex) break;
    lastIndex = reviewPattern.lastIndex;

    const [, author, ratingStr, dateStr, reviewText] = match;

    const trimmedText = reviewText?.trim();
    if (!author || !ratingStr || !trimmedText || !isValidReviewText(trimmedText)) continue;

    const rating = parseFloat(ratingStr);

    reviews.push({
      author: author.trim(),
      rating: rating >= 0 && rating <= 10 ? rating : undefined,
      text: trimmedText,
      date: dateStr ? parseDate(dateStr) : undefined,
      type: 'user',
    });
  }

  return reviews;
}

// =============================================================================
// Main Parser
// =============================================================================

/**
 * Parse all reviews from CBR page HTML.
 *
 * @param html - The page HTML
 * @param limit - Maximum reviews per type (default 15)
 */
export function parseReviews(html: string, limit: number = 15): ParsedReviews {
  const $ = cheerio.load(html);

  const critic = parseCriticReviews($, limit);
  const user = parseUserReviews($, limit);

  return { critic, user };
}
