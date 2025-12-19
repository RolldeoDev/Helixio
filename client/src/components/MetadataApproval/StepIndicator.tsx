/**
 * StepIndicator Component
 *
 * Shows workflow progress with clickable steps to view past logs.
 */

import './StepIndicator.css';

export type StepId =
  | 'options'
  | 'initializing'
  | 'series_approval'
  | 'fetching_issues'
  | 'file_review'
  | 'applying'
  | 'complete'
  | 'error';

export interface StepInfo {
  id: StepId;
  label: string;
  shortLabel: string;
}

export const WORKFLOW_STEPS: StepInfo[] = [
  { id: 'options', label: 'Options', shortLabel: 'Options' },
  { id: 'initializing', label: 'Initializing', shortLabel: 'Init' },
  { id: 'series_approval', label: 'Series Approval', shortLabel: 'Series' },
  { id: 'file_review', label: 'File Review', shortLabel: 'Files' },
  { id: 'applying', label: 'Applying', shortLabel: 'Apply' },
  { id: 'complete', label: 'Complete', shortLabel: 'Done' },
];

// Steps that can be clicked to view history
const VIEWABLE_STEPS = new Set<StepId>([
  'initializing',
  'series_approval',
  'file_review',
  'applying',
]);

interface StepIndicatorProps {
  currentStep: StepId;
  viewingStep: StepId | null;
  onStepClick: (step: StepId) => void;
  completedSteps: Set<StepId>;
}

export function StepIndicator({
  currentStep,
  viewingStep,
  onStepClick,
  completedSteps,
}: StepIndicatorProps) {
  // Don't show for error state
  if (currentStep === 'error') {
    return null;
  }

  const currentIndex = WORKFLOW_STEPS.findIndex((s) => s.id === currentStep);

  // Filter out fetching_issues as it's a transient state
  const displaySteps = WORKFLOW_STEPS.filter((s) => s.id !== 'fetching_issues');

  return (
    <div className="step-indicator">
      <div className="step-track">
        {displaySteps.map((step, index) => {
          const stepIndex = WORKFLOW_STEPS.findIndex((s) => s.id === step.id);
          const isCurrent = step.id === currentStep ||
            (currentStep === 'fetching_issues' && step.id === 'series_approval');
          const isCompleted = completedSteps.has(step.id) || stepIndex < currentIndex;
          const isViewing = step.id === viewingStep;
          const canClick = isCompleted && VIEWABLE_STEPS.has(step.id);

          return (
            <div key={step.id} className="step-wrapper">
              <button
                className={`step-item ${isCurrent ? 'current' : ''} ${isCompleted ? 'completed' : ''} ${isViewing ? 'viewing' : ''} ${canClick ? 'clickable' : ''}`}
                onClick={() => canClick && onStepClick(step.id)}
                disabled={!canClick}
                title={canClick ? `View ${step.label} logs` : step.label}
              >
                <span className="step-number">
                  {isCompleted && !isCurrent ? (
                    <svg viewBox="0 0 24 24" className="check-icon">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="step-label">{step.shortLabel}</span>
              </button>
              {index < displaySteps.length - 1 && (
                <div className={`step-connector ${isCompleted ? 'completed' : ''}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default StepIndicator;
