import type { OperatorAgentCatalogItem } from "../shared/models/operator";
import { adsFlowCatalogEntry, offersFlowCatalogEntry } from "../campaign_setup";
import { deepDiveCatalogEntry } from "../deepdive";
import { monthlyReporterCatalogEntry } from "../monthly_reporter";

/**
 * Ordered agent registry (same idea as dashboard Agents grid + API route table).
 * Add new agents by exporting a catalog entry from `agents/<name>/contract.ts` and appending here.
 */
export const OPERATOR_AGENT_CATALOG: OperatorAgentCatalogItem[] = [
  deepDiveCatalogEntry,
  offersFlowCatalogEntry,
  adsFlowCatalogEntry,
  monthlyReporterCatalogEntry,
];
