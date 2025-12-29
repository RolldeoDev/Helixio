import { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { DayOfWeekActivity, StatsTimeframe } from '../../../services/api/series';
import './charts.css';

interface DayOfWeekChartProps {
  data: DayOfWeekActivity[];
  isLoading: boolean;
  timeframe: StatsTimeframe;
  onTimeframeChange: (timeframe: StatsTimeframe) => void;
}

type Metric = 'readCount' | 'pagesRead' | 'readingTime';

const METRIC_LABELS: Record<Metric, string> = {
  readCount: 'Sessions',
  pagesRead: 'Pages',
  readingTime: 'Time',
};

const TIMEFRAME_LABELS: Record<StatsTimeframe, string> = {
  this_week: 'This Week',
  this_month: 'This Month',
  this_year: 'This Year',
  all_time: 'All Time',
};

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function DayOfWeekChart({
  data,
  isLoading,
  timeframe,
  onTimeframeChange,
}: DayOfWeekChartProps) {
  const [metric, setMetric] = useState<Metric>('readCount');

  const chartData = useMemo(() => {
    const today = new Date().getDay();
    return data.map(d => ({
      ...d,
      dayShort: d.dayName.slice(0, 3),
      value: metric === 'readingTime' ? d.readingTime / 60 : d[metric], // Convert to minutes for time
      isToday: d.dayOfWeek === today,
    }));
  }, [data, metric]);

  const maxValue = useMemo(() => {
    return Math.max(...chartData.map(d => d.value), 1);
  }, [chartData]);

  if (isLoading) {
    return (
      <div className="stats-chart">
        <div className="stats-chart__header">
          <h3 className="stats-chart__title">Reading Activity</h3>
          <p className="stats-chart__subtitle">Activity by day of week</p>
        </div>
        <div className="stats-chart__skeleton" />
      </div>
    );
  }

  const formatValue = (value: number) => {
    if (metric === 'readingTime') {
      return formatTime(value * 60);
    }
    return value.toLocaleString();
  };

  return (
    <div className="stats-chart">
      <div className="stats-chart__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h3 className="stats-chart__title">Reading Activity</h3>
          <p className="stats-chart__subtitle">By day of week</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <select
            value={timeframe}
            onChange={(e) => onTimeframeChange(e.target.value as StatsTimeframe)}
            style={{
              background: 'var(--color-surface-hover)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              padding: '4px 8px',
              fontSize: '12px',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
            }}
          >
            {Object.entries(TIMEFRAME_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as Metric)}
            style={{
              background: 'var(--color-surface-hover)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              padding: '4px 8px',
              fontSize: '12px',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
            }}
          >
            {Object.entries(METRIC_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="stats-chart__content">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border)"
              vertical={false}
            />
            <XAxis
              dataKey="dayShort"
              tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border)' }}
            />
            <YAxis
              tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              tickFormatter={(value) => {
                if (metric === 'readingTime') {
                  const hours = Math.floor(value / 60);
                  return hours > 0 ? `${hours}h` : `${value}m`;
                }
                return value.toString();
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-bg-secondary)',
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                boxShadow: 'var(--shadow-lg)',
                color: 'var(--color-text)',
              }}
              wrapperStyle={{ outline: 'none' }}
              labelStyle={{ color: 'var(--color-text)', fontWeight: 600 }}
              itemStyle={{ color: 'var(--color-text-muted)' }}
              cursor={{ fill: 'var(--color-primary)', opacity: 0.1 }}
              labelFormatter={(label, payload) => {
                const item = payload?.[0]?.payload;
                return item?.dayName || label;
              }}
              formatter={(value) => [
                formatValue(value as number),
                METRIC_LABELS[metric],
              ]}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={50}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.isToday ? 'var(--color-primary)' : 'var(--color-primary-muted)'}
                  opacity={entry.value / maxValue * 0.7 + 0.3}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
