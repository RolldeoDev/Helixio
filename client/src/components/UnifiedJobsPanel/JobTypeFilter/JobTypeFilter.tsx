/**
 * JobTypeFilter Component
 *
 * Filter chips for job types in the unified jobs panel.
 */

import './JobTypeFilter.css';

export type FilterCategory = 'scans' | 'metadata' | 'ratings' | 'reviews' | 'batches';

interface JobTypeFilterProps {
  visibleCategories: Set<FilterCategory>;
  counts: Record<FilterCategory, number>;
  onToggle: (category: FilterCategory) => void;
}

const categoryLabels: Record<FilterCategory, string> = {
  scans: 'Scans',
  metadata: 'Metadata',
  ratings: 'Ratings',
  reviews: 'Reviews',
  batches: 'Batches',
};

export function JobTypeFilter({ visibleCategories, counts, onToggle }: JobTypeFilterProps) {
  const categories: FilterCategory[] = ['scans', 'metadata', 'ratings', 'reviews', 'batches'];

  return (
    <div className="job-type-filter">
      {categories.map((category) => {
        const isActive = visibleCategories.has(category);
        const count = counts[category] || 0;

        return (
          <button
            key={category}
            className={`filter-chip ${isActive ? 'active' : ''}`}
            onClick={() => onToggle(category)}
            type="button"
          >
            {categoryLabels[category]}
            {count > 0 && <span className="filter-count">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default JobTypeFilter;
