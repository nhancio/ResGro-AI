/** Workspace agent identifiers — aligned with ResgroAI/dashboard AgentsPage. */
export type OperatorAgentId =
  | "boss"
  | "data"
  | "deepdive"
  | "marketingreco"
  | "resgro-offers"
  | "resgro-ads"
  | "review"
  | "monthly-reporter";

export type OperatorAgentStatus = "idle" | "running" | "ready" | "legacy";

export interface OperatorAgentCatalogItem {
  id: OperatorAgentId;
  title: string;
  description: string;
  requires: string[];
  produces: string[];
  status: OperatorAgentStatus;
  /** Tailwind gradient direction classes for icon tile (bg-gradient-to-br …). */
  color: string;
}
