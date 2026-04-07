import type { DeepDiveReport } from "../shared/models/report";
import { isoNow } from "../shared/utils/iso";

/** Demo output; replace with API / worker result. */
export function mockDeepDiveReport(operatorId: string): DeepDiveReport {
  return {
    operator_id: operatorId,
    analysis_date: isoNow(),
    order_breakdown: {
      organic: 1240,
      ads_only: 318,
      promo_only: 156,
      combo: 89,
      cancelled_refund: 12,
    },
    revenue_metrics: {
      total_net_revenue: 48230.5,
      avg_order_value: 28.4,
      aov_by_day_part: { breakfast: 22.1, lunch: 26.8, dinner: 31.2, late_night: 24.0 },
    },
    top_items: [
      { item_name: "Combo A", orders: 420, net_revenue: 9800 },
      { item_name: "Signature bowl", orders: 310, net_revenue: 7420 },
    ],
    promo_performance: [{ promo_id: "PROMO-01", redemptions: 890, incremental_orders_est: 120 }],
    ads_performance: [{ campaign: "SL-Brand", spend: 1200, attributed_orders: 210 }],
    anomalies: ["Mid-week lunch AOV dipped 12% vs prior month", "Promo redemption spike on 2nd weekend"],
    recommendations_seed:
      "Lean into dinner day-part bundles; test tighter ad radius on underperforming stores; refresh promo ladder for top 3 SKUs.",
  };
}
