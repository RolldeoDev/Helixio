/**
 * StepSidebar Component
 *
 * Vertical sidebar for workflow navigation in the metadata approval modal.
 * Shows steps, sub-steps during initialization, and allows viewing step logs.
 */

import { type StepLogEntry } from '../../contexts/MetadataJobContext';
import { useConfirmModal } from '../ConfirmModal';
import './StepSidebar.css';

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
  icon: string;
}

export const WORKFLOW_STEPS: StepInfo[] = [
  { id: 'options', label: 'Options', icon: '1' },
  { id: 'initializing', label: 'Initialize', icon: '2' },
  { id: 'series_approval', label: 'Series', icon: '3' },
  { id: 'file_review', label: 'Review', icon: '4' },
  { id: 'applying', label: 'Apply', icon: '5' },
  { id: 'complete', label: 'Done', icon: '6' },
];

// Sub-steps for initialization phase
const INIT_SUBSTEPS = [
  { id: 'load', label: 'Load Files', match: 'Loading file' },
  { id: 'parse', label: 'Parse Names', match: 'Parsing' },
  { id: 'group', label: 'Group Series', match: 'Grouped' },
  { id: 'search', label: 'Search', match: 'Searching' },
];

// Steps that can be clicked to view history
const VIEWABLE_STEPS = new Set<StepId>([
  'initializing',
  'series_approval',
  'fetching_issues',
  'file_review',
  'applying',
]);

// Steps that can be navigated back to (not just viewed)
const NAVIGABLE_STEPS = new Set<StepId>(['series_approval']);

interface StepSidebarProps {
  currentStep: StepId;
  viewingStep: StepId | null;
  onStepClick: (step: StepId) => void;
  onNavigateToStep?: (step: StepId, seriesGroupIndex?: number) => void | Promise<void>;
  completedSteps: Set<StepId>;
  stepLogs: Record<string, StepLogEntry[]>;
  initLogs?: StepLogEntry[];
}

export function StepSidebar({
  currentStep,
  viewingStep,
  onStepClick,
  onNavigateToStep,
  completedSteps,
  stepLogs,
  initLogs = [],
}: StepSidebarProps) {
  const confirm = useConfirmModal();

  // Don't show for error state
  if (currentStep === 'error') {
    return null;
  }

  const currentIndex = WORKFLOW_STEPS.findIndex((s) => s.id === currentStep);

  // Filter out fetching_issues as it's shown as part of series_approval
  const displaySteps = WORKFLOW_STEPS.filter((s) => s.id !== 'fetching_issues');

  // Determine init substep status
  const getSubstepStatus = (substep: typeof INIT_SUBSTEPS[0]) => {
    if (currentStep !== 'initializing') {
      return completedSteps.has('initializing') ? 'complete' : 'pending';
    }
    const hasLog = initLogs.some((l) => l.message.includes(substep.match));
    const isLast = initLogs.length > 0 && initLogs[initLogs.length - 1]?.message.includes(substep.match);
    if (hasLog && !isLast) return 'complete';
    if (isLast) return 'active';
    return 'pending';
  };

  // Get log count for a step
  const getLogCount = (stepId: StepId): number => {
    return stepLogs[stepId]?.length || 0;
  };

  return (
    <div className="step-sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Steps</span>
      </div>
      <nav className="step-list">
        {displaySteps.map((step) => {
          const stepIndex = WORKFLOW_STEPS.findIndex((s) => s.id === step.id);
          const isCurrent = step.id === currentStep ||
            (currentStep === 'fetching_issues' && step.id === 'series_approval');
          const isCompleted = completedSteps.has(step.id) || stepIndex < currentIndex;
          const isViewing = step.id === viewingStep;
          const canClick = isCompleted && VIEWABLE_STEPS.has(step.id);
          const logCount = getLogCount(step.id);

          // Check if navigation is possible (going back to a previous step)
          const canNavigate = onNavigateToStep &&
            currentStep === 'file_review' &&
            NAVIGABLE_STEPS.has(step.id) &&
            isCompleted;

          const handleClick = async () => {
            if (canNavigate) {
              // Navigation takes priority - ask for confirmation
              const confirmed = await confirm({
                title: 'Go Back',
                message: 'Go back to series selection? This will allow you to change the series for any group.',
                confirmText: 'Go Back',
                variant: 'warning',
              });
              if (confirmed) {
                onNavigateToStep(step.id);
              }
            } else if (canClick) {
              onStepClick(step.id);
            }
          };

          return (
            <div key={step.id} className="step-group">
              <button
                className={`step-item ${isCurrent ? 'current' : ''} ${isCompleted ? 'completed' : ''} ${isViewing ? 'viewing' : ''} ${canClick || canNavigate ? 'clickable' : ''} ${canNavigate ? 'navigable' : ''}`}
                onClick={handleClick}
                disabled={!canClick && !canNavigate && !isCurrent}
                title={canNavigate ? 'Click to go back to series selection' : canClick ? `View ${step.label} logs` : step.label}
              >
                <span className="step-icon">
                  {isCompleted && !isCurrent ? (
                    <svg viewBox="0 0 24 24" className="check-icon">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                  ) : (
                    step.icon
                  )}
                </span>
                <span className="step-label">{step.label}</span>
                {logCount > 0 && !isCurrent && (
                  <span className="step-log-count">{logCount}</span>
                )}
                {isCurrent && !isCompleted && (
                  <span className="step-active-indicator" />
                )}
              </button>

              {/* Show substeps for initializing step when current */}
              {step.id === 'initializing' && isCurrent && !isCompleted && (
                <div className="substep-list">
                  {INIT_SUBSTEPS.map((substep) => {
                    const status = getSubstepStatus(substep);
                    return (
                      <div
                        key={substep.id}
                        className={`substep-item ${status}`}
                      >
                        <span className="substep-icon">
                          {status === 'complete' ? '✓' : status === 'active' ? '●' : '○'}
                        </span>
                        <span className="substep-label">{substep.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Show fetching indicator after series approval */}
              {step.id === 'series_approval' && currentStep === 'fetching_issues' && (
                <div className="substep-list">
                  <div className="substep-item active">
                    <span className="substep-icon spinner-tiny" />
                    <span className="substep-label">Fetching Issues...</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

export default StepSidebar;
