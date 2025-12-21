import { useMemo, useState, useCallback } from 'react';
import type { DailyStats } from '../../../services/api.service';
import {
  transformToHeatmapData,
  getMonthLabels,
  type HeatmapDay,
  type HeatmapMetric,
} from './heatmap-utils';
import { HeatmapTooltip } from './HeatmapTooltip';
import './ActivityHeatmap.css';

interface ActivityHeatmapProps {
  dailyStats: DailyStats[];
  isLoading: boolean;
}

const CELL_SIZE = 11;
const CELL_GAP = 3;
const CELL_TOTAL = CELL_SIZE + CELL_GAP;
const DAYS_IN_YEAR = 365;
const WEEKS_IN_YEAR = 53;
const PADDING_LEFT = 32;
const PADDING_TOP = 20;

const INTENSITY_COLORS = [
  'var(--heatmap-0, var(--color-bg-tertiary))',
  'var(--heatmap-1, rgba(212, 165, 116, 0.2))',
  'var(--heatmap-2, rgba(212, 165, 116, 0.4))',
  'var(--heatmap-3, rgba(212, 165, 116, 0.6))',
  'var(--heatmap-4, rgba(212, 165, 116, 0.8))',
  'var(--heatmap-5, var(--color-primary))',
];

const DAY_LABELS = ['Sun', '', 'Tue', '', 'Thu', '', 'Sat'];

export function ActivityHeatmap({ dailyStats, isLoading }: ActivityHeatmapProps) {
  const [metric, setMetric] = useState<HeatmapMetric>('pages');
  const [hoveredDay, setHoveredDay] = useState<HeatmapDay | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);

  const weeks = useMemo(
    () => transformToHeatmapData(dailyStats, metric, DAYS_IN_YEAR),
    [dailyStats, metric]
  );

  const monthLabels = useMemo(() => getMonthLabels(DAYS_IN_YEAR), []);

  const handleCellHover = useCallback(
    (day: HeatmapDay, event: React.MouseEvent<SVGRectElement>) => {
      if (day.intensity === -1) return;

      const rect = event.currentTarget.getBoundingClientRect();
      setHoveredDay(day);
      setTooltipPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
      });
    },
    []
  );

  const handleCellLeave = useCallback(() => {
    setHoveredDay(null);
    setTooltipPosition(null);
  }, []);

  const svgWidth = PADDING_LEFT + WEEKS_IN_YEAR * CELL_TOTAL;
  const svgHeight = PADDING_TOP + 7 * CELL_TOTAL + 8;

  // Calculate total stats for summary
  const totalStats = useMemo(() => {
    return dailyStats.reduce(
      (acc, day) => ({
        pages: acc.pages + day.pagesRead,
        time: acc.time + day.totalDuration,
        activeDays: acc.activeDays + (day.pagesRead > 0 || day.totalDuration > 0 ? 1 : 0),
      }),
      { pages: 0, time: 0, activeDays: 0 }
    );
  }, [dailyStats]);

  if (isLoading) {
    return (
      <div className="activity-heatmap activity-heatmap--loading">
        <div className="activity-heatmap__header">
          <h3 className="activity-heatmap__title">Reading Activity</h3>
        </div>
        <div className="activity-heatmap__skeleton" />
      </div>
    );
  }

  return (
    <div className="activity-heatmap">
      <div className="activity-heatmap__header">
        <div className="activity-heatmap__title-group">
          <h3 className="activity-heatmap__title">Reading Activity</h3>
          <span className="activity-heatmap__subtitle">
            {totalStats.activeDays} active days in the past year
          </span>
        </div>
        <div className="activity-heatmap__toggle">
          <button
            className={`activity-heatmap__toggle-btn ${metric === 'pages' ? 'active' : ''}`}
            onClick={() => setMetric('pages')}
          >
            Pages
          </button>
          <button
            className={`activity-heatmap__toggle-btn ${metric === 'time' ? 'active' : ''}`}
            onClick={() => setMetric('time')}
          >
            Time
          </button>
        </div>
      </div>

      <div className="activity-heatmap__chart-wrapper">
        <svg
          className="activity-heatmap__chart"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          preserveAspectRatio="xMinYMin meet"
        >
          {/* Day labels (Sun, Tue, Thu, Sat) */}
          {DAY_LABELS.map((label, i) => (
            <text
              key={i}
              x={PADDING_LEFT - 6}
              y={PADDING_TOP + i * CELL_TOTAL + CELL_SIZE / 2 + 4}
              className="activity-heatmap__day-label"
              textAnchor="end"
            >
              {label}
            </text>
          ))}

          {/* Month labels */}
          {monthLabels.map((label, i) => (
            <text
              key={i}
              x={PADDING_LEFT + label.weekIndex * CELL_TOTAL}
              y={PADDING_TOP - 6}
              className="activity-heatmap__month-label"
            >
              {label.month}
            </text>
          ))}

          {/* Cells */}
          {weeks.map((week) =>
            week.days.map((day, dayIndex) => {
              if (day.intensity === -1) return null;

              return (
                <rect
                  key={`${week.weekIndex}-${dayIndex}`}
                  x={PADDING_LEFT + week.weekIndex * CELL_TOTAL}
                  y={PADDING_TOP + dayIndex * CELL_TOTAL}
                  width={CELL_SIZE}
                  height={CELL_SIZE}
                  rx={2}
                  fill={INTENSITY_COLORS[day.intensity]}
                  className="activity-heatmap__cell"
                  onMouseEnter={(e) => handleCellHover(day, e)}
                  onMouseLeave={handleCellLeave}
                />
              );
            })
          )}
        </svg>
      </div>

      {/* Legend */}
      <div className="activity-heatmap__footer">
        <span className="activity-heatmap__legend-label">Less</span>
        <div className="activity-heatmap__legend">
          {INTENSITY_COLORS.map((color, i) => (
            <div
              key={i}
              className="activity-heatmap__legend-cell"
              style={{ background: color }}
            />
          ))}
        </div>
        <span className="activity-heatmap__legend-label">More</span>
      </div>

      <HeatmapTooltip day={hoveredDay} position={tooltipPosition} />
    </div>
  );
}
