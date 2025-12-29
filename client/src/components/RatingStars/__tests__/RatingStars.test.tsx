/**
 * RatingStars Component Tests
 *
 * Comprehensive tests for the half-star rating component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { RatingStars } from '../RatingStars';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Helper to get all star elements
 */
function getStars(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('.rating-star'));
}

/**
 * Helper to simulate a click on a specific half of a star
 * @param star - The star element
 * @param half - 'left' or 'right'
 */
function clickStarHalf(star: HTMLElement, half: 'left' | 'right') {
  const mockRect = { left: 0, width: 20, top: 0, height: 20, right: 20, bottom: 20, x: 0, y: 0, toJSON: () => ({}) };
  vi.spyOn(star, 'getBoundingClientRect').mockReturnValue(mockRect as DOMRect);
  const clientX = half === 'left' ? 5 : 15; // 5 is left half, 15 is right half of 20px width
  fireEvent.click(star, { clientX });
}

/**
 * Helper to simulate mouse move on a specific half of a star
 */
function mouseMoveStar(star: HTMLElement, half: 'left' | 'right') {
  const mockRect = { left: 0, width: 20, top: 0, height: 20, right: 20, bottom: 20, x: 0, y: 0, toJSON: () => ({}) };
  vi.spyOn(star, 'getBoundingClientRect').mockReturnValue(mockRect as DOMRect);
  const clientX = half === 'left' ? 5 : 15;
  fireEvent.mouseMove(star, { clientX });
}

// =============================================================================
// Tests
// =============================================================================

