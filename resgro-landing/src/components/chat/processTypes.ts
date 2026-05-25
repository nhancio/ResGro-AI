export type ProcessStepStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "skipped";

export interface ProcessStep {
  id: string;
  label: string;
  description?: string;
  status: ProcessStepStatus;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface ProcessState {
  agentId: string;
  steps: ProcessStep[];
  currentStepIndex: number;
  overallStatus: "running" | "completed" | "failed";
}
