/** Maps to ResgroAI — Offers (`campaign_type: "offers"` + promo/combo rows). */
export const OFFERS_FLOW_AGENT_ID = "resgro-offers" as const;

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
