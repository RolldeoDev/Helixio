/**
 * MarkdownContent Component
 *
 * Renders markdown content with appropriate styling for descriptions and summaries.
 */

import ReactMarkdown from 'react-markdown';
import './MarkdownContent.css';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className = '' }: MarkdownContentProps) {
  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
