/**
 * CollectionListCard Component
 *
 * Rich card display for collections in the sidebar list.
 * Shows mosaic cover, item count, and distinct styling for system collections.
 */

import { Collection } from '../../contexts/CollectionsContext';
import './CollectionListCard.css';

export interface CollectionListCardProps {
  /** The collection to display */
  collection: Collection;
  /** Whether this card is currently selected */
  isSelected: boolean;
  /** Cover URL for the collection (mosaic or custom) */
  coverUrl: string | null;
  /** Handler when card is clicked */
  onSelect: () => void;
  /** Additional CSS class */
  className?: string;
}

// Icon components for system collections
function HeartIcon() {
  return (
    <svg className="collection-list-card__system-icon collection-list-card__system-icon--favorites" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg className="collection-list-card__system-icon collection-list-card__system-icon--want-to-read" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

// Placeholder icon for collections without covers
function CollectionPlaceholderIcon() {
  return (
    <svg className="collection-list-card__placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

export function CollectionListCard({
  collection,
  isSelected,
  coverUrl,
  onSelect,
  className = '',
}: CollectionListCardProps) {
  const isSystem = collection.isSystem;
  const isFavorites = collection.systemKey === 'favorites';
  const isWantToRead = collection.systemKey === 'want-to-read';

  // Build class names
  const cardClasses = [
    'collection-list-card',
    isSelected && 'collection-list-card--selected',
    isSystem && 'collection-list-card--system',
    isFavorites && 'collection-list-card--favorites',
    isWantToRead && 'collection-list-card--want-to-read',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={cardClasses}
      onClick={onSelect}
      aria-pressed={isSelected}
      aria-label={`${collection.name} collection, ${collection.itemCount ?? 0} items`}
    >
      {/* Cover preview */}
      <div className="collection-list-card__cover">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className="collection-list-card__cover-image"
            loading="lazy"
          />
        ) : (
          <div className="collection-list-card__cover-placeholder">
            <CollectionPlaceholderIcon />
          </div>
        )}

        {/* System collection icon overlay */}
        {isSystem && (
          <div className="collection-list-card__icon-overlay">
            {isFavorites && <HeartIcon />}
            {isWantToRead && <BookmarkIcon />}
          </div>
        )}
      </div>

      {/* Collection info */}
      <div className="collection-list-card__info">
        <div className="collection-list-card__name-row">
          {/* System icon (inline with name) */}
          {isSystem && (
            <span className="collection-list-card__inline-icon">
              {isFavorites && <HeartIcon />}
              {isWantToRead && <BookmarkIcon />}
            </span>
          )}
          <span className="collection-list-card__name">{collection.name}</span>
        </div>
        <span className="collection-list-card__meta">
          {collection.itemCount ?? 0} {(collection.itemCount ?? 0) === 1 ? 'item' : 'items'}
          {collection.isSmart && (
            <span className="collection-list-card__smart-badge" title="Smart collection">
              <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </span>
          )}
        </span>
      </div>

      {/* Selected indicator */}
      {isSelected && (
        <div className="collection-list-card__selected-indicator" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      )}
    </button>
  );
}
