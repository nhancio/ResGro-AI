import type { OperatorAgentCatalogItem } from "../shared/models/operator";

/** Maps to `campaign_type: "offers"` + promo/combo rows (portal automation path). */
export const OFFERS_FLOW_AGENT_ID = "promo-setup" as const;

export const offersFlowCatalogEntry: OperatorAgentCatalogItem = {
  id: "promo-setup",
  title: "Promo campaigns (portal)",
  description:
    "Browser automation path for promo / combo campaigns in the merchant portal after a plan is approved.",
  requires: [
    "Approved marketing_plan (promo / combo rows)",
    "campaign_type: offers",
    "store_ids, merchant portal credentials (secrets — never stored in-browser)",
  ],
  produces: [
    "setup.json — campaigns_created[] with portal campaign_id",
    "status: active | scheduled | failed per campaign",
    "review_scheduled_at (e.g. +7 days)",
  ],
};

export const SAMPLE_MARKETING_PLAN_JSON = `{
  "operator_id": "demo_operator",
  "plan_date": "2026-04-01T00:00:00.000Z",
  "approval_status": "approved",
  "approver_notes": "Approved for portal execution (sample).",
  "recommended_campaigns": [
    {
      "campaign_type": "promo",
      "campaign_name": "Lunch ladder",
      "budget": 800,
      "start_date": "2026-04-05",
      "duration_days": 14,
      "target_day_parts": ["lunch"],
      "target_items": ["Combo A"],
      "discount_pct": 15,
      "rationale": "Lift lunch AOV from Deep Dive anomaly window."
    }
  ]
}`;
