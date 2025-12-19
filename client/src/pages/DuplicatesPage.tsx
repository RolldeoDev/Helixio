/**
 * DuplicatesPage Component
 *
 * Page for viewing and resolving duplicate series.
 * Shows auto-detected duplicate groups with confidence scoring.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DuplicateGroup,
  DuplicateConfidence,
  DuplicatesResponse,
  SeriesForMerge,
  MergeResult,
  getPotentialDuplicates,
  getCoverUrl,
  getApiCoverUrl,
} from '../services/api.service';
import { MergeSeriesModal } from '../components/MergeSeriesModal';
import './DuplicatesPage.css';

type FilterConfidence = DuplicateConfidence | 'all';

export function DuplicatesPage() {
  const navigate = useNavigate();
  const [duplicates, setDuplicates] = useState<DuplicatesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterConfidence, setFilterConfidence] = useState<FilterConfidence>('all');

  // Merge modal state
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<DuplicateGroup | null>(null);

  const fetchDuplicates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getPotentialDuplicates();
      setDuplicates(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch duplicates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDuplicates();
  }, [fetchDuplicates]);

  const handleMergeClick = (group: DuplicateGroup) => {
    setSelectedGroup(group);
    setShowMergeModal(true);
  };

  const handleMergeComplete = (_result: MergeResult) => {
    setShowMergeModal(false);
    setSelectedGroup(null);
    // Refresh the duplicates list
    fetchDuplicates();
  };

  const handleCloseMergeModal = () => {
    setShowMergeModal(false);
    setSelectedGroup(null);
  };

  const filteredGroups =
    duplicates?.duplicateGroups.filter(
      (g) => filterConfidence === 'all' || g.confidence === filterConfidence
    ) ?? [];

  const getConfidenceBadgeClass = (confidence: DuplicateConfidence) => {
    switch (confidence) {
      case 'high':
        return 'confidence-high';
      case 'medium':
        return 'confidence-medium';
      case 'low':
        return 'confidence-low';
    }
  };

  const getReasonLabel = (reason: string) => {
    switch (reason) {
      case 'same_name':
        return 'Same Name';
      case 'similar_name':
        return 'Similar Name';
      case 'same_comicvine_id':
        return 'Same ComicVine ID';
      case 'same_metron_id':
        return 'Same Metron ID';
      case 'same_publisher_similar_name':
        return 'Same Publisher';
      default:
        return reason;
    }
  };

  const getCover = (series: SeriesForMerge) => {
    if (series.coverHash) {
      return getApiCoverUrl(series.coverHash);
    }
    if (series.coverFileId) {
      return getCoverUrl(series.coverFileId);
    }
    return null;
  };

  return (
    <div className="duplicates-page">
      <div className="duplicates-page-header">
        <div className="duplicates-page-title">
          <button className="back-button" onClick={() => navigate('/series')}>
            ← Back to Series
          </button>
          <h1>Duplicate Series</h1>
        </div>

        {duplicates && (
          <div className="duplicates-stats">
            <span className="stat total">{duplicates.totalGroups} groups</span>
            <span className="stat high">{duplicates.byConfidence.high} high</span>
            <span className="stat medium">{duplicates.byConfidence.medium} medium</span>
            <span className="stat low">{duplicates.byConfidence.low} low</span>
          </div>
        )}
      </div>

      <div className="duplicates-filter">
        <label>Filter by confidence:</label>
        <select
          value={filterConfidence}
          onChange={(e) => setFilterConfidence(e.target.value as FilterConfidence)}
        >
          <option value="all">All</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <button className="refresh-button" onClick={fetchDuplicates} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {loading && !duplicates ? (
        <div className="duplicates-loading">
          <div className="spinner" />
          <p>Scanning for duplicates...</p>
        </div>
      ) : error ? (
        <div className="duplicates-error">
          <p>{error}</p>
          <button onClick={fetchDuplicates}>Try Again</button>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="duplicates-empty">
          {filterConfidence === 'all' ? (
            <>
              <div className="empty-icon">✓</div>
              <h2>No Duplicates Found</h2>
              <p>Your library appears to be free of duplicate series.</p>
            </>
          ) : (
            <>
              <p>No {filterConfidence} confidence duplicates found.</p>
              <button onClick={() => setFilterConfidence('all')}>Show All</button>
            </>
          )}
        </div>
      ) : (
        <div className="duplicates-list">
          {filteredGroups.map((group) => (
            <div key={group.id} className="duplicate-group">
              <div className="duplicate-group-header">
                <div className="duplicate-group-info">
                  <span className={`confidence-badge ${getConfidenceBadgeClass(group.confidence)}`}>
                    {group.confidence}
                  </span>
                  <div className="duplicate-reasons">
                    {group.reasons.map((reason) => (
                      <span key={reason} className="reason-tag">
                        {getReasonLabel(reason)}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  className="merge-button"
                  onClick={() => handleMergeClick(group)}
                >
                  Merge
                </button>
              </div>

              <div className="duplicate-series-list">
                {group.series.map((series) => {
                  const coverUrl = getCover(series);

                  return (
                    <div key={series.id} className="duplicate-series-item">
                      <div className="series-cover-small">
                        {coverUrl ? (
                          <img src={coverUrl} alt={series.name} />
                        ) : (
                          <div className="cover-placeholder">
                            {series.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>

                      <div className="series-info">
                        <div className="series-name">{series.name}</div>
                        <div className="series-meta">
                          {series.startYear && <span>{series.startYear}</span>}
                          {series.publisher && <span>{series.publisher}</span>}
                          <span>{series.ownedIssueCount} issues</span>
                        </div>
                        <div className="series-ids">
                          {series.comicVineId && (
                            <span className="id-badge comicvine">CV: {series.comicVineId}</span>
                          )}
                          {series.metronId && (
                            <span className="id-badge metron">Metron: {series.metronId}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {showMergeModal && selectedGroup && (
        <MergeSeriesModal
          isOpen={showMergeModal}
          onClose={handleCloseMergeModal}
          onMergeComplete={handleMergeComplete}
          initialSeries={selectedGroup.series}
        />
      )}
    </div>
  );
}
