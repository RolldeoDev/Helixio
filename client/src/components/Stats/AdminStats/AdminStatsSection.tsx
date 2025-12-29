import { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import {
  getMostActiveUsers,
  getPopularLibraries,
  getPopularSeries,
  getRecentlyReadAdmin,
  getTopReadersByMediaType,
  type StatsTimeframe,
  type UserReadingRanking,
  type LibraryReadingRanking,
  type PopularSeriesItem,
  type RecentlyReadItem,
  type TopReaderByMediaType,
} from '../../../services/api/series';
import { TimeframeSelector } from './TimeframeSelector';
import { ActiveUsersCard } from './ActiveUsersCard';
import { PopularLibrariesCard } from './PopularLibrariesCard';
import { PopularSeriesCard } from './PopularSeriesCard';
import { RecentlyReadCard } from './RecentlyReadCard';
import { TopReadersByMediaCard } from './TopReadersByMediaCard';
import './AdminStats.css';

export function AdminStatsSection() {
  const { user } = useAuth();
  const [timeframe, setTimeframe] = useState<StatsTimeframe>('this_month');
  const [isLoading, setIsLoading] = useState(true);
  const [activeUsers, setActiveUsers] = useState<UserReadingRanking[]>([]);
  const [popularLibraries, setPopularLibraries] = useState<LibraryReadingRanking[]>([]);
  const [popularSeries, setPopularSeries] = useState<PopularSeriesItem[]>([]);
  const [recentlyRead, setRecentlyRead] = useState<RecentlyReadItem[]>([]);
  const [mediaTypeReaders, setMediaTypeReaders] = useState<TopReaderByMediaType[]>([]);

  // Only render for admin users
  if (!user || user.role !== 'admin') {
    return null;
  }

  // Fetch data when timeframe changes
  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        const [users, libraries, series, recent, mediaType] = await Promise.all([
          getMostActiveUsers(timeframe, 5),
          getPopularLibraries(timeframe, 5),
          getPopularSeries(timeframe, 5),
          getRecentlyReadAdmin(timeframe, 5),
          getTopReadersByMediaType(timeframe, 5),
        ]);

        setActiveUsers(users);
        setPopularLibraries(libraries);
        setPopularSeries(series);
        setRecentlyRead(recent);
        setMediaTypeReaders(mediaType);
      } catch (error) {
        console.error('Failed to fetch admin stats:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [timeframe]);

  return (
    <div className="admin-stats-section">
      <div className="admin-stats-section__header">
        <h2 className="admin-stats-section__title">
          Admin Insights
          <span className="admin-stats-section__badge">Admin</span>
        </h2>
        <TimeframeSelector value={timeframe} onChange={setTimeframe} />
      </div>
      <div className="admin-stats-section__grid">
        <ActiveUsersCard data={activeUsers} isLoading={isLoading} />
        <PopularLibrariesCard data={popularLibraries} isLoading={isLoading} />
        <PopularSeriesCard data={popularSeries} isLoading={isLoading} />
        <RecentlyReadCard data={recentlyRead} isLoading={isLoading} />
        <TopReadersByMediaCard data={mediaTypeReaders} isLoading={isLoading} />
      </div>
    </div>
  );
}
