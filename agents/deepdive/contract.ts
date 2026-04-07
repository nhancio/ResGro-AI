import type { OperatorAgentCatalogItem } from "../shared/models/operator";

/** Agent id and I/O contract (dashboard + future API runs). */
export const DEEPDIVE_AGENT_ID = "deepdive" as const;

export const deepDiveCatalogEntry: OperatorAgentCatalogItem = {
  id: "deepdive",
  title: "Deep Dive",
  description:
    "Ingest and analyze ~90-day delivery export data; emit structured metrics, anomalies, and a seed narrative for downstream planning.",
  requires: [
    "operator_id (workspace registry)",
    "DoorDash exports: financial, sponsored listings, promotions (zip bundles)",
    "Optional: date_range (defaults to last 90 days)",
  ],
  produces: [
    "deepdive.json — order_breakdown, revenue_metrics",
    "top_items, promo_performance, ads_performance",
    "anomalies[], recommendations_seed for planning agents",
  ],
};
