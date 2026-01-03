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
 * <div id="critic-reviews">
 *   <div class="section" id="reviews">
 *     <ul>
 *       <li>
 *         <div class="review green">9.0</div>
 *         <div class="review-info">
 *           <span class="name"><strong>Publication</strong> - <a href="/comic-books/reviewer/name">Reviewer</a></span>
 *           <span class="date">Dec 14, 2014</span>
 *         </div>
 *         <p class="clear">Review text... <a href="https://...">Read Full Review</a></p>
 *       </li>
 *     </ul>
 *   </div>
 * </div>
 */
function parseCriticReviews(
  $: CheerioAPI,
  limit: number
): CBRParsedReview[] {
  const reviews: CBRParsedReview[] = [];

  // Primary selectors for CBR's actual HTML structure
  // Reviews are in #critic-reviews container as <li> elements
  const criticSelectors = [
    '#critic-reviews li',
    '#critic-reviews ul li',
    '#critic-reviews .section li',
    // Fallback selectors for alternative structures
    '.critic-review',
    '[id*="critic-review"] li',
    '.critic-reviews li',
  ];

  for (const containerSelector of criticSelectors) {
    const elements = $(containerSelector);
    if (elements.length === 0) continue;

    logger.debug({ selector: containerSelector, count: elements.length }, 'Found critic review elements');

    elements.each((_, el) => {
      if (reviews.length >= limit) return false;

      const $el = $(el);

      // Extract publication name from span.name > strong
      const publication =
        $el.find('span.name strong').first().text().trim() ||
        $el.find('.review-info strong').first().text().trim() ||
        $el.find('strong, b').first().text().trim();

      // Extract reviewer name from /comic-books/reviewer/ links
      const reviewerLink = $el.find('a[href*="/reviewer/"], a[href*="/comic-books/reviewer/"]').first();
      const reviewerName = reviewerLink.text().trim();
      const reviewerUrl = reviewerLink.attr('href');

      // Extract rating from div.review (CBR uses classes like "review green", "review yellow")
      let ratingText =
        $el.find('div.review').first().text().trim() ||
        $el.find('.rating, .score').first().text().trim();

      // If no rating found, try to find a standalone number at the start
      if (!ratingText) {
        const textContent = $el.text();
        const ratingMatch = textContent.match(/^\s*(\d+\.?\d*)\b/);
        if (ratingMatch?.[1]) {
          const num = parseFloat(ratingMatch[1]);
          if (num >= 0 && num <= 10) {
            ratingText = ratingMatch[1];
          }
        }
      }

      // Extract date from span.date
      let date: Date | undefined;
      const dateSpan = $el.find('span.date, .date').first().text().trim();
      if (dateSpan) {
        date = parseDate(dateSpan);
      }
      // Fallback: look for date pattern in text
      if (!date) {
        const fullText = $el.text();
        const dateMatch = fullText.match(/(\w{3,9})\s+(\d{1,2}),?\s+(\d{4})/);
        if (dateMatch) {
          date = parseDate(dateMatch[0]);
        }
      }

      // Extract review text from p.clear (remove the "Read Full Review" link text)
      let excerpt = '';
      const reviewParagraph = $el.find('p.clear, p').first();
      if (reviewParagraph.length) {
        // Clone to avoid modifying the DOM
        const $clone = reviewParagraph.clone();
        // Remove the "Read Full Review" link from the text
        $clone.find('a').each((_, a) => {
          const linkText = $(a).text().toLowerCase();
          if (linkText.includes('read full review') || linkText.includes('read review')) {
            $(a).remove();
          }
        });
        excerpt = $clone.text().trim();
      }
      if (!excerpt) {
        excerpt = $el.find('.excerpt, .review-excerpt, .snippet, .review-text').text().trim();
      }

      // Extract "Read Full Review" link - look for external link with review text
      let reviewUrl: string | undefined;
      const reviewLinkEl = $el.find('a[target="_blank"], a[href^="http"]').filter((_, a) => {
        const text = $(a).text().toLowerCase();
        const href = $(a).attr('href') || '';
        // Match links that say "Read Full Review" OR are external links in the review paragraph
        return (text.includes('read full review') ||
          text.includes('full review') ||
          text.includes('read review')) ||
          (href.startsWith('http') && !href.includes('comicbookroundup.com'));
      }).first();
      reviewUrl = reviewLinkEl.attr('href');

      // Build author string
      let author: string;
      if (reviewerName && publication) {
        author = `${reviewerName} (${publication})`;
      } else if (reviewerName) {
        author = reviewerName;
      } else if (publication) {
        author = publication;
      } else {
        author = 'Critic';
      }

      // Must have meaningful review text
      if (excerpt && excerpt.length >= 10) {
        reviews.push({
          author,
          authorUrl: reviewerUrl ? `https://comicbookroundup.com${reviewerUrl}` : undefined,
          publication: publication || undefined,
          rating: parseRatingValue(ratingText),
          text: excerpt,
          date,
          type: 'critic',
          reviewUrl,
        });

        logger.debug({
          author,
          publication,
          hasReviewUrl: !!reviewUrl,
          rating: parseRatingValue(ratingText),
        }, 'Parsed critic review');
      }

      return true;
    });

    if (reviews.length > 0) break;
  }

  // Fallback: Look for any list items with reviewer links (less specific)
  if (reviews.length === 0) {
    $('li').filter((_, el) => {
      // Only consider <li> elements that have a reviewer link
      return $(el).find('a[href*="/reviewer/"]').length > 0;
    }).each((_, el) => {
      if (reviews.length >= limit) return false;

      const $el = $(el);

      // Extract reviewer from /comic-books/reviewer/ link
      const reviewerLink = $el.find('a[href*="/reviewer/"]').first();
      const reviewerName = reviewerLink.text().trim();
      const reviewerUrl = reviewerLink.attr('href');

      // Extract publication from bold text
      const publication = $el.find('strong, b').first().text().trim();

      // Extract rating
      const ratingText = $el.find('div.review, .rating').first().text().trim();

      // Extract review text
      const excerpt = $el.find('p').first().text().trim()
        .replace(/read full review$/i, '').trim();

      // Extract review URL
      const reviewUrl = $el.find('a[target="_blank"], a[href^="http"]').filter((_, a) =>
        !$(a).attr('href')?.includes('comicbookroundup.com')
      ).first().attr('href');

      if ((reviewerName || publication) && excerpt && excerpt.length >= 10) {
        reviews.push({
          author: reviewerName
            ? `${reviewerName} (${publication})`
            : publication || 'Critic',
          authorUrl: reviewerUrl ? `https://comicbookroundup.com${reviewerUrl}` : undefined,
          publication: publication || undefined,
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
 * CBR HTML structure for user reviews:
 * <div id="user-reviews">
 *   <div class="section" id="reviews">
 *     <ul>
 *       <li>
 *         <div class="user-review yellow">6.0</div>
 *         <img src="/img/users/avatars/ID.gif"/>
 *         <div class="review-info">
 *           <span class="name"><a href="/user/profile/ID">Username</a></span>
 *           <span class="date">Jun 28, 2015</span>
 *         </div>
 *         <p class="clear">Review text (if any)</p>
 *       </li>
 *     </ul>
 *   </div>
 * </div>
 */
function parseUserReviews(
  $: CheerioAPI,
  limit: number
): CBRParsedReview[] {
  const reviews: CBRParsedReview[] = [];

  // Selectors for user review elements (ordered by likelihood for CBR)
  // Note: .user-review matches the rating div, not the container - so prioritize #user-reviews li
  const reviewSelectors = [
    '#user-reviews li',
    '#user-reviews ul li',
    '#user-reviews .section li',
    // Fallback selectors for alternative structures
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
    const userSection = $('#user-reviews, [id*="user-review"]').first();
    if (userSection.length) {
      userSection.find('li').each((_, el) => {
        if (reviews.length >= limit) return false;

        const review = parseUserReviewElement($, $(el));
        if (review) {
          reviews.push(review);
        }

        return true;
      });
    }
  }

  // Note: We intentionally do NOT use the extractReviewsFromText fallback here
  // because it scans the entire page and would duplicate critic reviews as user reviews.
  // The structured HTML parsing above is sufficient for CBR's user review format.

  logger.debug({ count: reviews.length }, 'Parsed user reviews');
  return reviews;
}

/**
 * Parse a single user review element.
 * Returns null if no actual review text is found (rating-only reviews are skipped).
 *
 * CBR HTML structure for user reviews:
 * <li>
 *   <div class="user-review yellow">6.0</div>
 *   <img src="/img/users/avatars/1072.gif"/>
 *   <div class="review-info">
 *     <span class="name"><a href="/user/profile/1072">TheRed</a></span>
 *     <span class="date">Jun 28, 2015</span>
 *   </div>
 *   <p class="clear">Review text (if any)</p>
 * </li>
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

  // Fallback: Look in span.name or other user link patterns
  if (!authorName) {
    authorName =
      $el.find('span.name a').first().text().trim() ||
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

  // Extract rating from div.user-review (CBR uses classes like "user-review yellow", "user-review green")
  let ratingText =
    $el.find('div.user-review').first().text().trim() ||
    $el.find('.rating, .score').first().text().trim();

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

  // Extract date from span.date first
  let date: Date | undefined;
  const dateSpan = $el.find('span.date, .date').first().text().trim();
  if (dateSpan) {
    date = parseDate(dateSpan);
  }
  // Fallback: look for date pattern in text
  if (!date) {
    const fullText = $el.text();
    const dateMatch = fullText.match(/(\w{3,9})\s+(\d{1,2}),?\s+(\d{4})/);
    if (dateMatch) {
      date = parseDate(dateMatch[0]);
    }
  }

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
