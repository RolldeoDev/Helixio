import type { EnhancedLibraryOverview } from '../../../services/api/series';
import './LibraryOverview.css';

interface LibraryOverviewProps {
  data: EnhancedLibraryOverview | null;
  isLoading: boolean;
}

function formatBytes(bytes: number): { value: string; unit: string } {
  if (bytes === 0) return { value: '0', unit: 'B' };

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  const value = parseFloat((bytes / Math.pow(k, i)).toFixed(1));
  return { value: value.toString(), unit: units[i] || 'B' };
}

function formatDuration(seconds: number): { value: string; unit: string } {
  const hours = seconds / 3600;

  if (hours >= 24) {
    const days = hours / 24;
    return { value: days.toFixed(1), unit: 'days' };
  }

  if (hours >= 1) {
    return { value: hours.toFixed(1), unit: 'hours' };
  }

  const minutes = seconds / 60;
  return { value: minutes.toFixed(0), unit: 'min' };
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toLocaleString();
}

export function LibraryOverview({ data, isLoading }: LibraryOverviewProps) {
  if (isLoading) {
    return (
      <div className="library-overview">
        <div className="library-overview__header">
          <h3 className="library-overview__title">Library Overview</h3>
          <p className="library-overview__subtitle">Collection statistics</p>
        </div>
        <div className="library-overview__skeleton">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="library-overview__skeleton-item" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="library-overview">
        <div className="library-overview__header">
          <h3 className="library-overview__title">Library Overview</h3>
          <p className="library-overview__subtitle">No data available</p>
        </div>
      </div>
    );
  }

  const size = formatBytes(data.totalSizeBytes);
  const readTime = formatDuration(data.totalReadTime);

  const stats = [
    { label: 'Total Series', value: formatNumber(data.totalSeries), highlight: true },
    { label: 'Total Volumes', value: formatNumber(data.totalVolumes) },
    { label: 'Total Files', value: formatNumber(data.totalFiles) },
    { label: 'Total Size', value: size.value, unit: size.unit },
    { label: 'Total Genres', value: data.totalGenres.toString() },
    { label: 'Total Tags', value: data.totalTags.toString() },
    { label: 'Total People', value: formatNumber(data.totalPeople) },
    { label: 'Total Read Time', value: readTime.value, unit: readTime.unit },
  ];

  return (
    <div className="library-overview">
      <div className="library-overview__header">
        <h3 className="library-overview__title">Library Overview</h3>
        <p className="library-overview__subtitle">Your collection at a glance</p>
      </div>
      <div className="library-overview__grid">
        {stats.map((stat) => (
          <div key={stat.label} className="library-overview__stat">
            <span className="library-overview__stat-label">{stat.label}</span>
            <span
              className={`library-overview__stat-value ${stat.highlight ? 'library-overview__stat-value--highlight' : ''}`}
            >
              {stat.value}
              {stat.unit && (
                <span className="library-overview__stat-unit"> {stat.unit}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
