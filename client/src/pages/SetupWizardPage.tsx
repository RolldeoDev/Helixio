/**
 * SetupWizardPage
 *
 * Full-page setup wizard for first-time users.
 * Shows after initial admin account creation.
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../themes/ThemeContext';
import { WelcomeStep } from '../components/Setup/WelcomeStep';
import { ApiKeysStep } from '../components/Setup/ApiKeysStep';
import { LibraryStep } from '../components/Setup/LibraryStep';
import { ScanStep } from '../components/Setup/ScanStep';
import { PreferencesStep } from '../components/Setup/PreferencesStep';
import '../components/Setup/SetupWizard.css';

type SetupStep = 'welcome' | 'apikeys' | 'library' | 'scan' | 'preferences';

const STEPS: SetupStep[] = ['welcome', 'apikeys', 'library', 'scan', 'preferences'];

export function SetupWizardPage() {
  const navigate = useNavigate();
  const { completeSetup } = useAuth();
  const { colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';

  const [currentStep, setCurrentStep] = useState<SetupStep>('welcome');
  const [createdLibraryId, setCreatedLibraryId] = useState<string | null>(null);

  const currentStepIndex = STEPS.indexOf(currentStep);

  // Skip scan step if no library was created (edge case)
  useEffect(() => {
    if (currentStep === 'scan' && !createdLibraryId) {
      setCurrentStep('preferences');
    }
  }, [currentStep, createdLibraryId]);

  // Handle skip - mark setup as complete and go to home
  const handleSkip = useCallback(async () => {
    try {
      await completeSetup();
      navigate('/');
    } catch (err) {
      console.error('Failed to complete setup:', err);
      // Still navigate even if API fails - they can try again later
      navigate('/');
    }
  }, [completeSetup, navigate]);

  // Handle next step
  const handleNext = useCallback(() => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex]!);
    }
  }, [currentStepIndex]);

  // Handle library creation - advance to scan step
  const handleLibraryCreated = useCallback((libraryId: string) => {
    setCreatedLibraryId(libraryId);
    setCurrentStep('scan');
  }, []);

  // Handle preferences complete - finish wizard
  const handleComplete = useCallback(async () => {
    try {
      await completeSetup();
      navigate('/');
    } catch (err) {
      console.error('Failed to complete setup:', err);
      // Still navigate even if API fails
      navigate('/');
    }
  }, [completeSetup, navigate]);

  // Render step indicator
  const renderStepIndicator = (step: SetupStep, index: number) => {
    const isCompleted = index < currentStepIndex;
    const isActive = step === currentStep;

    return (
      <div
        key={step}
        className={`step-indicator ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : 'pending'}`}
      >
        {isCompleted ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : (
          index + 1
        )}
      </div>
    );
  };

  // Render current step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 'welcome':
        return <WelcomeStep onNext={handleNext} onSkip={handleSkip} />;

      case 'apikeys':
        return <ApiKeysStep onNext={handleNext} onSkip={handleNext} />;

      case 'library':
        return <LibraryStep onLibraryCreated={handleLibraryCreated} onSkip={handleSkip} />;

      case 'scan':
        // useEffect handles the redirect if no library; show nothing while waiting
        if (!createdLibraryId) {
          return null;
        }
        return <ScanStep libraryId={createdLibraryId} onNext={handleNext} onSkip={handleSkip} />;

      case 'preferences':
        return <PreferencesStep onComplete={handleComplete} />;

      default:
        return null;
    }
  };

  return (
    <div className="setup-wizard-page">
      <header className="setup-wizard-header">
        <img
          src={isDark ? '/helixioNameWhiteText.png' : '/helixioNameBlackText.png'}
          alt="Helixio"
        />
        <button className="setup-wizard-skip" onClick={handleSkip}>
          Skip Setup
        </button>
      </header>

      <main className="setup-wizard-content">
        {renderStepContent()}
      </main>

      <footer className="setup-wizard-footer">
        {STEPS.map((step, index) => (
          <div key={step} className="step-indicator-group">
            {renderStepIndicator(step, index)}
            {index < STEPS.length - 1 && (
              <div
                className={`step-connector ${index < currentStepIndex ? 'completed' : ''}`}
              />
            )}
          </div>
        ))}
      </footer>
    </div>
  );
}
