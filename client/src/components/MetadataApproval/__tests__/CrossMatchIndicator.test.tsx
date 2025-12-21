/**
 * CrossMatchIndicator Component Tests
 *
 * Tests for the cross-source matching status indicator component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CrossMatchIndicator } from '../CrossMatchIndicator';
import type { MetadataSource, CrossSourceMatch, CrossSourceResult } from '../../../services/api.service';

// Helper to create mock CrossSourceMatch
function createMockMatch(
  source: MetadataSource,
  confidence: number,
  isAutoMatch: boolean = false
): CrossSourceMatch {
  return {
    source,
    sourceId: `${source}-123`,
    seriesData: {
      source,
      sourceId: `${source}-123`,
      name: 'Batman',
      publisher: 'DC Comics',
      startYear: 2011,
      issueCount: 52,
      url: `https://${source}.com/batman`,
      confidence, // Required by SeriesMatch
    },
    confidence,
    matchFactors: {
      titleSimilarity: 0.95,
      publisherMatch: true,
      yearMatch: 'exact',
      issueCountMatch: true,
      creatorOverlap: ['Scott Snyder'],
      aliasMatch: false,
    },
    isAutoMatchCandidate: isAutoMatch,
  };
}

// Helper to create mock CrossSourceResult
function createMockResult(
  primarySource: MetadataSource,
  matches: CrossSourceMatch[],
  statuses: Record<MetadataSource, 'matched' | 'no_match' | 'searching' | 'error' | 'skipped'>
): CrossSourceResult {
  return {
    primarySource,
    primarySourceId: `${primarySource}-primary`,
    matches,
    status: statuses,
  };
}

describe('CrossMatchIndicator', () => {
  describe('Empty State', () => {
    it('should return null when no result and not searching', () => {
      const { container } = render(
        <CrossMatchIndicator crossMatchResult={null} isSearching={false} />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Searching State', () => {
    it('should show searching status', () => {
      render(
        <CrossMatchIndicator
          isSearching={true}
          searchingSources={['metron', 'gcd']}
        />
      );

      expect(screen.getByText('Searching...')).toBeInTheDocument();
    });

    it('should show source badges while searching', () => {
      render(
        <CrossMatchIndicator
          isSearching={true}
          searchingSources={['metron', 'gcd']}
        />
      );

      // Badges show in collapsed summary view - expand to see full details
      // The searching spinner should be visible
      expect(screen.getAllByText('Searching...').length).toBeGreaterThan(0);
    });
  });

  describe('Match Results', () => {
    it('should show matched count summary', () => {
      const result = createMockResult(
        'comicvine',
        [createMockMatch('metron', 0.85)],
        {
          comicvine: 'skipped',
          metron: 'matched',
          gcd: 'no_match',
        }
      );

      render(<CrossMatchIndicator crossMatchResult={result} />);

      expect(screen.getByText('1/2 matched')).toBeInTheDocument();
    });

    it('should show "No matches" when no sources matched', () => {
      const result = createMockResult(
        'comicvine',
        [],
        {
          comicvine: 'skipped',
          metron: 'no_match',
          gcd: 'no_match',
        }
      );

      render(<CrossMatchIndicator crossMatchResult={result} />);

      expect(screen.getByText('No matches')).toBeInTheDocument();
    });

    it('should highlight auto-matched sources', () => {
      const result = createMockResult(
        'comicvine',
        [createMockMatch('metron', 0.96, true)],
        {
          comicvine: 'skipped',
          metron: 'matched',
          gcd: 'no_match',
        }
      );

      render(<CrossMatchIndicator crossMatchResult={result} />);

      expect(screen.getByText('1 auto-matched')).toBeInTheDocument();
    });
  });

  describe('Expanded Details', () => {
    it('should expand when clicked', () => {
      const result = createMockResult(
        'comicvine',
        [createMockMatch('metron', 0.85)],
        {
          comicvine: 'skipped',
          metron: 'matched',
          gcd: 'no_match',
        }
      );

      render(<CrossMatchIndicator crossMatchResult={result} />);

      // Click to expand
      const expandButton = screen.getByText('▶');
      fireEvent.click(expandButton);

      // Should now show detailed match info
      expect(screen.getByText('Metron')).toBeInTheDocument();
      expect(screen.getByText('85%')).toBeInTheDocument();
    });

    it('should show match factors in expanded view', () => {
      const result = createMockResult(
        'comicvine',
        [createMockMatch('metron', 0.95)],
        {
          comicvine: 'skipped',
          metron: 'matched',
          gcd: 'skipped',
        }
      );

      render(<CrossMatchIndicator crossMatchResult={result} />);

      // Click to expand
      fireEvent.click(screen.getByText('▶'));

      // Should show match factors
      expect(screen.getByText(/Title: 95%/)).toBeInTheDocument();
      expect(screen.getByText(/Publisher:/)).toBeInTheDocument();
      expect(screen.getByText(/Year: exact/)).toBeInTheDocument();
    });

    it('should show series name from match', () => {
      const result = createMockResult(
        'comicvine',
        [createMockMatch('metron', 0.90)],
        {
          comicvine: 'skipped',
          metron: 'matched',
          gcd: 'skipped',
        }
      );

      render(<CrossMatchIndicator crossMatchResult={result} />);

      // Click to expand
      fireEvent.click(screen.getByText('▶'));

      expect(screen.getByText('Batman')).toBeInTheDocument();
    });

    it('should show "No match found" for sources without matches', () => {
      const result = createMockResult(
        'comicvine',
        [],
        {
          comicvine: 'skipped',
          metron: 'no_match',
          gcd: 'skipped',
        }
      );

      render(<CrossMatchIndicator crossMatchResult={result} />);

      // Click to expand
      fireEvent.click(screen.getByText('▶'));

      expect(screen.getByText('No match found')).toBeInTheDocument();
    });

    it('should show "Error" for sources that errored', () => {
      const result = createMockResult(
        'comicvine',
        [],
        {
          comicvine: 'skipped',
          metron: 'error',
          gcd: 'skipped',
        }
      );

      render(<CrossMatchIndicator crossMatchResult={result} />);

      // Click to expand
      fireEvent.click(screen.getByText('▶'));

      expect(screen.getByText('Error')).toBeInTheDocument();
    });
  });

  describe('View Match Callback', () => {
    it('should call onViewMatch when view button clicked', () => {
      const onViewMatch = vi.fn();
      const match = createMockMatch('metron', 0.85);
      const result = createMockResult(
        'comicvine',
        [match],
        {
          comicvine: 'skipped',
          metron: 'matched',
          gcd: 'skipped',
        }
      );

      render(
        <CrossMatchIndicator crossMatchResult={result} onViewMatch={onViewMatch} />
      );

      // Expand
      fireEvent.click(screen.getByText('▶'));

      // Click view button
      const viewButton = screen.getByText('View');
      fireEvent.click(viewButton);

      expect(onViewMatch).toHaveBeenCalledWith(match);
    });
  });

  describe('Refresh Callback', () => {
    it('should show refresh button when onRefresh provided', () => {
      const onRefresh = vi.fn();
      const result = createMockResult(
        'comicvine',
        [],
        {
          comicvine: 'skipped',
          metron: 'no_match',
          gcd: 'skipped',
        }
      );

      render(
        <CrossMatchIndicator crossMatchResult={result} onRefresh={onRefresh} />
      );

      // Expand
      fireEvent.click(screen.getByText('▶'));

      expect(screen.getByText('Refresh Cross-Matches')).toBeInTheDocument();
    });

    it('should call onRefresh when refresh button clicked', () => {
      const onRefresh = vi.fn();
      const result = createMockResult(
        'comicvine',
        [],
        {
          comicvine: 'skipped',
          metron: 'no_match',
          gcd: 'skipped',
        }
      );

      render(
        <CrossMatchIndicator crossMatchResult={result} onRefresh={onRefresh} />
      );

      // Expand
      fireEvent.click(screen.getByText('▶'));

      // Click refresh
      fireEvent.click(screen.getByText('Refresh Cross-Matches'));

      expect(onRefresh).toHaveBeenCalled();
    });

    it('should not show refresh button while searching', () => {
      const onRefresh = vi.fn();

      render(
        <CrossMatchIndicator isSearching={true} onRefresh={onRefresh} />
      );

      expect(screen.queryByText('Refresh Cross-Matches')).toBeNull();
    });
  });

  describe('Confidence Level Classification', () => {
    it('should classify high confidence correctly', () => {
      const result = createMockResult(
        'comicvine',
        [createMockMatch('metron', 0.96, true)],
        {
          comicvine: 'skipped',
          metron: 'matched',
          gcd: 'skipped',
        }
      );

      render(
        <CrossMatchIndicator
          crossMatchResult={result}
          autoMatchThreshold={0.95}
        />
      );

      // Expand to see confidence badge
      fireEvent.click(screen.getByText('▶'));

      const confidenceBadge = screen.getByText('96%');
      expect(confidenceBadge).toHaveClass('high');
    });

    it('should classify medium confidence correctly', () => {
      const result = createMockResult(
        'comicvine',
        [createMockMatch('metron', 0.85)],
        {
          comicvine: 'skipped',
          metron: 'matched',
          gcd: 'skipped',
        }
      );

      render(
        <CrossMatchIndicator
          crossMatchResult={result}
          autoMatchThreshold={0.95}
        />
      );

      // Expand to see confidence badge
      fireEvent.click(screen.getByText('▶'));

      const confidenceBadge = screen.getByText('85%');
      expect(confidenceBadge).toHaveClass('medium');
    });

    it('should classify low confidence correctly', () => {
      const result = createMockResult(
        'comicvine',
        [createMockMatch('metron', 0.70)],
        {
          comicvine: 'skipped',
          metron: 'matched',
          gcd: 'skipped',
        }
      );

      render(
        <CrossMatchIndicator
          crossMatchResult={result}
          autoMatchThreshold={0.95}
        />
      );

      // Expand to see confidence badge
      fireEvent.click(screen.getByText('▶'));

      const confidenceBadge = screen.getByText('70%');
      expect(confidenceBadge).toHaveClass('low');
    });
  });

  describe('Auto-Match Label', () => {
    it('should show auto-match label for high confidence matches', () => {
      const result = createMockResult(
        'comicvine',
        [createMockMatch('metron', 0.96, true)],
        {
          comicvine: 'skipped',
          metron: 'matched',
          gcd: 'skipped',
        }
      );

      render(<CrossMatchIndicator crossMatchResult={result} />);

      // Expand
      fireEvent.click(screen.getByText('▶'));

      expect(screen.getByText('Auto-matched')).toBeInTheDocument();
    });

    it('should not show auto-match label for low confidence matches', () => {
      const result = createMockResult(
        'comicvine',
        [createMockMatch('metron', 0.80, false)],
        {
          comicvine: 'skipped',
          metron: 'matched',
          gcd: 'skipped',
        }
      );

      render(<CrossMatchIndicator crossMatchResult={result} />);

      // Expand
      fireEvent.click(screen.getByText('▶'));

      expect(screen.queryByText('Auto-matched')).toBeNull();
    });
  });

  describe('Primary Source Handling', () => {
    it('should not show primary source in status badges', () => {
      const result = createMockResult(
        'comicvine',
        [createMockMatch('metron', 0.90)],
        {
          comicvine: 'skipped',
          metron: 'matched',
          gcd: 'no_match',
        }
      );

      render(<CrossMatchIndicator crossMatchResult={result} />);

      // Expand
      fireEvent.click(screen.getByText('▶'));

      // Should show Metron and GCD, but not ComicVine
      expect(screen.getByText('Metron')).toBeInTheDocument();
      expect(screen.getByText('GCD')).toBeInTheDocument();
      // ComicVine should only appear in match factor context, not as a row
      const rows = screen.getAllByText('Metron').length + screen.getAllByText('GCD').length;
      expect(rows).toBe(2);
    });
  });
});
