import { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { PublicationStatusDistribution } from '../../../services/api/series';
import './charts.css';

interface PublicationStatusChartProps {
  data: PublicationStatusDistribution[];
  isLoading: boolean;
}

const STATUS_COLORS = {
  ongoing: 'var(--color-success)',
  ended: 'var(--color-text-tertiary)',
};

const STATUS_LABELS = {
  ongoing: 'Ongoing',
  ended: 'Ended',
};

export function PublicationStatusChart({ data, isLoading }: PublicationStatusChartProps) {
  const chartData = useMemo(() => {
    return data.map(d => ({
      name: STATUS_LABELS[d.status],
      value: d.count,
      percentage: d.percentage,
      color: STATUS_COLORS[d.status],
    }));
  }, [data]);

  const total = useMemo(() => {
    return data.reduce((sum, d) => sum + d.count, 0);
  }, [data]);

  if (isLoading) {
    return (
      <div className="stats-chart">
        <div className="stats-chart__header">
          <h3 className="stats-chart__title">Publication Status</h3>
          <p className="stats-chart__subtitle">Ongoing vs Ended series</p>
        </div>
        <div className="stats-chart__skeleton" />
      </div>
    );
  }

  if (chartData.length === 0 || total === 0) {
    return (
      <div className="stats-chart">
        <div className="stats-chart__header">
          <h3 className="stats-chart__title">Publication Status</h3>
          <p className="stats-chart__subtitle">Ongoing vs Ended series</p>
        </div>
        <div className="stats-chart__empty">No status data available</div>
      </div>
    );
  }

  return (
    <div className="stats-chart">
      <div className="stats-chart__header">
        <h3 className="stats-chart__title">Publication Status</h3>
        <p className="stats-chart__subtitle">{total.toLocaleString()} total series</p>
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
              label={({ name, payload }) =>
                `${name ?? 'Unknown'}: ${(payload as { percentage?: number })?.percentage ?? 0}%`
              }
              labelLine={false}
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
                  `${(value as number).toLocaleString()} series (${payload.percentage}%)`,
                  payload.name,
                ];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="stats-chart__legend">
        {chartData.map(item => (
          <div key={item.name} className="stats-chart__legend-item">
            <div
              className="stats-chart__legend-color"
              style={{ background: item.color }}
            />
            <span>{item.name}</span>
            <span className="stats-chart__legend-value">
              {item.value.toLocaleString()} ({item.percentage}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
