import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { YearlySeriesCount } from '../../../services/api/series';
import './charts.css';

interface ReleaseYearsChartProps {
  data: YearlySeriesCount[];
  isLoading: boolean;
}

export function ReleaseYearsChart({ data, isLoading }: ReleaseYearsChartProps) {
  // Group years into decades if there are too many
  const chartData = useMemo(() => {
    if (data.length <= 20) {
      return data.map(d => ({
        label: d.year.toString(),
        count: d.count,
      }));
    }

    // Group into decades for large datasets
    const decadeMap = new Map<string, number>();
    for (const item of data) {
      const decade = `${Math.floor(item.year / 10) * 10}s`;
      decadeMap.set(decade, (decadeMap.get(decade) || 0) + item.count);
    }

    return Array.from(decadeMap.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => parseInt(a.label) - parseInt(b.label));
  }, [data]);

  if (isLoading) {
    return (
      <div className="stats-chart">
        <div className="stats-chart__header">
          <h3 className="stats-chart__title">Release Years</h3>
          <p className="stats-chart__subtitle">Series by publication year</p>
        </div>
        <div className="stats-chart__skeleton" />
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="stats-chart">
        <div className="stats-chart__header">
          <h3 className="stats-chart__title">Release Years</h3>
          <p className="stats-chart__subtitle">Series by publication year</p>
        </div>
        <div className="stats-chart__empty">No year data available</div>
      </div>
    );
  }

  return (
    <div className="stats-chart">
      <div className="stats-chart__header">
        <h3 className="stats-chart__title">Release Years</h3>
        <p className="stats-chart__subtitle">
          {data.length <= 20 ? 'Series by year' : 'Series by decade'}
        </p>
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
              dataKey="label"
              tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border)' }}
              interval={chartData.length > 10 ? 'preserveStartEnd' : 0}
              angle={chartData.length > 15 ? -45 : 0}
              textAnchor={chartData.length > 15 ? 'end' : 'middle'}
              height={chartData.length > 15 ? 60 : 30}
            />
            <YAxis
              tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
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
              formatter={(value) => [`${value} series`, 'Count']}
            />
            <Bar
              dataKey="count"
              fill="var(--color-primary)"
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
