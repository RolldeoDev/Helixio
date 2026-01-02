/**
 * Achievement Toast Component
 *
 * Displays toast notifications when achievements are unlocked.
 * Shows a subtle animation with the achievement name and star rating.
 */

import { Link } from 'react-router-dom';
import { useAchievements } from '../../contexts/AchievementContext';
import { Star, Trophy, X } from 'lucide-react';
import './AchievementToast.css';

export function AchievementToast() {
  const { notifications, dismissNotification, pauseTimers, resumeTimers } = useAchievements();

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div
      className="achievement-toast-container"
      onMouseEnter={pauseTimers}
      onMouseLeave={resumeTimers}
    >
      {notifications.map(notification => (
        <div
          key={notification.id}
          className="achievement-toast"
          onClick={() => dismissNotification(notification.id)}
        >
          <div className="achievement-toast__icon">
            <Trophy size={24} />
          </div>
          <div className="achievement-toast__content">
            <div className="achievement-toast__label">Achievement Unlocked!</div>
            <div className="achievement-toast__name">
              {notification.achievement.name}
            </div>
            <div className="achievement-toast__stars">
              {Array.from({ length: 5 }, (_, i) => (
                <Star
                  key={i}
                  size={12}
                  className={i < notification.achievement.stars ? 'star-filled' : 'star-empty'}
                  fill={i < notification.achievement.stars ? 'currentColor' : 'none'}
                />
              ))}
            </div>
            <Link
              to={`/achievements?highlight=${notification.achievement.id}`}
              className="achievement-toast__link"
              onClick={(e) => e.stopPropagation()}
            >
              View Achievement
            </Link>
          </div>
          <button
            className="achievement-toast__close"
            onClick={(e) => {
              e.stopPropagation();
              dismissNotification(notification.id);
            }}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

export default AchievementToast;
