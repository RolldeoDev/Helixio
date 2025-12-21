import React from 'react';
import type { ThemeDefinition } from '../../themes/types';
import './ThemeMockup.css';

interface ThemeMockupProps {
  theme: ThemeDefinition;
  isSelected: boolean;
  onClick: () => void;
  onEdit: () => void;
}

/**
 * ThemeMockup - Mini app preview showing theme colors
 * Displays a recognizable UI layout with icons and text
 */
export function ThemeMockup({ theme, isSelected, onClick, onEdit }: ThemeMockupProps) {
  const { tokens } = theme;

  const mockupStyle = {
    '--mockup-bg': tokens.colorBg,
    '--mockup-sidebar': tokens.colorBgSecondary,
    '--mockup-card': tokens.colorBgCard,
    '--mockup-elevated': tokens.colorBgElevated,
    '--mockup-primary': tokens.colorPrimary,
    '--mockup-text': tokens.colorText,
    '--mockup-text-muted': tokens.colorTextMuted,
    '--mockup-accent': tokens.colorAccent,
    '--mockup-border': tokens.colorBorder,
    '--mockup-hover': tokens.colorHover,
  } as React.CSSProperties;

  return (
    <div
      className={`theme-mockup ${isSelected ? 'theme-mockup--selected' : ''}`}
      style={mockupStyle}
    >
      <button
        className="theme-mockup__preview"
        onClick={onClick}
        type="button"
        aria-label={`Select ${theme.meta.name} theme`}
      >
        <div className="theme-mockup__frame">
          {/* Sidebar with navigation icons */}
          <div className="theme-mockup__sidebar">
            <div className="theme-mockup__logo">H</div>
            <div className="theme-mockup__nav">
              <div className="theme-mockup__nav-item theme-mockup__nav-item--active">
                <span className="theme-mockup__icon">
                  <svg viewBox="0 0 16 16" fill="currentColor">
                    <path d="M1 2.5A1.5 1.5 0 012.5 1h3A1.5 1.5 0 017 2.5v3A1.5 1.5 0 015.5 7h-3A1.5 1.5 0 011 5.5v-3zM2.5 2a.5.5 0 00-.5.5v3a.5.5 0 00.5.5h3a.5.5 0 00.5-.5v-3a.5.5 0 00-.5-.5h-3zM1 10.5A1.5 1.5 0 012.5 9h3A1.5 1.5 0 017 10.5v3A1.5 1.5 0 015.5 15h-3A1.5 1.5 0 011 13.5v-3zm1.5-.5a.5.5 0 00-.5.5v3a.5.5 0 00.5.5h3a.5.5 0 00.5-.5v-3a.5.5 0 00-.5-.5h-3zM9 2.5A1.5 1.5 0 0110.5 1h3A1.5 1.5 0 0115 2.5v3A1.5 1.5 0 0113.5 7h-3A1.5 1.5 0 019 5.5v-3zm1.5-.5a.5.5 0 00-.5.5v3a.5.5 0 00.5.5h3a.5.5 0 00.5-.5v-3a.5.5 0 00-.5-.5h-3zM9 10.5a1.5 1.5 0 011.5-1.5h3a1.5 1.5 0 011.5 1.5v3a1.5 1.5 0 01-1.5 1.5h-3A1.5 1.5 0 019 13.5v-3zm1.5-.5a.5.5 0 00-.5.5v3a.5.5 0 00.5.5h3a.5.5 0 00.5-.5v-3a.5.5 0 00-.5-.5h-3z"/>
                  </svg>
                </span>
              </div>
              <div className="theme-mockup__nav-item">
                <span className="theme-mockup__icon">
                  <svg viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3.612 15.443c-.386.198-.824-.149-.746-.592l.83-4.73L.173 6.765c-.329-.314-.158-.888.283-.95l4.898-.696L7.538.792c.197-.39.73-.39.927 0l2.184 4.327 4.898.696c.441.062.612.636.282.95l-3.522 3.356.83 4.73c.078.443-.36.79-.746.592L8 13.187l-4.389 2.256z"/>
                  </svg>
                </span>
              </div>
              <div className="theme-mockup__nav-item">
                <span className="theme-mockup__icon">
                  <svg viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 4.754a3.246 3.246 0 100 6.492 3.246 3.246 0 000-6.492zM5.754 8a2.246 2.246 0 114.492 0 2.246 2.246 0 01-4.492 0z"/>
                    <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 01-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 01-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 01.52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 011.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 011.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 01.52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 01-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 01-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 002.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 001.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 00-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 00-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 00-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 001.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 003.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 002.692-1.115l.094-.319z"/>
                  </svg>
                </span>
              </div>
            </div>
          </div>

          {/* Main content area */}
          <div className="theme-mockup__content">
            {/* Header bar */}
            <div className="theme-mockup__header">
              <span className="theme-mockup__title">Library</span>
              <div className="theme-mockup__header-actions">
                <div className="theme-mockup__search" />
              </div>
            </div>

            {/* Card grid */}
            <div className="theme-mockup__grid">
              <div className="theme-mockup__card">
                <div className="theme-mockup__card-cover" />
                <div className="theme-mockup__card-info" />
              </div>
              <div className="theme-mockup__card">
                <div className="theme-mockup__card-cover" />
                <div className="theme-mockup__card-info" />
              </div>
              <div className="theme-mockup__card">
                <div className="theme-mockup__card-cover" />
                <div className="theme-mockup__card-info" />
              </div>
              <div className="theme-mockup__card">
                <div className="theme-mockup__card-cover" />
                <div className="theme-mockup__card-info" />
              </div>
            </div>
          </div>
        </div>
      </button>

      <div className="theme-mockup__footer">
        <div className="theme-mockup__info">
          <span className="theme-mockup__name">{theme.meta.name}</span>
          {isSelected && (
            <span className="theme-mockup__check" aria-label="Selected">
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M13.854 3.646a.5.5 0 010 .708l-7 7a.5.5 0 01-.708 0l-3.5-3.5a.5.5 0 11.708-.708L6.5 10.293l6.646-6.647a.5.5 0 01.708 0z"/>
              </svg>
            </span>
          )}
        </div>
        <button
          className="theme-mockup__edit-btn"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          type="button"
        >
          Edit
        </button>
      </div>
    </div>
  );
}

export default ThemeMockup;
