/**
 * Step Logs Hook
 *
 * Manages step-based logging for metadata job workflows.
 */

import { useState, useCallback } from 'react';

// =============================================================================
// Types
// =============================================================================

export type JobStep =
  | 'options'
  | 'initializing'
  | 'series_approval'
  | 'fetching_issues'
  | 'file_review'
  | 'applying'
  | 'complete'
  | 'error';

export interface StepLogEntry {
  timestamp: string;
  message: string;
  detail?: string;
  type?: 'info' | 'success' | 'warning' | 'error';
}

export type StepLogs = Record<JobStep, StepLogEntry[]>;

export interface JobLogEntry {
  timestamp: string;
  message: string;
  detail?: string;
  type?: 'info' | 'success' | 'warning' | 'error';
}

// =============================================================================
// Helper Functions
// =============================================================================

export function createEmptyStepLogs(): StepLogs {
  return {
    options: [],
    initializing: [],
    series_approval: [],
    fetching_issues: [],
    file_review: [],
    applying: [],
    complete: [],
    error: [],
  };
}

export function convertDbLogsToStepLogs(logs: Record<string, JobLogEntry[]>): StepLogs {
  const stepLogs = createEmptyStepLogs();
  for (const [step, entries] of Object.entries(logs)) {
    if (step in stepLogs) {
      stepLogs[step as JobStep] = entries.map((e) => ({
        timestamp: e.timestamp,
        message: e.message,
        detail: e.detail,
        type: e.type,
      }));
    }
  }
  return stepLogs;
}

export function getCompletedStepsFromStatus(status: JobStep): Set<JobStep> {
  const steps: JobStep[] = ['options', 'initializing', 'series_approval', 'file_review', 'applying', 'complete'];
  const currentIndex = steps.indexOf(status);
  if (currentIndex <= 0) return new Set();
  return new Set(steps.slice(0, currentIndex));
}

// =============================================================================
// Hook
// =============================================================================

export interface UseStepLogsReturn {
  stepLogs: StepLogs;
  completedSteps: Set<JobStep>;
  addStepLog: (step: JobStep, log: Omit<StepLogEntry, 'timestamp'>) => void;
  markStepCompleted: (step: JobStep) => void;
  setStepLogs: React.Dispatch<React.SetStateAction<StepLogs>>;
  setCompletedSteps: React.Dispatch<React.SetStateAction<Set<JobStep>>>;
  resetLogs: () => void;
}

export function useStepLogs(): UseStepLogsReturn {
  const [stepLogs, setStepLogs] = useState<StepLogs>(createEmptyStepLogs);
  const [completedSteps, setCompletedSteps] = useState<Set<JobStep>>(new Set());

  const addStepLog = useCallback((targetStep: JobStep, log: Omit<StepLogEntry, 'timestamp'>) => {
    const entry: StepLogEntry = {
      ...log,
      timestamp: new Date().toISOString(),
    };
    setStepLogs((prev) => ({
      ...prev,
      [targetStep]: [...prev[targetStep], entry],
    }));
  }, []);

  const markStepCompleted = useCallback((targetStep: JobStep) => {
    setCompletedSteps((prev) => new Set([...prev, targetStep]));
  }, []);

  const resetLogs = useCallback(() => {
    setStepLogs(createEmptyStepLogs());
    setCompletedSteps(new Set());
  }, []);

  return {
    stepLogs,
    completedSteps,
    addStepLog,
    markStepCompleted,
    setStepLogs,
    setCompletedSteps,
    resetLogs,
  };
}
