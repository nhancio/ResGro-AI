/** Maps to ResgroAI — Ads (`campaign_type: "ads"` + sponsored_listing rows). */
export const ADS_FLOW_AGENT_ID = "resgro-ads" as const;

export const SAMPLE_MARKETING_PLAN_ADS_JSON = `{
  "operator_id": "demo_operator",
  "plan_date": "2026-04-01T00:00:00.000Z",
  "approval_status": "approved",
  "approver_notes": "Approved for sponsored listing push (sample).",
  "recommended_campaigns": [
    {
      "campaign_type": "sponsored_listing",
      "campaign_name": "Dinner radius SL",
      "budget": 1200,
      "start_date": "2026-04-06",
      "duration_days": 10,
      "target_day_parts": ["dinner"],
      "target_items": [],
      "discount_pct": 0,
      "rationale": "Recover dinner share per monthly rollup."
    }
  ]
}`;
