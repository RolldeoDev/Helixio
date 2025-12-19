/**
 * Section Header Component
 *
 * Reusable header for home page sections with title and optional "See All" link.
 * Features comic book-style accent line under the title.
 */

import { Link } from 'react-router-dom';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  seeAllLink?: string;
  seeAllText?: string;
  actions?: React.ReactNode;
}

export function SectionHeader({
  title,
  subtitle,
  seeAllLink,
  seeAllText = 'See All',
  actions,
}: SectionHeaderProps) {
  return (
    <div className="home-section-header">
      <div style={{ display: 'flex', alignItems: 'baseline' }}>
        <h2 className="home-section-title">{title}</h2>
        {subtitle && <span className="home-section-subtitle">{subtitle}</span>}
      </div>

      <div className="home-section-actions">
        {actions}
        {seeAllLink && (
          <Link to={seeAllLink} className="home-see-all-link">
            {seeAllText}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
        )}
      </div>
    </div>
  );
}
