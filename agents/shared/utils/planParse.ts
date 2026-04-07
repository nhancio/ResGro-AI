import type { MarketingPlan } from "../models/campaign";
import { isoNow } from "./iso";

export function parseMarketingPlanJson(raw: string, operatorId: string): MarketingPlan | null {
  try {
    const o = JSON.parse(raw) as MarketingPlan;
    if (!o || typeof o !== "object") return null;
    if (!Array.isArray(o.recommended_campaigns)) return null;
    return {
      operator_id: o.operator_id || operatorId,
      plan_date: o.plan_date || isoNow(),
      recommended_campaigns: o.recommended_campaigns,
      approval_status: o.approval_status || "approved",
      approver_notes: o.approver_notes || "",
    };
  } catch {
    return null;
  }
}
