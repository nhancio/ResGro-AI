import type { CreatedCampaign, CampaignSetupResult } from "../shared/models/campaign";
import { isoNow } from "../shared/utils/iso";

export function mockCampaignSetup(
  operatorId: string,
  mode: "promo-setup" | "ads-setup",
  storeIds: string[],
): CampaignSetupResult {
  const isPromo = mode === "promo-setup";
  const created: CreatedCampaign[] = [
    {
      campaign_id: isPromo ? "portal_promo_001" : "portal_sl_001",
      campaign_name: isPromo ? "Lunch combo ladder" : "Sponsored dinner radius",
      campaign_type: isPromo ? "promo" : "sponsored_listing",
      status: "scheduled",
      scheduled_start: new Date(Date.now() + 86400000).toISOString(),
      scheduled_end: new Date(Date.now() + 8 * 86400000).toISOString(),
      error: null,
    },
  ];
  return {
    operator_id: operatorId,
    setup_date: isoNow(),
    campaigns_created: created,
    setup_summary: `Prepared ${created.length} campaign(s) for stores [${storeIds.join(", ") || "—"}] via ${isPromo ? "offers" : "ads"} flow (demo).`,
    review_scheduled_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  };
}
