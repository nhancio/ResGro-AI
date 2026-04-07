import type { OperatorAgentId } from "../shared/models/operator";

/** Hook for multi-step chains (e.g. DeepDive → marketing plan → campaign_setup). */
export type AgentPipelineStage = OperatorAgentId;

export interface AgentChainContext {
  operatorId: string;
  /** Artifact keys produced by prior stages — extend when wiring a real orchestrator. */
  artifacts: Partial<Record<string, unknown>>;
}
