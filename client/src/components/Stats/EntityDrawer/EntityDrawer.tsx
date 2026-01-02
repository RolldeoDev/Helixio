import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { EntityStatResult, EntityType } from '../../../services/api.service';
import { getEntityStats } from '../../../services/api.service';
import { EntityDrawerList } from './EntityDrawerList';
import './EntityDrawer.css';

interface EntityDrawerProps {
  entityType: EntityType | null;
  onClose: () => void;
}

type SortBy = 'owned' | 'read' | 'time' | 'ownedPages' | 'readPages';

const ENTITY_TITLES: Record<EntityType, string> = {
  creator: 'All Creators',
  genre: 'All Genres',
  character: 'All Characters',
  team: 'All Teams',
  publisher: 'All Publishers',
};

const PAGE_SIZE = 20;

export function EntityDrawer({ entityType, onClose }: EntityDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [entities, setEntities] = useState<EntityStatResult[]>([]);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState<SortBy>('owned');
  const [isLoading, setIsLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Open/close animation
  useEffect(() => {
    if (entityType) {
      setIsOpen(true);
      // Reset state when opening
      setEntities([]);
      setOffset(0);
      setTotal(0);
    } else {
      setIsOpen(false);
    }
  }, [entityType]);

  // Fetch entities
  useEffect(() => {
    if (!entityType || !isOpen) return;

    const fetchEntities = async () => {
      setIsLoading(true);
      try {
        const result = await getEntityStats({
          entityType,
          sortBy,
          limit: PAGE_SIZE,
          offset: 0,
        });
        setEntities(result.items);
        setTotal(result.total);
        setOffset(PAGE_SIZE);
      } catch (error) {
        console.error('Failed to fetch entities:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEntities();
  }, [entityType, sortBy, isOpen]);

  // Load more
  const handleLoadMore = useCallback(async () => {
    if (!entityType || isLoading) return;

    setIsLoading(true);
    try {
      const result = await getEntityStats({
        entityType,
        sortBy,
        limit: PAGE_SIZE,
        offset,
      });
      setEntities((prev) => [...prev, ...result.items]);
      setOffset((prev) => prev + PAGE_SIZE);
    } catch (error) {
      console.error('Failed to load more entities:', error);
    } finally {
      setIsLoading(false);
    }
  }, [entityType, sortBy, offset, isLoading]);

  // Handle sort change
  const handleSortChange = (newSort: SortBy) => {
    if (newSort !== sortBy) {
      setSortBy(newSort);
      setEntities([]);
      setOffset(0);
    }
  };

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Escape key to close
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const hasMore = entities.length < total;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={`entity-drawer-backdrop ${isOpen ? 'visible' : ''}`}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`entity-drawer ${isOpen ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={entityType ? ENTITY_TITLES[entityType] : 'Entity drawer'}
      >
        <div className="entity-drawer__header">
          <div className="entity-drawer__title-row">
            <h2 className="entity-drawer__title">
              {entityType ? ENTITY_TITLES[entityType] : ''}
            </h2>
            <span className="entity-drawer__count">
              {total > 0 ? `${total.toLocaleString()} total` : ''}
            </span>
          </div>
          <button
            className="entity-drawer__close"
            onClick={onClose}
            aria-label="Close drawer"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="entity-drawer__sort">
          <span className="entity-drawer__sort-label">Sort by</span>

          <div className="entity-drawer__sort-group">
            <div className="entity-drawer__sort-section">
              <span className="entity-drawer__sort-section-label">Comics</span>
              <div className="entity-drawer__sort-buttons">
                <button
                  className={sortBy === 'owned' ? 'active' : ''}
                  onClick={() => handleSortChange('owned')}
                >
                  Owned
                </button>
                <button
                  className={sortBy === 'read' ? 'active' : ''}
                  onClick={() => handleSortChange('read')}
                >
                  Read
                </button>
              </div>
            </div>

            <div className="entity-drawer__sort-section">
              <span className="entity-drawer__sort-section-label">Pages</span>
              <div className="entity-drawer__sort-buttons">
                <button
                  className={sortBy === 'ownedPages' ? 'active' : ''}
                  onClick={() => handleSortChange('ownedPages')}
                >
                  Owned
                </button>
                <button
                  className={sortBy === 'readPages' ? 'active' : ''}
                  onClick={() => handleSortChange('readPages')}
                >
                  Read
                </button>
              </div>
            </div>

            <div className="entity-drawer__sort-section">
              <div className="entity-drawer__sort-buttons">
                <button
                  className={sortBy === 'time' ? 'active' : ''}
                  onClick={() => handleSortChange('time')}
                >
                  Time
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="entity-drawer__content">
          {entityType && (
            <EntityDrawerList
              entities={entities}
              entityType={entityType}
              isLoading={isLoading}
              hasMore={hasMore}
              onLoadMore={handleLoadMore}
              sortBy={sortBy}
            />
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
