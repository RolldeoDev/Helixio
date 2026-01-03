/**
 * CBR Review Parser Tests
 *
 * Tests for parsing critic and user reviews from Comic Book Roundup HTML.
 * Uses realistic HTML fixtures based on actual CBR page structure.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger before importing parser
vi.mock('../logger.service.js', () => ({
  createServiceLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Import after mocks
const { parseReviews } = await import('../comicbookroundup/parsers/reviews.js');

// =============================================================================
// Test HTML Fixtures
// =============================================================================

/**
 * Realistic CBR critic review HTML structure.
 * Based on actual pages like /comic-books/reviews/vertigo/fables-the-wolf-among-us/1
 */
function createCriticReviewsHtml(reviews: Array<{
  rating: string;
  ratingColor?: string;
  publication: string;
  reviewer: string;
  reviewerSlug: string;
  date: string;
  text: string;
  reviewUrl?: string;
}>): string {
  const reviewItems = reviews.map((r, i) => `
    <li ${i === 0 ? "class='first'" : ''}>
      <div class="review ${r.ratingColor || 'green'}">${r.rating}</div>
      <div class="review-info">
        <span class="name"><strong>${r.publication}</strong> - <a title="${r.reviewer} Reviews" href="/comic-books/reviewer/${r.reviewerSlug}">${r.reviewer}</a></span>
        <span class="date">${r.date}</span>
      </div>
      <p class="clear">
        ${r.text} ${r.reviewUrl ? `<a href="${r.reviewUrl}" target="_blank">Read Full Review</a>` : ''}
      </p>
    </li>
  `).join('\n');

  return `
    <!DOCTYPE html>
    <html>
    <body>
      <div id='critic-reviews'>
        <div class="section" id="reviews">
          <ul>
            ${reviewItems}
          </ul>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Realistic CBR user review HTML structure.
 */
function createUserReviewsHtml(reviews: Array<{
  rating: string;
  ratingColor?: string;
  username: string;
  userId: string;
  date: string;
  text?: string;
}>): string {
  const reviewItems = reviews.map((r, i) => `
    <li ${i === 0 ? "class='first'" : ''}>
      <div class="user-review ${r.ratingColor || 'green'}">${r.rating}</div>
      <img src='/img/users/avatars/${r.userId}.gif'/>
      <div class="review-info">
        <span class="name"><a href="/user/profile/${r.userId}">${r.username}</a></span>
        <span class="date">${r.date}</span>
      </div>
      <p class="clear">
        ${r.text || ''}
      </p>
      <div class="comments">
        <span class="who-liked">
          <a href='/signin.php' class='LikeEventNotLoggedIn'>+ Like</a>
          <span class="comment-divider"> • </span>
          <a class="CommentsNum">Comment</a>
        </span>
      </div>
    </li>
  `).join('\n');

  return `
    <!DOCTYPE html>
    <html>
    <body>
      <div id='user-reviews'>
        <div class="section" id="reviews">
          <ul>
            ${reviewItems}
          </ul>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Combined HTML with both critic and user reviews.
 */
function createFullPageHtml(
  criticReviews: Parameters<typeof createCriticReviewsHtml>[0],
  userReviews: Parameters<typeof createUserReviewsHtml>[0]
): string {
  const criticItems = criticReviews.map((r, i) => `
    <li ${i === 0 ? "class='first'" : ''}>
      <div class="review ${r.ratingColor || 'green'}">${r.rating}</div>
      <div class="review-info">
        <span class="name"><strong>${r.publication}</strong> - <a title="${r.reviewer} Reviews" href="/comic-books/reviewer/${r.reviewerSlug}">${r.reviewer}</a></span>
        <span class="date">${r.date}</span>
      </div>
      <p class="clear">
        ${r.text} ${r.reviewUrl ? `<a href="${r.reviewUrl}" target="_blank">Read Full Review</a>` : ''}
      </p>
    </li>
  `).join('\n');

  const userItems = userReviews.map((r, i) => `
    <li ${i === 0 ? "class='first'" : ''}>
      <div class="user-review ${r.ratingColor || 'green'}">${r.rating}</div>
      <img src='/img/users/avatars/${r.userId}.gif'/>
      <div class="review-info">
        <span class="name"><a href="/user/profile/${r.userId}">${r.username}</a></span>
        <span class="date">${r.date}</span>
      </div>
      <p class="clear">
        ${r.text || ''}
      </p>
    </li>
  `).join('\n');

  return `
    <!DOCTYPE html>
    <html>
    <body>
      <div class="bottom">
        <div class="container">
          <div class="left">
            <div id='critic-reviews'>
              <div class="section" id="reviews">
                <ul>
                  ${criticItems}
                </ul>
              </div>
            </div>
          </div>
          <div id='user-reviews'>
            <div class="section" id="reviews">
              <ul>
                ${userItems}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

// =============================================================================
// Tests
// =============================================================================

describe('CBR Review Parser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Critic Reviews', () => {
    it('should parse critic review with all fields', () => {
      const html = createCriticReviewsHtml([{
        rating: '9.0',
        ratingColor: 'green',
        publication: 'Weird Science',
        reviewer: 'Jim Werner',
        reviewerSlug: 'jim-werner',
        date: 'Dec 14, 2014',
        text: 'I was really impressed with this comic. Highly recommended!',
        reviewUrl: 'https://www.weirdsciencedccomics.com/2014/12/review.html',
      }]);

      const result = parseReviews(html);

      expect(result.critic).toHaveLength(1);
      const review = result.critic[0]!;
      expect(review.author).toBe('Jim Werner (Weird Science)');
      expect(review.publication).toBe('Weird Science');
      expect(review.rating).toBe(9.0);
      expect(review.text).toContain('I was really impressed');
      expect(review.reviewUrl).toBe('https://www.weirdsciencedccomics.com/2014/12/review.html');
      expect(review.type).toBe('critic');
      expect(review.date).toBeInstanceOf(Date);
      expect(review.authorUrl).toBe('https://comicbookroundup.com/comic-books/reviewer/jim-werner');
    });

    it('should parse multiple critic reviews', () => {
      const html = createCriticReviewsHtml([
        {
          rating: '9.0',
          publication: 'Weird Science',
          reviewer: 'Jim Werner',
          reviewerSlug: 'jim-werner',
          date: 'Dec 14, 2014',
          text: 'Excellent comic! Highly recommended for all fans.',
          reviewUrl: 'https://example.com/review1',
        },
        {
          rating: '8.0',
          publication: 'IGN',
          reviewer: 'Jesse Schedeen',
          reviewerSlug: 'jesse-schedeen',
          date: 'Jan 14, 2015',
          text: 'A solid entry in the series with great art and storytelling.',
          reviewUrl: 'https://www.ign.com/review',
        },
        {
          rating: '7.0',
          ratingColor: 'yellow',
          publication: 'Newsarama',
          reviewer: 'Richard Gray',
          reviewerSlug: 'richard-gray',
          date: 'Jan 14, 2015',
          text: 'Good but not quite up to scratch with the main series.',
        },
      ]);

      const result = parseReviews(html);

      expect(result.critic).toHaveLength(3);
      expect(result.critic[0]!.author).toBe('Jim Werner (Weird Science)');
      expect(result.critic[0]!.rating).toBe(9.0);
      expect(result.critic[1]!.author).toBe('Jesse Schedeen (IGN)');
      expect(result.critic[1]!.rating).toBe(8.0);
      expect(result.critic[2]!.author).toBe('Richard Gray (Newsarama)');
      expect(result.critic[2]!.rating).toBe(7.0);
      expect(result.critic[2]!.reviewUrl).toBeUndefined();
    });

    it('should handle critic review without reviewer name (publication only)', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <body>
          <div id='critic-reviews'>
            <div class="section">
              <ul>
                <li>
                  <div class="review green">8.2</div>
                  <div class="review-info">
                    <span class="name"><strong>The Latest Pull</strong> - <a title=" Reviews" href="/comic-books/reviewer/"></a></span>
                    <span class="date">Jan 16, 2015</span>
                  </div>
                  <p class="clear">
                    Overall, this is an interesting adaptation with great potential.
                    <a href="http://thelatestpull.com/review" target="_blank">Read Full Review</a>
                  </p>
                </li>
              </ul>
            </div>
          </div>
        </body>
        </html>
      `;

      const result = parseReviews(html);

      expect(result.critic).toHaveLength(1);
      const review = result.critic[0]!;
      // When no reviewer name, should fall back to publication
      expect(review.author).toBe('The Latest Pull');
      expect(review.publication).toBe('The Latest Pull');
      expect(review.rating).toBe(8.2);
    });

    it('should strip "Read Full Review" text from review excerpt', () => {
      const html = createCriticReviewsHtml([{
        rating: '8.0',
        publication: 'Test Pub',
        reviewer: 'Test Author',
        reviewerSlug: 'test-author',
        date: 'Jan 1, 2020',
        text: 'This is a great comic with excellent artwork.',
        reviewUrl: 'https://example.com/review',
      }]);

      const result = parseReviews(html);

      expect(result.critic).toHaveLength(1);
      expect(result.critic[0]!.text).not.toContain('Read Full Review');
      expect(result.critic[0]!.text).toContain('This is a great comic');
    });

    it('should parse decimal ratings correctly', () => {
      const html = createCriticReviewsHtml([
        { rating: '8.5', publication: 'Pub1', reviewer: 'R1', reviewerSlug: 'r1', date: 'Jan 1, 2020', text: 'Review one with detailed analysis.' },
        { rating: '6.5', publication: 'Pub2', reviewer: 'R2', reviewerSlug: 'r2', date: 'Jan 2, 2020', text: 'Review two with more thoughts.' },
      ]);

      const result = parseReviews(html);

      expect(result.critic[0]!.rating).toBe(8.5);
      expect(result.critic[1]!.rating).toBe(6.5);
    });
  });

  describe('User Reviews', () => {
    it('should parse user review with text content', () => {
      const html = createUserReviewsHtml([{
        rating: '8.0',
        username: 'ComicFan123',
        userId: '12345',
        date: 'Mar 15, 2020',
        text: 'This is a fantastic issue! The art is beautiful and the story keeps you hooked throughout.',
      }]);

      const result = parseReviews(html);

      expect(result.user).toHaveLength(1);
      const review = result.user[0]!;
      expect(review.author).toBe('ComicFan123');
      expect(review.rating).toBe(8.0);
      expect(review.text).toContain('fantastic issue');
      expect(review.type).toBe('user');
      expect(review.date).toBeInstanceOf(Date);
      expect(review.authorUrl).toBe('https://comicbookroundup.com/user/profile/12345');
    });

    it('should skip rating-only user reviews (no text)', () => {
      const html = createUserReviewsHtml([
        {
          rating: '7.0',
          username: 'User1',
          userId: '111',
          date: 'Jan 1, 2020',
          // No text - rating only
        },
        {
          rating: '9.0',
          username: 'User2',
          userId: '222',
          date: 'Jan 2, 2020',
          text: 'Great comic with amazing artwork and compelling storyline!',
        },
      ]);

      const result = parseReviews(html);

      // Only the review with text should be parsed
      expect(result.user).toHaveLength(1);
      expect(result.user[0]!.author).toBe('User2');
    });

    it('should handle user reviews with minimal text (under threshold)', () => {
      const html = createUserReviewsHtml([{
        rating: '5.0',
        username: 'ShortReviewer',
        userId: '999',
        date: 'Jan 1, 2020',
        text: 'Good.', // Too short
      }]);

      const result = parseReviews(html);

      // Short text should be filtered out
      expect(result.user).toHaveLength(0);
    });
  });

  describe('Mixed Content', () => {
    it('should parse both critic and user reviews from same page', () => {
      const html = createFullPageHtml(
        [{
          rating: '9.0',
          publication: 'IGN',
          reviewer: 'Test Critic',
          reviewerSlug: 'test-critic',
          date: 'Jan 1, 2020',
          text: 'This is an excellent issue that showcases the best of the series.',
          reviewUrl: 'https://ign.com/review',
        }],
        [{
          rating: '8.0',
          username: 'TestUser',
          userId: '12345',
          date: 'Jan 2, 2020',
          text: 'Really enjoyed this issue! The story and art are both top-notch.',
        }]
      );

      const result = parseReviews(html);

      expect(result.critic).toHaveLength(1);
      expect(result.user).toHaveLength(1);
      expect(result.critic[0]!.type).toBe('critic');
      expect(result.user[0]!.type).toBe('user');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty HTML gracefully', () => {
      const result = parseReviews('<html><body></body></html>');

      expect(result.critic).toHaveLength(0);
      expect(result.user).toHaveLength(0);
    });

    it('should handle HTML with no review sections', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <body>
          <h1>Batman #1</h1>
          <p>Some content but no reviews.</p>
        </body>
        </html>
      `;

      const result = parseReviews(html);

      expect(result.critic).toHaveLength(0);
      expect(result.user).toHaveLength(0);
    });

    it('should respect limit parameter', () => {
      const html = createCriticReviewsHtml([
        { rating: '9.0', publication: 'Pub1', reviewer: 'R1', reviewerSlug: 'r1', date: 'Jan 1, 2020', text: 'Review one is quite detailed and thorough.' },
        { rating: '8.0', publication: 'Pub2', reviewer: 'R2', reviewerSlug: 'r2', date: 'Jan 2, 2020', text: 'Review two with another perspective on the issue.' },
        { rating: '7.0', publication: 'Pub3', reviewer: 'R3', reviewerSlug: 'r3', date: 'Jan 3, 2020', text: 'Review three offers a different take on things.' },
        { rating: '6.0', publication: 'Pub4', reviewer: 'R4', reviewerSlug: 'r4', date: 'Jan 4, 2020', text: 'Review four is more critical of the storytelling.' },
      ]);

      const result = parseReviews(html, 2);

      expect(result.critic).toHaveLength(2);
      expect(result.critic[0]!.publication).toBe('Pub1');
      expect(result.critic[1]!.publication).toBe('Pub2');
    });
  });
});
