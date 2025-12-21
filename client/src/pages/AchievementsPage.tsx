import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getAchievements,
  getAchievementSummary,
  getAchievementCategories,
  seedAchievements,
  type AchievementWithProgress,
  type AchievementSummary,
  type AchievementCategory,
} from '../services/api.service';
import { ALL_ACHIEVEMENTS, CATEGORY_INFO } from '../components/Stats/Achievements/achievements-config';
import { AchievementCard } from '../components/AchievementCard';
import { Star, ChevronLeft, Check, Award, Trophy, Filter, Lock } from 'lucide-react';
import './AchievementsPage.css';

type StarFilter = 'all' | 1 | 2 | 3 | 4 | 5;
type StatusFilter = 'all' | 'unlocked' | 'locked';

export function AchievementsPage() {
  const navigate = useNavigate();
  const [achievements, setAchievements] = useState<AchievementWithProgress[]>([]);
  const [summary, setSummary] = useState<AchievementSummary | null>(null);
  const [categories, setCategories] = useState<AchievementCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [starFilter, setStarFilter] = useState<StarFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const [achievementsData, summaryData, categoriesData] = await Promise.all([
        getAchievements(),
        getAchievementSummary(),
        getAchievementCategories(),
      ]);

      // If no achievements in DB, we need to seed
      if (achievementsData.length === 0) {
        await handleSeed();
        return;
      }

      setAchievements(achievementsData);
      setSummary(summaryData);
      setCategories(categoriesData);
    } catch (error) {
      console.error('Failed to load achievements:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSeed() {
    setIsSeeding(true);
    try {
      // Convert ALL_ACHIEVEMENTS to the seed format
      const seedData = ALL_ACHIEVEMENTS.map(a => ({
        key: a.key,
        name: a.name,
        description: a.description,
        category: a.category,
        stars: a.stars,
        icon: a.icon,
        threshold: a.threshold,
        minRequired: a.minRequired,
      }));

      await seedAchievements(seedData);
      await loadData();
    } catch (error) {
      console.error('Failed to seed achievements:', error);
    } finally {
      setIsSeeding(false);
    }
  }

  const filteredAchievements = useMemo(() => {
    return achievements.filter(a => {
      // Category filter
      if (selectedCategory !== 'all' && a.category !== selectedCategory) {
        return false;
      }
      // Star filter
      if (starFilter !== 'all' && a.stars !== starFilter) {
        return false;
      }
      // Status filter
      if (statusFilter === 'unlocked' && !a.isUnlocked) {
        return false;
      }
      if (statusFilter === 'locked' && a.isUnlocked) {
        return false;
      }
      return true;
    });
  }, [achievements, selectedCategory, starFilter, statusFilter]);

  const groupedAchievements = useMemo(() => {
    if (selectedCategory !== 'all') {
      return { [selectedCategory]: filteredAchievements };
    }

    const groups: Record<string, AchievementWithProgress[]> = {};
    for (const a of filteredAchievements) {
      if (!groups[a.category]) {
        groups[a.category] = [];
      }
      groups[a.category]!.push(a);
    }
    return groups;
  }, [filteredAchievements, selectedCategory]);

  if (isLoading || isSeeding) {
    return (
      <div className="achievements-page achievements-page--loading">
        <div className="achievements-page__header">
          <button className="back-button" onClick={() => navigate('/stats')}>
            <ChevronLeft size={20} />
            <span>Back to Stats</span>
          </button>
          <h1>Achievements</h1>
        </div>
        <div className="achievements-page__loading">
          {isSeeding ? 'Setting up achievements...' : 'Loading achievements...'}
        </div>
      </div>
    );
  }

  return (
    <div className="achievements-page">
      <div className="achievements-page__header">
        <button className="back-button" onClick={() => navigate('/stats')}>
          <ChevronLeft size={20} />
          <span>Back to Stats</span>
        </button>
        <h1>Achievements</h1>
      </div>

      {/* Summary Section */}
      {summary && (
        <div className="achievements-summary">
          <div className="summary-card summary-card--primary">
            <Trophy size={32} className="summary-icon" />
            <div className="summary-content">
              <div className="summary-value">{summary.unlockedCount}</div>
              <div className="summary-label">Unlocked</div>
            </div>
            <div className="summary-total">of {summary.totalAchievements}</div>
          </div>

          <div className="summary-card summary-card--stars">
            <Award size={32} className="summary-icon" />
            <div className="summary-content">
              <div className="summary-value">{summary.earnedStars}</div>
              <div className="summary-label">Stars Earned</div>
            </div>
            <div className="summary-total">of {summary.totalStars}</div>
          </div>

          <div className="summary-card summary-card--progress">
            <div className="summary-progress-bar">
              <div
                className="summary-progress-fill"
                style={{
                  width: `${Math.round((summary.unlockedCount / summary.totalAchievements) * 100)}%`,
                }}
              />
            </div>
            <div className="summary-percent">
              {Math.round((summary.unlockedCount / summary.totalAchievements) * 100)}% Complete
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="achievements-filters">
        <div className="filter-group">
          <label className="filter-label">
            <Filter size={14} />
            Category
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.key} value={cat.key}>
                {cat.name} ({cat.unlocked}/{cat.total})
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Stars</label>
          <div className="filter-buttons">
            <button
              className={`filter-btn ${starFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStarFilter('all')}
            >
              All
            </button>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                className={`filter-btn ${starFilter === star ? 'active' : ''}`}
                onClick={() => setStarFilter(star as StarFilter)}
              >
                {star}<Star size={12} fill="currentColor" />
              </button>
            ))}
          </div>
        </div>

        <div className="filter-group">
          <label className="filter-label">Status</label>
          <div className="filter-buttons">
            <button
              className={`filter-btn ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              All
            </button>
            <button
              className={`filter-btn ${statusFilter === 'unlocked' ? 'active' : ''}`}
              onClick={() => setStatusFilter('unlocked')}
            >
              <Check size={14} /> Unlocked
            </button>
            <button
              className={`filter-btn ${statusFilter === 'locked' ? 'active' : ''}`}
              onClick={() => setStatusFilter('locked')}
            >
              <Lock size={14} /> Locked
            </button>
          </div>
        </div>
      </div>

      {/* Achievement Count */}
      <div className="achievements-count">
        Showing {filteredAchievements.length} achievement{filteredAchievements.length !== 1 ? 's' : ''}
      </div>

      {/* Achievements Grid */}
      <div className="achievements-content">
        {Object.entries(groupedAchievements).map(([category, categoryAchievements]) => (
          <div key={category} className="achievement-category">
            {selectedCategory === 'all' && (
              <div className="category-header">
                <h2 className="category-title">
                  {CATEGORY_INFO[category as keyof typeof CATEGORY_INFO]?.name || category}
                </h2>
                <span className="category-count">
                  {categoryAchievements.filter(a => a.isUnlocked).length}/{categoryAchievements.length}
                </span>
              </div>
            )}

            <div className="achievements-grid">
              {categoryAchievements.map((achievement) => (
                <AchievementCard key={achievement.id} achievement={achievement} />
              ))}
            </div>
          </div>
        ))}

        {filteredAchievements.length === 0 && (
          <div className="achievements-empty">
            No achievements match your filters
          </div>
        )}
      </div>
    </div>
  );
}
