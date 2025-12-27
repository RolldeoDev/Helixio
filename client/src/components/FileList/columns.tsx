/**
 * Column Definitions for FileList Table
 *
 * Uses TanStack Table v8 column helper for type-safe column definitions.
 */

import { createColumnHelper } from '@tanstack/react-table';
import type { ComicFile } from '../../services/api.service';
import { formatFileSize } from '../../utils/format';

const columnHelper = createColumnHelper<ComicFile>();

// Helper functions
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}

function getStatusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case 'indexed':
      return { label: 'Indexed', className: 'badge-success' };
    case 'pending':
      return { label: 'Pending', className: 'badge-warning' };
    case 'orphaned':
      return { label: 'Orphaned', className: 'badge-error' };
    case 'quarantined':
      return { label: 'Quarantined', className: 'badge-danger' };
    default:
      return { label: status, className: 'badge-default' };
  }
}

function getStatusDotClass(status: string): string {
  switch (status) {
    case 'pending':
      return 'status-dot status-dot-pending';
    case 'orphaned':
      return 'status-dot status-dot-orphaned';
    case 'quarantined':
      return 'status-dot status-dot-quarantined';
    default:
      return 'status-dot status-dot-indexed';
  }
}

// SVG Icons for compact mode
function ArchiveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18M12 8h2M12 12h2M12 16h2" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

// Export helper functions and icons for use in FileList
export { formatDate, getStatusBadge, getStatusDotClass, ArchiveIcon, FileIcon };

