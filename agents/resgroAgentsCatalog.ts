import type { OperatorAgentCatalogItem } from "./shared/models/operator";

/** Operator workspace agent grid for ResGro-AI app contracts/UI. */
export const OPERATOR_AGENT_CATALOG: OperatorAgentCatalogItem[] = [
  {
    id: "boss",
    title: "Boss agent",
    description:
      "Runs the full pipeline in order: Data (already in session) → Analysis → Recommendations → Marketer offers → Marketer ads → Campaign review → Monthly reporter. Requires a ready session_id from the Data agent.",
    status: "ready",
    color: "from-red-600 to-amber-500",
    requires: [
      "session_id (from Data Agent)",
      "Optional: DoorDash credentials for Offers/Ads automation",
      "Optional: pre/post date ranges for Monthly Reporter",
    ],
    produces: [
      "Full pipeline results — each agent output stored in the session",
      "Step-by-step status: completed, failed, skipped per agent",
      "All artifacts accessible via session_id",
    ],
  },
  {
    id: "data",
    title: "Data agent",
    description:
      "Ingests standard CSV or zip exports, validates & normalizes data, and stores a shared session in cloud-facing storage. Manual: set time range and upload files. Autopilot: DoorDash (and optional Uber) portal credentials to download. Downstream agents consume this session_id.",
    status: "ready",
    color: "from-sky-500 to-blue-700",
    requires: [
      "operator_id (Resgro registry)",
      "Manual: DoorDash export ZIPs or CSVs",
      "Autopilot: DoorDash login credentials for auto-download",
    ],
    produces: [
      "session_id — shared reference for all downstream agents",
      "Validated & classified datasets (financial, marketing, sales, ops)",
      "Store ID mappings (DoorDash ↔ National)",
    ],
  },
  {
    id: "deepdive",
    title: "Analysis agent",
    description: "Ingest and analyze platform exports (e.g. 90-day window); output structured report. Prefer running after the Data agent so all agents share one session.",
    status: "idle",
    color: "from-orange-500 to-orange-700",
    requires: [
      "operator_id (Resgro registry)",
      "DoorDash exports: financial, sponsored listings, promotions",
      "Optional: date_range (defaults to last 90 days)",
    ],
    produces: [
      "deepdive.json — order_breakdown, revenue_metrics",
      "top_items, promo_performance, ads_performance",
      "anomalies[], recommendations_seed for downstream LLM",
    ],
  },
  {
    id: "marketingreco",
    title: "Recommendation agent",
    description: "Generate campaign plans from insights; approval workflow.",
    status: "ready",
    color: "from-neutral-700 to-black",
    requires: [
      "deepdive_report (JSON from DeepDive)",
      "operator_profile — stores, region, tier",
      "budget_cap, campaign_history (optional)",
    ],
    produces: [
      "marketing_plan.json — recommended_campaigns[]",
      "Per campaign: type, budget, day-parts, discount_pct, rationale",
      "approval_status: pending | approved | rejected | modified",
    ],
  },
  {
    id: "resgro-offers",
    title: "Marketer offers agent",
    description: "Browser automation for promo campaigns in Merchant Portal.",
    status: "ready",
    color: "from-orange-400 to-emerald-700",
    requires: [
      "Approved marketing_plan (promo / combo rows)",
      "campaign_type: offers",
      "store_ids, Merchant Portal credentials (secrets)",
    ],
    produces: [
      "setup.json — campaigns_created[] with portal campaign_id",
      "status: active | scheduled | failed per campaign",
      "review_scheduled_at (e.g. +7 days)",
    ],
  },
  {
    id: "resgro-ads",
    title: "Marketer ads agent",
    description: "Sponsored listing setup and scheduling.",
    status: "ready",
    color: "from-orange-500 to-slate-800",
    requires: [
      "Approved marketing_plan (sponsored_listing rows)",
      "campaign_type: ads",
      "store_ids, Merchant Portal credentials (secrets)",
    ],
    produces: [
      "setup.json — campaigns_created[] (sponsored listings)",
      "scheduled_start / scheduled_end per campaign",
      "review_scheduled_at for /marketingperf",
    ],
  },
  {
    id: "review",
    title: "Campaign review agent",
    description: "Post-campaign metrics and /update /delete /keep /new.",
    status: "ready",
    color: "from-amber-500 to-orange-600",
    requires: [
      "active_campaigns (ResgroAI setup output)",
      "post_campaign_data — 7-day DoorDash export",
      "pre_campaign_baseline (DeepDive or prior metrics)",
    ],
    produces: [
      "campaign_review.json — per-campaign pre/post metrics",
      "recommendation: /update | /delete | /new | /keep",
      "next_review_date, optional update_params",
    ],
  },
  {
    id: "monthly-reporter",
    title: "Monthly reporter agent",
    description: "Consolidated monthly KPI rollup and narrative for operators and stakeholders.",
    status: "idle",
    color: "from-violet-500 to-indigo-700",
    requires: [
      "Pre/Post date ranges (MM/DD/YYYY-MM/DD/YYYY), operator ID & name",
      "dd-data.csv, ue-data.csv; optional MARKETING_*.csv (multi-upload, Streamlit-style)",
      "Optional: exclude dates, DD/UE store ID filters",
    ],
    produces: [
      "Full Excel export + optional date-wise Excel (in-app download)",
      "Preview tables in dashboard; artifacts under data/runs/monthly_reporter/",
      "Google Drive upload when service-account JSON is configured",
    ],
  },
];
