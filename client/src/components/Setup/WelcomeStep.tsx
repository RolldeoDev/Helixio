/**
 * WelcomeStep Component
 *
 * First step of the setup wizard. Welcomes the user and shows feature highlights.
 */

import './SetupWizard.css';

interface WelcomeStepProps {
  onNext: () => void;
  onSkip: () => void;
}

export function WelcomeStep({ onNext, onSkip }: WelcomeStepProps) {
  const features = [
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      ),
      title: 'Organize Libraries',
      description: 'Import your comic collections from local folders or network drives',
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      ),
      title: 'Read Comics',
      description: 'Multiple reading modes: single page, double page, or webtoon scroll',
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      ),
      title: 'Auto Metadata',
      description: 'Automatically fetch metadata from ComicVine, Metron, and more',
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20V10" />
          <path d="M18 20V4" />
          <path d="M6 20v-4" />
        </svg>
      ),
      title: 'Track Progress',
      description: 'Reading history, statistics, achievements, and personalized recommendations',
    },
  ];

  return (
    <div className="setup-step welcome-step">
      <div className="welcome-header">
        <h1>Welcome to Helixio!</h1>
        <p className="welcome-subtitle">
          Your personal comic book library manager. Let's get you set up in just a few steps.
        </p>
      </div>

      <div className="features-grid">
        {features.map((feature, index) => (
          <div key={index} className="feature-card">
            <div className="feature-icon">{feature.icon}</div>
            <h3 className="feature-title">{feature.title}</h3>
            <p className="feature-description">{feature.description}</p>
          </div>
        ))}
      </div>

      <div className="step-actions">
        <button className="btn-primary btn-lg" onClick={onNext}>
          Get Started
        </button>
        <button className="btn-text" onClick={onSkip}>
          Skip for now
        </button>
      </div>
    </div>
  );
}
