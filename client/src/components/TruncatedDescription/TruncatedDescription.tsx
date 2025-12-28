/**
 * TruncatedDescription Component
 *
 * Displays text with line clamping and an expand/collapse toggle.
 * Automatically detects overflow and shows "Read more" when truncated.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import './TruncatedDescription.css';

export interface TruncatedDescriptionProps {
  /** The text to display */
  text: string | null | undefined;
  /** Maximum lines before truncation (default: 3) */
  maxLines?: number;
  /** Placeholder when text is empty */
  placeholder?: string;
  /** Additional CSS class */
  className?: string;
}

export function TruncatedDescription({
  text,
  maxLines = 3,
  placeholder = 'No description',
  className = '',
}: TruncatedDescriptionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  // Check if text is truncated
  const checkTruncation = useCallback(() => {
    const element = textRef.current;
    if (!element) return;

    // Compare scroll height to client height
    setIsTruncated(element.scrollHeight > element.clientHeight);
  }, []);

  useEffect(() => {
    checkTruncation();

    // Re-check on resize
    const observer = new ResizeObserver(checkTruncation);
    if (textRef.current) {
      observer.observe(textRef.current);
    }

    return () => observer.disconnect();
  }, [text, maxLines, checkTruncation]);

  // Reset expanded state when text changes
  useEffect(() => {
    setIsExpanded(false);
  }, [text]);

  if (!text) {
    return (
      <div className={`truncated-description truncated-description--empty ${className}`}>
        <p className="truncated-description__placeholder">{placeholder}</p>
      </div>
    );
  }

  return (
    <div className={`truncated-description ${className}`}>
      <p
        ref={textRef}
        className={`truncated-description__text ${isExpanded ? 'truncated-description__text--expanded' : ''}`}
        style={{ WebkitLineClamp: isExpanded ? 'unset' : maxLines }}
      >
        {text}
      </p>
      {(isTruncated || isExpanded) && (
        <button
          type="button"
          className="truncated-description__toggle"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
        >
          {isExpanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}