// Column definitions
export const columns = [
  // Checkbox column - fixed width, non-resizable
  columnHelper.display({
    id: 'select',
    header: ({ table }) => (
      <input
        type="checkbox"
        checked={table.getIsAllRowsSelected()}
        ref={(el) => {
          if (el) {
            el.indeterminate = table.getIsSomeRowsSelected();
          }
        }}
        onChange={table.getToggleAllRowsSelectedHandler()}
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
        onClick={(e) => e.stopPropagation()}
      />
    ),
    size: 24,
    minSize: 24,
    maxSize: 24,
    enableResizing: false,
    enableSorting: false,
    enableHiding: false,
  }),

  // Filename column - with icon and status dot in compact mode
  columnHelper.accessor('filename', {
    id: 'filename',
    header: 'Filename',
    cell: ({ row, getValue, table }) => {
      const filename = getValue();
      const status = row.original.status;
      const isArchive = /\.cb[rz7]$/i.test(filename);
      const isCompact = table.options.meta?.compact;

      return (
        <div className="col-filename-content">
          <span className="file-icon">
            {isCompact ? (
              isArchive ? <ArchiveIcon /> : <FileIcon />
            ) : (
              isArchive ? '📦' : '📄'
            )}
          </span>
          <span className="file-name" title={row.original.relativePath}>
            {filename}
          </span>
          {isCompact && <span className={getStatusDotClass(status)} title={status} />}
        </div>
      );
    },
    size: 300,
    minSize: 100,
    enableResizing: true,
    enableSorting: true,
    enableHiding: false,
  }),

  // Title column
  columnHelper.accessor(
    (row) => row.metadata?.title || row.filename.replace(/\.[^/.]+$/, ''),
    {
      id: 'title',
      header: 'Title',
      cell: ({ getValue }) => (
        <span className="file-title" title={getValue()}>
          {getValue()}
        </span>
      ),
      size: 200,
      minSize: 80,
      enableResizing: true,
      enableSorting: false, // Title is derived
      enableHiding: true,
    }
  ),

  // Size column
  columnHelper.accessor('size', {
    id: 'size',
    header: 'Size',
    cell: ({ getValue }) => formatFileSize(getValue()),
    size: 80,
    minSize: 60,
    enableResizing: true,
    enableSorting: true,
    enableHiding: true,
  }),

  // Status column - hidden by default in compact mode
  columnHelper.accessor('status', {
    id: 'status',
    header: 'Status',
    cell: ({ getValue }) => {
      const badge = getStatusBadge(getValue());
      return <span className={`badge ${badge.className}`}>{badge.label}</span>;
    },
    size: 100,
    minSize: 80,
    enableResizing: true,
    enableSorting: true,
    enableHiding: true,
  }),

  // Modified date column - hidden by default in compact mode
  columnHelper.accessor('modifiedAt', {
    id: 'modifiedAt',
    header: 'Modified',
    cell: ({ getValue }) => formatDate(getValue()),
    size: 100,
    minSize: 70,
    enableResizing: true,
    enableSorting: true,
    enableHiding: true,
  }),

  // Issue number column - from metadata
  columnHelper.accessor(
    (row) => row.metadata?.number ?? '',
    {
      id: 'number',
      header: '#',
      cell: ({ getValue }) => {
        const num = getValue();
        return num ? <span className="col-number">{num}</span> : <span className="col-empty">—</span>;
      },
      size: 50,
      minSize: 40,
      enableResizing: true,
      enableSorting: true,
      enableHiding: true,
    }
  ),

  // Volume column - from metadata
  columnHelper.accessor(
    (row) => row.metadata?.volume ?? null,
    {
      id: 'volume',
      header: 'Vol',
      cell: ({ getValue }) => {
        const vol = getValue();
        return vol !== null ? <span className="col-volume">v{vol}</span> : <span className="col-empty">—</span>;
      },
      size: 50,
      minSize: 40,
      enableResizing: true,
      enableSorting: true,
      enableHiding: true,
    }
  ),

  // Year column - from metadata
  columnHelper.accessor(
    (row) => row.metadata?.year ?? null,
    {
      id: 'year',
      header: 'Year',
      cell: ({ getValue }) => {
        const year = getValue();
        return year !== null ? <span className="col-year">{year}</span> : <span className="col-empty">—</span>;
      },
      size: 60,
      minSize: 50,
      enableResizing: true,
      enableSorting: true,
      enableHiding: true,
    }
  ),

  // Writer column - from metadata
  columnHelper.accessor(
    (row) => row.metadata?.writer ?? '',
    {
      id: 'writer',
      header: 'Writer',
      cell: ({ getValue }) => {
        const writer = getValue();
        return writer ? (
          <span className="col-writer" title={writer}>{writer}</span>
        ) : (
          <span className="col-empty">—</span>
        );
      },
      size: 120,
      minSize: 60,
      enableResizing: true,
      enableSorting: true,
      enableHiding: true,
    }
  ),

  // Publisher column - from metadata
  columnHelper.accessor(
    (row) => row.metadata?.publisher ?? '',
    {
      id: 'publisher',
      header: 'Publisher',
      cell: ({ getValue }) => {
        const pub = getValue();
        return pub ? (
          <span className="col-publisher" title={pub}>{pub}</span>
        ) : (
          <span className="col-empty">—</span>
        );
      },
      size: 100,
      minSize: 60,
      enableResizing: true,
      enableSorting: true,
      enableHiding: true,
    }
  ),

  // Page count column - from metadata
  columnHelper.accessor(
    (row) => row.metadata?.pageCount ?? null,
    {
      id: 'pageCount',
      header: 'Pages',
      cell: ({ getValue }) => {
        const count = getValue();
        return count !== null ? <span className="col-pagecount">{count}</span> : <span className="col-empty">—</span>;
      },
      size: 60,
      minSize: 50,
      enableResizing: true,
      enableSorting: true,
      enableHiding: true,
    }
  ),

  // Created date column
  columnHelper.accessor('createdAt', {
    id: 'createdAt',
    header: 'Added',
    cell: ({ getValue }) => formatDate(getValue()),
    size: 100,
    minSize: 70,
    enableResizing: true,
    enableSorting: true,
    enableHiding: true,
  }),

  // Series name column - from metadata
  columnHelper.accessor(
    (row) => row.metadata?.series ?? '',
    {
      id: 'series',
      header: 'Series',
      cell: ({ getValue }) => {
        const series = getValue();
        return series ? (
          <span className="col-series" title={series}>{series}</span>
        ) : (
          <span className="col-empty">—</span>
        );
      },
      size: 150,
      minSize: 80,
      enableResizing: true,
      enableSorting: true,
      enableHiding: true,
    }
  ),
];

// Default column order (new columns hidden by default)
export const defaultColumnOrder = [
  'select', 'filename', 'title', 'number', 'volume', 'series',
  'size', 'year', 'writer', 'publisher', 'pageCount',
  'status', 'modifiedAt', 'createdAt'
];

// Columns to hide in compact mode by default
export const compactHiddenColumns = [
  'status', 'modifiedAt', 'createdAt',
  'volume', 'year', 'writer', 'publisher', 'pageCount', 'series'
];

// Default column sizes
export const defaultColumnSizing = {
  select: 24,
  filename: 300,
  title: 200,
  number: 50,
  volume: 50,
  size: 80,
  year: 60,
  writer: 120,
  publisher: 100,
  pageCount: 60,
  status: 100,
  modifiedAt: 100,
  createdAt: 100,
  series: 150,
};
