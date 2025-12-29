import { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { FileFormatDistribution } from '../../../services/api/series';
import './charts.css';

interface FileFormatChartProps {
  data: FileFormatDistribution[];
  isLoading: boolean;
}

// Color palette for file formats
const FORMAT_COLORS: Record<string, string> = {
  cbz: 'var(--color-primary)',
  cbr: 'var(--color-success)',
  cb7: 'var(--color-warning)',
  pdf: '#ef4444',
  epub: '#8b5cf6',
  jpg: '#f59e0b',
  png: '#06b6d4',
  unknown: 'var(--color-text-tertiary)',
};

function getFormatColor(extension: string): string {
  const ext = extension.toLowerCase().replace('.', '');
  return FORMAT_COLORS[ext] || 'var(--color-text-tertiary)';
}

export function FileFormatChart({ data, isLoading }: FileFormatChartProps) {
  const chartData = useMemo(() => {
    return data.map(d => ({
      name: d.extension.toUpperCase(),
      value: d.count,
      percentage: d.percentage,
      color: getFormatColor(d.extension),
    }));
  }, [data]);

  const total = useMemo(() => {
    return data.reduce((sum, d) => sum + d.count, 0);
  }, [data]);

  if (isLoading) {
    return (
      <div className="stats-chart">
        <div className="stats-chart__header">
          <h3 className="stats-chart__title">File Formats</h3>
          <p className="stats-chart__subtitle">Distribution by extension</p>
        </div>
        <div className="stats-chart__skeleton" />
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="stats-chart">
        <div className="stats-chart__header">
          <h3 className="stats-chart__title">File Formats</h3>
          <p className="stats-chart__subtitle">Distribution by extension</p>
        </div>
        <div className="stats-chart__empty">No format data available</div>
      </div>
    );
  }

  return (
    <div className="stats-chart">
      <div className="stats-chart__header">
        <h3 className="stats-chart__title">File Formats</h3>
        <p className="stats-chart__subtitle">{total.toLocaleString()} total files</p>
      </div>
      <div className="stats-chart__content">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
              stroke="var(--color-surface)"
              strokeWidth={2}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
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
              formatter={(value, _name, props) => {
                const payload = props.payload;
                return [
                  `${(value as number).toLocaleString()} files (${payload.percentage}%)`,
                  payload.name,
                ];
              }}
            />
            <Legend
              layout="horizontal"
              verticalAlign="bottom"
              align="center"
              formatter={(value, entry) => {
                const payload = entry.payload as { percentage: number } | undefined;
                return (
                  <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                    {value} ({payload?.percentage || 0}%)
                  </span>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