describe('RatingStars', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Rendering
  // ===========================================================================

  describe('Rendering', () => {
    it('should render 5 stars', () => {
      const { container } = render(<RatingStars value={null} />);
      const stars = getStars(container);
      expect(stars).toHaveLength(5);
    });

    it('should show value text when showValue is true', () => {
      render(<RatingStars value={3.5} showValue />);
      expect(screen.getByText('3.5')).toBeInTheDocument();
    });

    it('should not show value text when showValue is false', () => {
      const { container } = render(<RatingStars value={3.5} showValue={false} />);
      expect(container.querySelector('.rating-value')).toBeNull();
    });

    it('should return null when unrated, showEmpty is false, and readonly', () => {
      const { container } = render(
        <RatingStars value={null} showEmpty={false} readonly />
      );
      expect(container.firstChild).toBeNull();
    });

    it('should apply size class variants', () => {
      const { container: small } = render(<RatingStars value={3} size="small" />);
      const { container: large } = render(<RatingStars value={3} size="large" />);

      expect(small.querySelector('.rating-stars-small')).toBeInTheDocument();
      expect(large.querySelector('.rating-stars-large')).toBeInTheDocument();
    });

    it('should apply interactive class when onChange is provided', () => {
      const { container } = render(<RatingStars value={3} onChange={() => {}} />);
      expect(container.querySelector('.rating-stars-interactive')).toBeInTheDocument();
    });

    it('should apply readonly class when no onChange is provided', () => {
      const { container } = render(<RatingStars value={3} />);
      expect(container.querySelector('.rating-stars-readonly')).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Half-Star Fill States
  // ===========================================================================

  describe('Half-Star Fill States', () => {
    it('should show all empty stars when value is null', () => {
      const { container } = render(<RatingStars value={null} />);
      const stars = getStars(container);
      stars.forEach((star) => {
        expect(star).toHaveClass('rating-star-empty');
      });
    });

    it('should show first half-star filled when value is 0.5', () => {
      const { container } = render(<RatingStars value={0.5} />);
      const stars = getStars(container);
      expect(stars[0]).toHaveClass('rating-star-half');
      expect(stars[1]).toHaveClass('rating-star-empty');
      expect(stars[2]).toHaveClass('rating-star-empty');
      expect(stars[3]).toHaveClass('rating-star-empty');
      expect(stars[4]).toHaveClass('rating-star-empty');
    });

    it('should show first star full when value is 1.0', () => {
      const { container } = render(<RatingStars value={1.0} />);
      const stars = getStars(container);
      expect(stars[0]).toHaveClass('rating-star-full');
      expect(stars[1]).toHaveClass('rating-star-empty');
      expect(stars[2]).toHaveClass('rating-star-empty');
      expect(stars[3]).toHaveClass('rating-star-empty');
      expect(stars[4]).toHaveClass('rating-star-empty');
    });

    it('should show 2 full + half when value is 2.5', () => {
      const { container } = render(<RatingStars value={2.5} />);
      const stars = getStars(container);
      expect(stars[0]).toHaveClass('rating-star-full');
      expect(stars[1]).toHaveClass('rating-star-full');
      expect(stars[2]).toHaveClass('rating-star-half');
      expect(stars[3]).toHaveClass('rating-star-empty');
      expect(stars[4]).toHaveClass('rating-star-empty');
    });

    it('should show 3 full + half when value is 3.5', () => {
      const { container } = render(<RatingStars value={3.5} />);
      const stars = getStars(container);
      expect(stars[0]).toHaveClass('rating-star-full');
      expect(stars[1]).toHaveClass('rating-star-full');
      expect(stars[2]).toHaveClass('rating-star-full');
      expect(stars[3]).toHaveClass('rating-star-half');
      expect(stars[4]).toHaveClass('rating-star-empty');
    });

    it('should show all full stars when value is 5.0', () => {
      const { container } = render(<RatingStars value={5.0} />);
      const stars = getStars(container);
      stars.forEach((star) => {
        expect(star).toHaveClass('rating-star-full');
      });
    });
  });

  // ===========================================================================
  // Click Zone Detection
  // ===========================================================================

  describe('Click Zone Detection', () => {
    it('should set 0.5 when clicking left half of star 1', () => {
      const onChange = vi.fn();
      const { container } = render(<RatingStars value={null} onChange={onChange} />);
      const stars = getStars(container);

      clickStarHalf(stars[0]!, 'left');
      expect(onChange).toHaveBeenCalledWith(0.5);
    });

    it('should set 1.0 when clicking right half of star 1', () => {
      const onChange = vi.fn();
      const { container } = render(<RatingStars value={null} onChange={onChange} />);
      const stars = getStars(container);

      clickStarHalf(stars[0]!, 'right');
      expect(onChange).toHaveBeenCalledWith(1.0);
    });

    it('should set 2.5 when clicking left half of star 3', () => {
      const onChange = vi.fn();
      const { container } = render(<RatingStars value={null} onChange={onChange} />);
      const stars = getStars(container);

      clickStarHalf(stars[2]!, 'left');
      expect(onChange).toHaveBeenCalledWith(2.5);
    });

    it('should set 3.0 when clicking right half of star 3', () => {
      const onChange = vi.fn();
      const { container } = render(<RatingStars value={null} onChange={onChange} />);
      const stars = getStars(container);

      clickStarHalf(stars[2]!, 'right');
      expect(onChange).toHaveBeenCalledWith(3.0);
    });

    it('should set 4.5 when clicking left half of star 5', () => {
      const onChange = vi.fn();
      const { container } = render(<RatingStars value={null} onChange={onChange} />);
      const stars = getStars(container);

      clickStarHalf(stars[4]!, 'left');
      expect(onChange).toHaveBeenCalledWith(4.5);
    });

    it('should set 5.0 when clicking right half of star 5', () => {
      const onChange = vi.fn();
      const { container } = render(<RatingStars value={null} onChange={onChange} />);
      const stars = getStars(container);

      clickStarHalf(stars[4]!, 'right');
      expect(onChange).toHaveBeenCalledWith(5.0);
    });
  });

  // ===========================================================================
  // Click to Clear
  // ===========================================================================

  describe('Click to Clear', () => {
    it('should clear when clicking current value with allowClear=true', () => {
      const onChange = vi.fn();
      const { container } = render(
        <RatingStars value={2.5} onChange={onChange} allowClear />
      );
      const stars = getStars(container);

      clickStarHalf(stars[2]!, 'left'); // Click left half of star 3 = 2.5
      expect(onChange).toHaveBeenCalledWith(null);
    });

    it('should not clear when clicking current value with allowClear=false', () => {
      const onChange = vi.fn();
      const { container } = render(
        <RatingStars value={2.5} onChange={onChange} allowClear={false} />
      );
      const stars = getStars(container);

      clickStarHalf(stars[2]!, 'left'); // Click left half of star 3 = 2.5
      expect(onChange).toHaveBeenCalledWith(2.5); // Re-selects same value
    });
  });

  // ===========================================================================
  // Hover Preview
  // ===========================================================================

  describe('Hover Preview', () => {
    it('should update hover state with half-star precision', () => {
      const { container } = render(<RatingStars value={null} onChange={() => {}} />);
      const stars = getStars(container);

      mouseMoveStar(stars[1]!, 'left'); // Hover left half of star 2 = 1.5
      expect(stars[0]).toHaveClass('rating-star-full');
      expect(stars[1]).toHaveClass('rating-star-half');
    });

    it('should show full star on right half hover', () => {
      const { container } = render(<RatingStars value={null} onChange={() => {}} />);
      const stars = getStars(container);

      mouseMoveStar(stars[1]!, 'right'); // Hover right half of star 2 = 2.0
      expect(stars[0]).toHaveClass('rating-star-full');
      expect(stars[1]).toHaveClass('rating-star-full');
      expect(stars[2]).toHaveClass('rating-star-empty');
    });

    it('should clear hover state on mouse leave', () => {
      const { container } = render(<RatingStars value={3.0} onChange={() => {}} />);
      const stars = getStars(container);
      const starsContainer = container.querySelector('.rating-stars-container')!;

      // Hover to change preview
      mouseMoveStar(stars[4]!, 'right'); // Hover 5.0
      expect(stars[4]).toHaveClass('rating-star-full');

      // Leave to restore original value
      fireEvent.mouseLeave(starsContainer);
      expect(stars[0]).toHaveClass('rating-star-full');
      expect(stars[1]).toHaveClass('rating-star-full');
      expect(stars[2]).toHaveClass('rating-star-full');
      expect(stars[3]).toHaveClass('rating-star-empty');
      expect(stars[4]).toHaveClass('rating-star-empty');
    });
  });

  // ===========================================================================
  // Keyboard Navigation
  // ===========================================================================

  describe('Keyboard Navigation', () => {
    it('should increment by 0.5 with ArrowRight', () => {
      const onChange = vi.fn();
      const { container } = render(<RatingStars value={2.0} onChange={onChange} />);
      const component = container.querySelector('.rating-stars')!;

      fireEvent.keyDown(component, { key: 'ArrowRight' });
      expect(onChange).toHaveBeenCalledWith(2.5);
    });

    it('should increment by 0.5 with ArrowUp', () => {
      const onChange = vi.fn();
      const { container } = render(<RatingStars value={2.0} onChange={onChange} />);
      const component = container.querySelector('.rating-stars')!;

      fireEvent.keyDown(component, { key: 'ArrowUp' });
      expect(onChange).toHaveBeenCalledWith(2.5);
    });

    it('should decrement by 0.5 with ArrowLeft', () => {
      const onChange = vi.fn();
      const { container } = render(<RatingStars value={2.0} onChange={onChange} />);
      const component = container.querySelector('.rating-stars')!;

      fireEvent.keyDown(component, { key: 'ArrowLeft' });
      expect(onChange).toHaveBeenCalledWith(1.5);
    });

    it('should decrement by 0.5 with ArrowDown', () => {
      const onChange = vi.fn();
      const { container } = render(<RatingStars value={2.0} onChange={onChange} />);
      const component = container.querySelector('.rating-stars')!;

      fireEvent.keyDown(component, { key: 'ArrowDown' });
      expect(onChange).toHaveBeenCalledWith(1.5);
    });

    it('should stay at 5.0 when pressing ArrowRight at max', () => {
      const onChange = vi.fn();
      const { container } = render(<RatingStars value={5.0} onChange={onChange} />);
      const component = container.querySelector('.rating-stars')!;

      fireEvent.keyDown(component, { key: 'ArrowRight' });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('should clear when pressing ArrowLeft at 0.5 with allowClear=true', () => {
      const onChange = vi.fn();
      const { container } = render(
        <RatingStars value={0.5} onChange={onChange} allowClear />
      );
      const component = container.querySelector('.rating-stars')!;

      fireEvent.keyDown(component, { key: 'ArrowLeft' });
      expect(onChange).toHaveBeenCalledWith(null);
    });

    it('should stay at 0.5 when pressing ArrowLeft at 0.5 with allowClear=false', () => {
      const onChange = vi.fn();
      const { container } = render(
        <RatingStars value={0.5} onChange={onChange} allowClear={false} />
      );
      const component = container.querySelector('.rating-stars')!;

      fireEvent.keyDown(component, { key: 'ArrowLeft' });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('should set 0.5 when pressing Enter/Space from null', () => {
      const onChange = vi.fn();
      const { container } = render(<RatingStars value={null} onChange={onChange} />);
      const component = container.querySelector('.rating-stars')!;

      fireEvent.keyDown(component, { key: 'Enter' });
      expect(onChange).toHaveBeenCalledWith(0.5);
    });

    it('should clear when pressing Space with value and allowClear=true', () => {
      const onChange = vi.fn();
      const { container } = render(
        <RatingStars value={3.0} onChange={onChange} allowClear />
      );
      const component = container.querySelector('.rating-stars')!;

      fireEvent.keyDown(component, { key: ' ' });
      expect(onChange).toHaveBeenCalledWith(null);
    });

    it('should clear when pressing Backspace with allowClear=true', () => {
      const onChange = vi.fn();
      const { container } = render(
        <RatingStars value={3.0} onChange={onChange} allowClear />
      );
      const component = container.querySelector('.rating-stars')!;

      fireEvent.keyDown(component, { key: 'Backspace' });
      expect(onChange).toHaveBeenCalledWith(null);
    });

    it('should clear when pressing Delete with allowClear=true', () => {
      const onChange = vi.fn();
      const { container } = render(
        <RatingStars value={3.0} onChange={onChange} allowClear />
      );
      const component = container.querySelector('.rating-stars')!;

      fireEvent.keyDown(component, { key: 'Delete' });
      expect(onChange).toHaveBeenCalledWith(null);
    });

    it('should set 0.5 when pressing ArrowRight from null', () => {
      const onChange = vi.fn();
      const { container } = render(<RatingStars value={null} onChange={onChange} />);
      const component = container.querySelector('.rating-stars')!;

      fireEvent.keyDown(component, { key: 'ArrowRight' });
      expect(onChange).toHaveBeenCalledWith(0.5);
    });
  });

  // ===========================================================================
  // Accessibility
  // ===========================================================================

  describe('Accessibility', () => {
    it('should have role="slider" when interactive', () => {
      const { container } = render(<RatingStars value={3} onChange={() => {}} />);
      expect(container.querySelector('[role="slider"]')).toBeInTheDocument();
    });

    it('should have role="img" when readonly', () => {
      const { container } = render(<RatingStars value={3} readonly />);
      expect(container.querySelector('[role="img"]')).toBeInTheDocument();
    });

    it('should have aria-valuemin of 0.5', () => {
      const { container } = render(<RatingStars value={3} onChange={() => {}} />);
      expect(container.querySelector('[aria-valuemin="0.5"]')).toBeInTheDocument();
    });

    it('should have aria-valuemax of 5', () => {
      const { container } = render(<RatingStars value={3} onChange={() => {}} />);
      expect(container.querySelector('[aria-valuemax="5"]')).toBeInTheDocument();
    });

    it('should have aria-valuenow matching value', () => {
      const { container } = render(<RatingStars value={3.5} onChange={() => {}} />);
      expect(container.querySelector('[aria-valuenow="3.5"]')).toBeInTheDocument();
    });

    it('should have aria-valuetext "Not rated" for null', () => {
      const { container } = render(<RatingStars value={null} onChange={() => {}} />);
      expect(container.querySelector('[aria-valuetext="Not rated"]')).toBeInTheDocument();
    });

    it('should have aria-valuetext "half star out of 5 stars" for 0.5', () => {
      const { container } = render(<RatingStars value={0.5} onChange={() => {}} />);
      expect(
        container.querySelector('[aria-valuetext="half star out of 5 stars"]')
      ).toBeInTheDocument();
    });

    it('should have aria-valuetext "3 and a half stars out of 5 stars" for 3.5', () => {
      const { container } = render(<RatingStars value={3.5} onChange={() => {}} />);
      expect(
        container.querySelector('[aria-valuetext="3 and a half stars out of 5 stars"]')
      ).toBeInTheDocument();
    });

    it('should have aria-valuetext "4 stars out of 5 stars" for 4', () => {
      const { container } = render(<RatingStars value={4} onChange={() => {}} />);
      expect(
        container.querySelector('[aria-valuetext="4 stars out of 5 stars"]')
      ).toBeInTheDocument();
    });

    it('should have aria-valuetext "1 star out of 5 stars" (singular) for 1', () => {
      const { container } = render(<RatingStars value={1} onChange={() => {}} />);
      expect(
        container.querySelector('[aria-valuetext="1 star out of 5 stars"]')
      ).toBeInTheDocument();
    });

    it('should have tabIndex 0 when interactive', () => {
      const { container } = render(<RatingStars value={3} onChange={() => {}} />);
      expect(container.querySelector('[tabindex="0"]')).toBeInTheDocument();
    });

    it('should have tabIndex -1 when readonly', () => {
      const { container } = render(<RatingStars value={3} readonly />);
      expect(container.querySelector('[tabindex="-1"]')).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Readonly Mode
  // ===========================================================================

  describe('Readonly Mode', () => {
    it('should not call onChange on click when readonly', () => {
      const onChange = vi.fn();
      const { container } = render(
        <RatingStars value={3} onChange={onChange} readonly />
      );
      const stars = getStars(container);

      clickStarHalf(stars[0]!, 'right');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('should not respond to keyboard events when readonly', () => {
      const onChange = vi.fn();
      const { container } = render(
        <RatingStars value={3} onChange={onChange} readonly />
      );
      const component = container.querySelector('.rating-stars')!;

      fireEvent.keyDown(component, { key: 'ArrowRight' });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('should not show hover state when readonly', () => {
      const { container } = render(<RatingStars value={3} readonly />);
      const stars = getStars(container);

      mouseMoveStar(stars[4]!, 'right'); // Try to hover 5.0
      // Stars 4 and 5 should remain in their original state (empty)
      expect(stars[3]).toHaveClass('rating-star-empty');
      expect(stars[4]).toHaveClass('rating-star-empty');
    });
  });
});
