/** Aligned with campaign types in the TODC-style pipeline (marketing plan → portal setup). */

export type CampaignKind = "promo" | "combo" | "sponsored_listing";

export interface RecommendedCampaign {
  campaign_type: CampaignKind;
  campaign_name: string;
  budget: number;
  start_date: string;
  duration_days: number;
  target_day_parts: string[];
  target_items: string[];
  discount_pct: number;
  rationale: string;
}

export interface MarketingPlan {
  operator_id: string;
  plan_date: string;
  recommended_campaigns: RecommendedCampaign[];
  approval_status: "pending" | "approved" | "rejected" | "modified";
  approver_notes: string;
}

export interface CreatedCampaign {
  campaign_id: string;
  campaign_name: string;
  campaign_type: string;
  status: "active" | "scheduled" | "failed";
  scheduled_start: string;
  scheduled_end: string;
  error: string | null;
}

export interface CampaignSetupResult {
  operator_id: string;
  setup_date: string;
  campaigns_created: CreatedCampaign[];
  setup_summary: string;
  review_scheduled_at: string;
}
