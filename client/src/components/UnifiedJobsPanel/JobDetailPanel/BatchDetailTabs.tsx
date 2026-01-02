/**
 * BatchDetailTabs Component
 *
 * Tabbed view for batch job details.
 */

import { useState } from 'react';
import type { UnifiedJobDetails } from '../../../services/api/jobs';
import { BatchOperationsList } from './BatchOperationsList';
import { BatchSummary } from './BatchSummary';

interface BatchDetailTabsProps {
  job: UnifiedJobDetails;
}

type TabId = 'operations' | 'summary';

export function BatchDetailTabs({ job }: BatchDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('operations');

  return (
    <div className="batch-detail-tabs">
      <div className="batch-tabs-header">
        <button
          className={`batch-tab ${activeTab === 'operations' ? 'active' : ''}`}
          onClick={() => setActiveTab('operations')}
        >
          Operations
        </button>
        <button
          className={`batch-tab ${activeTab === 'summary' ? 'active' : ''}`}
          onClick={() => setActiveTab('summary')}
        >
          Summary
        </button>
      </div>

      <div className="batch-tabs-content">
        {activeTab === 'operations' && (
          <BatchOperationsList operations={job.operations || []} />
        )}
        {activeTab === 'summary' && (
          <BatchSummary job={job} />
        )}
      </div>
    </div>
  );
}

export default BatchDetailTabs;
