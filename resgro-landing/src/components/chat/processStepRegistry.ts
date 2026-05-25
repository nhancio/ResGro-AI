import type { ProcessState } from "./processTypes";

interface AgentStepTemplate {
  id: string;
  label: string;
  description?: string;
}

export const AGENT_STEP_TEMPLATES: Record<string, AgentStepTemplate[]> = {
  data_agent_upload: [
    { id: "upload", label: "Uploading files" },
    { id: "validate", label: "Validating datasets" },
  ],
  data_agent_autopilot: [
    { id: "login", label: "Logging in to DoorDash Portal" },
    { id: "navigate", label: "Navigating to reports" },
    { id: "download", label: "Downloading financial reports" },
    { id: "validate", label: "Validating datasets" },
  ],
  deepdive: [
    { id: "upload", label: "Uploading files" },
    { id: "parse", label: "Parsing CSV data" },
    { id: "analyze", label: "Running DeepDive analysis" },
    { id: "report", label: "Generating report" },
    { id: "summarize", label: "Creating AI summary" },
  ],
  marketingreco: [
    { id: "upload", label: "Uploading files" },
    { id: "analyze", label: "Loading analysis data" },
    { id: "plan", label: "Building campaign plan" },
    { id: "ads", label: "Generating ads table" },
    { id: "summarize", label: "Creating AI summary" },
  ],
  campaign_setup: [
    { id: "upload", label: "Uploading campaign plan" },
    { id: "session", label: "Creating data session" },
    { id: "run", label: "Running campaign setup" },
    { id: "offers", label: "Creating promo offers" },
    { id: "ads", label: "Setting up sponsored listings" },
    { id: "summarize", label: "Creating AI summary" },
  ],
  campaign_review: [
    { id: "upload", label: "Uploading marketing data" },
    { id: "load", label: "Loading campaign data" },
    { id: "compare", label: "Comparing pre/post metrics" },
    { id: "recommend", label: "Generating recommendations" },
    { id: "summarize", label: "Creating AI summary" },
  ],
  monthly_reporter: [
    { id: "upload", label: "Uploading report files" },
    { id: "merge", label: "Merging platform data" },
    { id: "kpis", label: "Calculating KPIs" },
    { id: "excel", label: "Generating Excel report" },
    { id: "summarize", label: "Creating AI summary" },
  ],
  boss: [
    { id: "upload", label: "Uploading data files" },
    {
      id: "deepdive",
      label: "DeepDive Analysis",
      description: "Analyzing 90-day performance data",
    },
    {
      id: "marketingreco",
      label: "Marketing Recommendations",
      description: "Building campaign plan",
    },
    {
      id: "campaign_setup",
      label: "Campaign Setup",
      description: "Creating offers & ads in portal",
    },
    {
      id: "review",
      label: "Campaign Review",
      description: "Comparing performance metrics",
    },
    {
      id: "report",
      label: "Monthly Report",
      description: "Generating KPI report",
    },
  ],
};

export function createProcessState(
  agentId: string,
): ProcessState | undefined {
  const templates = AGENT_STEP_TEMPLATES[agentId];
  if (!templates) return undefined;
  return {
    agentId,
    steps: templates.map((t) => ({
      id: t.id,
      label: t.label,
      description: t.description,
      status: "pending" as const,
    })),
    currentStepIndex: -1,
    overallStatus: "running",
  };
}

export function advanceStep(
  state: ProcessState,
  stepId: string,
): ProcessState {
  const steps = state.steps.map((s) => {
    if (s.id === stepId) {
      return { ...s, status: "running" as const, startedAt: Date.now() };
    }
    if (s.status === "running") {
      return { ...s, status: "success" as const, completedAt: Date.now() };
    }
    return s;
  });
  const currentStepIndex = steps.findIndex((s) => s.id === stepId);
  return { ...state, steps, currentStepIndex };
}

export function completeStep(
  state: ProcessState,
  stepId: string,
): ProcessState {
  const steps = state.steps.map((s) =>
    s.id === stepId
      ? { ...s, status: "success" as const, completedAt: Date.now() }
      : s,
  );
  return { ...state, steps };
}

export function failStep(
  state: ProcessState,
  stepId: string,
  error: string,
): ProcessState {
  let failed = false;
  const steps = state.steps.map((s) => {
    if (s.id === stepId) {
      failed = true;
      return {
        ...s,
        status: "failed" as const,
        error,
        completedAt: Date.now(),
      };
    }
    if (failed && s.status === "pending") {
      return { ...s, status: "skipped" as const };
    }
    return s;
  });
  return { ...state, steps, overallStatus: "failed" };
}

export function completeAll(state: ProcessState): ProcessState {
  const steps = state.steps.map((s) =>
    s.status === "running" || s.status === "pending"
      ? { ...s, status: "success" as const, completedAt: Date.now() }
      : s,
  );
  return { ...state, steps, overallStatus: "completed" };
}
