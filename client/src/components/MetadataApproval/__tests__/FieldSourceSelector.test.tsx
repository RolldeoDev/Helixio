/**
 * FieldSourceSelector Component Tests
 *
 * Tests for the per-field source selection component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FieldSourceSelector } from '../FieldSourceSelector';
import type { MetadataSource } from '../../../services/api.service';

describe('FieldSourceSelector', () => {
  const defaultProps = {
    fieldName: 'publisher',
    fieldLabel: 'Publisher',
    allValues: {
      comicvine: 'DC Comics',
      metron: 'DC',
      gcd: null,
    } as Record<MetadataSource, unknown>,
    selectedSource: 'comicvine' as MetadataSource,
    onSourceChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render with field label', () => {
      render(<FieldSourceSelector {...defaultProps} />);
      expect(screen.getByText('Publisher')).toBeInTheDocument();
    });

    it('should show selected value', () => {
      render(<FieldSourceSelector {...defaultProps} />);
      expect(screen.getByText('DC Comics')).toBeInTheDocument();
    });

    it('should display source badge for selected source', () => {
      render(<FieldSourceSelector {...defaultProps} />);
      // The ComicVine badge should be visible (full name in multi-source mode)
      expect(screen.getByText('ComicVine')).toBeInTheDocument();
    });
  });

  describe('Multiple Sources', () => {
    it('should show radio options when multiple sources have values', () => {
      render(<FieldSourceSelector {...defaultProps} />);

      // Should show both ComicVine and Metron options (gcd is null)
      expect(screen.getByText('ComicVine')).toBeInTheDocument();
      expect(screen.getByText('Metron')).toBeInTheDocument();
    });

    it('should call onSourceChange when different source is selected', () => {
      const onSourceChange = vi.fn();
      render(
        <FieldSourceSelector {...defaultProps} onSourceChange={onSourceChange} />
      );

      // Find and click the Metron option
      const metronRadio = screen.getByRole('radio', { name: /Metron/i });
      fireEvent.click(metronRadio);

      expect(onSourceChange).toHaveBeenCalledWith('metron');
    });

    it('should mark selected source with checkmark', () => {
      render(<FieldSourceSelector {...defaultProps} />);

      // The selected source should have a check indicator
      const checkmark = screen.getByText('✓');
      expect(checkmark).toBeInTheDocument();
    });
  });

  describe('Single Source', () => {
    it('should not show radio options when only one source has value', () => {
      const singleSourceProps = {
        ...defaultProps,
        allValues: {
          comicvine: 'DC Comics',
          metron: null,
          gcd: undefined,
        } as Record<MetadataSource, unknown>,
      };

      render(<FieldSourceSelector {...singleSourceProps} />);

      // Should only show the value, not radio buttons
      expect(screen.getByText('DC Comics')).toBeInTheDocument();
      expect(screen.queryByRole('radio')).toBeNull();
    });
  });

  describe('Lock Functionality', () => {
    it('should show unlock icon by default', () => {
      const onLockToggle = vi.fn();
      render(
        <FieldSourceSelector {...defaultProps} onLockToggle={onLockToggle} />
      );

      // Should show the unlock button
      const lockButton = screen.getByTitle(/Lock field/i);
      expect(lockButton).toBeInTheDocument();
    });

    it('should show lock icon when locked', () => {
      const onLockToggle = vi.fn();
      render(
        <FieldSourceSelector
          {...defaultProps}
          locked={true}
          onLockToggle={onLockToggle}
        />
      );

      // Should show the locked button
      const lockButton = screen.getByTitle(/Unlock field/i);
      expect(lockButton).toBeInTheDocument();
    });

    it('should call onLockToggle when lock button clicked', () => {
      const onLockToggle = vi.fn();
      render(
        <FieldSourceSelector {...defaultProps} onLockToggle={onLockToggle} />
      );

      const lockButton = screen.getByTitle(/Lock field/i);
      fireEvent.click(lockButton);

      expect(onLockToggle).toHaveBeenCalled();
    });

    it('should disable radio buttons when locked', () => {
      render(
        <FieldSourceSelector
          {...defaultProps}
          locked={true}
          onLockToggle={() => {}}
        />
      );

      const radioButtons = screen.getAllByRole('radio');
      radioButtons.forEach((radio) => {
        expect(radio).toBeDisabled();
      });
    });
  });

  describe('Inline Mode', () => {
    it('should render compactly in inline mode', () => {
      render(<FieldSourceSelector {...defaultProps} inline={true} />);

      // In inline mode, the field label is not shown
      expect(screen.queryByText('Publisher')).toBeNull();

      // But the value and source badge should still be visible
      expect(screen.getByText(/DC Comics/)).toBeInTheDocument();
      expect(screen.getByText('CV')).toBeInTheDocument();
    });

    it('should show expand button in inline mode when multiple sources', () => {
      render(<FieldSourceSelector {...defaultProps} inline={true} />);

      const expandButton = screen.getByTitle('Choose different source');
      expect(expandButton).toBeInTheDocument();
    });

    it('should expand dropdown when expand button clicked', () => {
      render(<FieldSourceSelector {...defaultProps} inline={true} />);

      const expandButton = screen.getByTitle('Choose different source');
      fireEvent.click(expandButton);

      // Dropdown should now show source options
      expect(screen.getByText('ComicVine')).toBeInTheDocument();
      expect(screen.getByText('Metron')).toBeInTheDocument();
    });
  });

  describe('Value Formatting', () => {
    it('should display null/undefined as dash', () => {
      const nullValueProps = {
        ...defaultProps,
        allValues: {
          comicvine: null,
          metron: 'DC',
          gcd: undefined,
        } as Record<MetadataSource, unknown>,
        selectedSource: 'comicvine' as MetadataSource,
      };

      render(<FieldSourceSelector {...nullValueProps} />);
      expect(screen.getByText('-')).toBeInTheDocument();
    });

    it('should format arrays correctly', () => {
      const arrayValueProps = {
        ...defaultProps,
        fieldName: 'characters',
        fieldLabel: 'Characters',
        allValues: {
          comicvine: ['Batman', 'Robin', 'Alfred'],
          metron: ['Bruce Wayne'],
          gcd: null,
        } as Record<MetadataSource, unknown>,
        selectedSource: 'comicvine' as MetadataSource,
      };

      render(<FieldSourceSelector {...arrayValueProps} />);
      expect(screen.getByText('Batman, Robin, Alfred')).toBeInTheDocument();
    });

    it('should use custom formatter when provided', () => {
      const customFormatter = (value: unknown) => {
        if (typeof value === 'number') return `$${value.toFixed(2)}`;
        return String(value);
      };

      const numberValueProps = {
        ...defaultProps,
        fieldName: 'price',
        fieldLabel: 'Price',
        allValues: {
          comicvine: 3.99,
          metron: 4.99,
          gcd: null,
        } as Record<MetadataSource, unknown>,
        selectedSource: 'comicvine' as MetadataSource,
        formatValue: customFormatter,
      };

      render(<FieldSourceSelector {...numberValueProps} />);
      expect(screen.getByText('$3.99')).toBeInTheDocument();
    });

    it('should handle Credit array format', () => {
      const creditsValueProps = {
        ...defaultProps,
        fieldName: 'creators',
        fieldLabel: 'Creators',
        allValues: {
          comicvine: [
            { name: 'Scott Snyder', role: 'writer' },
            { name: 'Greg Capullo', role: 'artist' },
          ],
          metron: [{ name: 'Scott Snyder', role: 'writer' }],
          gcd: null,
        } as Record<MetadataSource, unknown>,
        selectedSource: 'comicvine' as MetadataSource,
      };

      render(<FieldSourceSelector {...creditsValueProps} />);
      expect(screen.getByText('Scott Snyder, Greg Capullo')).toBeInTheDocument();
    });
  });

  describe('Source Ordering', () => {
    it('should sort sources in priority order (comicvine, metron, gcd)', () => {
      const reorderedProps = {
        ...defaultProps,
        allValues: {
          gcd: 'Grand Comics Database',
          metron: 'Metron DB',
          comicvine: 'ComicVine',
        } as Record<MetadataSource, unknown>,
      };

      render(<FieldSourceSelector {...reorderedProps} />);

      // Get all source labels
      const labels = screen.getAllByRole('radio');

      // The labels should be in priority order
      expect(labels[0]).toHaveAccessibleName(/ComicVine/i);
    });
  });
});
