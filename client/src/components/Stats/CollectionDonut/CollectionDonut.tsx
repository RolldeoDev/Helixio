import { useMemo, useState } from 'react';
import type { AggregatedStats } from '../../../services/api.service';
import './CollectionDonut.css';

interface CollectionDonutProps {
  stats: AggregatedStats | null;
  isLoading: boolean;
}

interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string;
  offset: number;
  percentage: number;
}

const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const STROKE_WIDTH = 12;

export function CollectionDonut({ stats, isLoading }: CollectionDonutProps) {
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);

  const segments = useMemo((): DonutSegment[] => {
    if (!stats) return [];

    const total = stats.filesRead + stats.filesInProgress + stats.filesUnread;
    if (total === 0) return [];

    const read = stats.filesRead;
    const inProgress = stats.filesInProgress;
    const unread = stats.filesUnread;

    let offset = 0;
    const result: DonutSegment[] = [];

    if (read > 0) {
      const percentage = (read / total) * 100;
      result.push({
        key: 'read',
        label: 'Read',
        value: read,
        color: 'var(--color-success)',
        offset,
        percentage,
      });
      offset += percentage;
    }

    if (inProgress > 0) {
      const percentage = (inProgress / total) * 100;
      result.push({
        key: 'inProgress',
        label: 'In Progress',
        value: inProgress,
        color: 'var(--color-warning)',
        offset,
        percentage,
      });
      offset += percentage;
    }

    if (unread > 0) {
      const percentage = (unread / total) * 100;
      result.push({
        key: 'unread',
        label: 'Unread',
        value: unread,
        color: 'var(--color-bg-tertiary)',
        offset,
        percentage,
      });
    }

    return result;
  }, [stats]);

  const total = stats ? stats.filesRead + stats.filesInProgress + stats.filesUnread : 0;

  if (isLoading) {
    return (
      <div className="collection-donut collection-donut--loading">
        <div className="collection-donut__header">
          <h3 className="collection-donut__title">Collection</h3>
        </div>
        <div className="collection-donut__skeleton" />
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="collection-donut collection-donut--empty">
        <div className="collection-donut__header">
          <h3 className="collection-donut__title">Collection</h3>
        </div>
        <div className="collection-donut__empty-state">
          <span>No comics in library yet</span>
        </div>
      </div>
    );
  }

  return (
    <div className="collection-donut">
      <div className="collection-donut__header">
        <h3 className="collection-donut__title">Collection</h3>
        <span className="collection-donut__subtitle">{total.toLocaleString()} total comics</span>
      </div>

      <div className="collection-donut__chart-area">
        <svg viewBox="0 0 100 100" className="collection-donut__chart">
          {/* Background ring */}
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            stroke="var(--color-bg-tertiary)"
            strokeWidth={STROKE_WIDTH}
            opacity={0.3}
          />

          {/* Segments */}
          {segments.map((segment, index) => {
            const strokeDasharray = (segment.percentage / 100) * CIRCUMFERENCE;
            const strokeDashoffset = -(segment.offset / 100) * CIRCUMFERENCE;
            const isHovered = hoveredSegment === segment.key;

            return (
              <circle
                key={segment.key}
                cx="50"
                cy="50"
                r={RADIUS}
                fill="none"
                stroke={segment.color}
                strokeWidth={isHovered ? STROKE_WIDTH + 2 : STROKE_WIDTH}
                strokeDasharray={`${strokeDasharray} ${CIRCUMFERENCE}`}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                transform="rotate(-90 50 50)"
                className="collection-donut__segment"
                style={{
                  animationDelay: `${index * 200}ms`,
                  opacity: hoveredSegment && !isHovered ? 0.5 : 1,
                }}
                onMouseEnter={() => setHoveredSegment(segment.key)}
                onMouseLeave={() => setHoveredSegment(null)}
              />
            );
          })}

          {/* Center text */}
          <text
            x="50"
            y="46"
            textAnchor="middle"
            className="collection-donut__center-value"
          >
            {hoveredSegment
              ? segments.find((s) => s.key === hoveredSegment)?.value.toLocaleString()
              : Math.round((stats?.filesRead ?? 0) / total * 100)}
          </text>
          <text
            x="50"
            y="58"
            textAnchor="middle"
            className="collection-donut__center-label"
          >
            {hoveredSegment
              ? segments.find((s) => s.key === hoveredSegment)?.label
              : '% Read'}
          </text>
        </svg>
      </div>

      {/* Legend / Breakdown */}
      <div className="collection-donut__legend">
        {segments.map((segment) => (
          <div
            key={segment.key}
            className={`collection-donut__legend-item ${
              hoveredSegment === segment.key ? 'active' : ''
            } ${hoveredSegment && hoveredSegment !== segment.key ? 'dimmed' : ''}`}
            onMouseEnter={() => setHoveredSegment(segment.key)}
            onMouseLeave={() => setHoveredSegment(null)}
          >
            <span
              className="collection-donut__legend-dot"
              style={{ background: segment.color }}
            />
            <span className="collection-donut__legend-label">{segment.label}</span>
            <span className="collection-donut__legend-value">
              {segment.value.toLocaleString()}
            </span>
            <span className="collection-donut__legend-percent">
              {Math.round(segment.percentage)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
