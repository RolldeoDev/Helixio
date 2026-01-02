/**
 * BatchOperationsList Component
 *
 * Displays list of operations in a batch.
 */

import { useState, useMemo } from 'react';
import type { BatchOperationItem } from '../../../services/api/jobs';

interface BatchOperationsListProps {
  operations: BatchOperationItem[];
}

export function BatchOperationsList({ operations }: BatchOperationsListProps) {
  const [showFailedOnly, setShowFailedOnly] = useState(false);

  const failedCount = useMemo(
    () => operations.filter((op) => op.status === 'failed').length,
    [operations]
  );

  const filteredOperations = useMemo(
    () => (showFailedOnly ? operations.filter((op) => op.status === 'failed') : operations),
    [operations, showFailedOnly]
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return '✓';
      case 'failed':
        return '✗';
      case 'pending':
        return '○';
      default:
        return '•';
    }
  };

  const getFilename = (path: string) => path.split('/').pop() || path;

  return (
    <div className="batch-operations-list">
      {failedCount > 0 && (
        <div className="operations-filter">
          <label>
            <input
              type="checkbox"
              checked={showFailedOnly}
              onChange={(e) => setShowFailedOnly(e.target.checked)}
            />
            Show failed only ({failedCount})
          </label>
        </div>
      )}

      {filteredOperations.length === 0 ? (
        <div className="operations-empty">
          {operations.length === 0 ? 'No operations recorded' : 'No failed operations'}
        </div>
      ) : (
        <div className="operations-scroll">
          {filteredOperations.map((op) => (
            <div
              key={op.id}
              className={`operation-item status-${op.status}`}
            >
              <span className={`operation-status-icon ${op.status}`}>
                {getStatusIcon(op.status)}
              </span>
              <div className="operation-content">
                <div className="operation-filename">{getFilename(op.source)}</div>
                {op.destination && (
                  <div className="operation-destination">
                    → {getFilename(op.destination)}
                  </div>
                )}
                {op.error && (
                  <div className="operation-error">{op.error}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default BatchOperationsList;
