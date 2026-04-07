/** Workspace agent identifiers (maps to dashboard routes / run types). */
export type OperatorAgentId = "deepdive" | "promo-setup" | "ads-setup" | "monthly-reporter";

export interface OperatorAgentCatalogItem {
  id: OperatorAgentId;
  title: string;
  description: string;
  requires: string[];
  produces: string[];
}
