/**
 * SpoilerText Component
 *
 * A text block that can hide/reveal spoiler content.
 * Shows blurred text with a "Reveal Spoiler" button overlay.
 */

import { useState } from 'react';
import './SpoilerText.css';

export interface SpoilerTextProps {
  /** The text content that contains spoilers */
  text: string;
  /** Whether the text is initially hidden (default: true) */
  initiallyHidden?: boolean;
  /** Maximum lines to show when collapsed (0 = no limit) */
  maxLines?: number;
  /** Optional className for the container */
  className?: string;
}

export function SpoilerText({
  text,
  initiallyHidden = true,
  maxLines = 0,
  className = '',
}: SpoilerTextProps) {
  const [isRevealed, setIsRevealed] = useState(!initiallyHidden);

  const handleReveal = () => {
    setIsRevealed(true);
  };

  const handleHide = () => {
    setIsRevealed(false);
  };

  return (
    <div className={`spoiler-text ${className}`}>
      <div
        className={`spoiler-text__content ${!isRevealed ? 'spoiler-text__content--hidden' : ''}`}
        style={maxLines > 0 && isRevealed ? { WebkitLineClamp: maxLines } : undefined}
      >
        {text}
      </div>

      {!isRevealed && (
        <div className="spoiler-text__overlay">
          <button
            type="button"
            className="spoiler-text__reveal-btn"
            onClick={handleReveal}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Reveal Spoiler
          </button>
        </div>
      )}

      {isRevealed && initiallyHidden && (
        <button
          type="button"
          className="spoiler-text__hide-btn"
          onClick={handleHide}
        >
          Hide Spoiler
        </button>
      )}
    </div>
  );
}

export default SpoilerText;
