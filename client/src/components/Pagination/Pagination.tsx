/**
 * Pagination Component
 *
 * Reusable pagination controls with page size selector.
 * Handles scroll-to-top on page change.
 */

import { useCallback, useRef, useEffect } from 'react';
import { useApp } from '../../contexts/AppContext';

interface PaginationProps {
  /** Position of pagination - affects styling */
  position?: 'top' | 'bottom';
  /** Reference element to scroll into view on page change */
  scrollTarget?: React.RefObject<HTMLElement | null>;
}

const PAGE_SIZES = [25, 50, 100] as const;

export function Pagination({ position = 'bottom', scrollTarget }: PaginationProps) {
  const { pagination, setPage, setPageSize } = useApp();
  const previousPage = useRef(pagination.page);

  // Scroll to top when page changes (only if scrollTarget provided)
  useEffect(() => {
    if (previousPage.current !== pagination.page && scrollTarget?.current) {
      scrollTarget.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    previousPage.current = pagination.page;
  }, [pagination.page, scrollTarget]);

  const handlePrevious = useCallback(() => {
    if (pagination.page > 1) {
      setPage(pagination.page - 1);
    }
  }, [pagination.page, setPage]);

  const handleNext = useCallback(() => {
    if (pagination.page < pagination.pages) {
      setPage(pagination.page + 1);
    }
  }, [pagination.page, pagination.pages, setPage]);

  const handlePageSizeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setPageSize(Number(e.target.value));
    },
    [setPageSize]
  );

  // Don't render if only one page and we're at the bottom
  if (pagination.pages <= 1 && position === 'bottom') {
    return null;
  }

  return (
    <div className={`pagination pagination-${position}`}>
      <div className="pagination-left">
        <label className="page-size-label">
          Show:
          <select
            value={pagination.limit}
            onChange={handlePageSizeChange}
            className="page-size-select"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="pagination-center">
        <button
          className="btn-ghost"
          disabled={pagination.page === 1}
          onClick={handlePrevious}
        >
          ← Previous
        </button>
        <span className="page-info">
          Page {pagination.page} of {pagination.pages || 1}
        </span>
        <button
          className="btn-ghost"
          disabled={pagination.page >= pagination.pages}
          onClick={handleNext}
        >
          Next →
        </button>
      </div>

      <div className="pagination-right">
        <span className="total-count">{pagination.total} total</span>
      </div>
    </div>
  );
}
