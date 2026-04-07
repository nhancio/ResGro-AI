import type { MonthlyReporterPreview } from "../shared/models/report";

export function mockMonthlyReporter(
  operatorId: string,
  operatorName: string,
  preRange: string,
  postRange: string,
): MonthlyReporterPreview {
  const summary = `Operator "${operatorName || operatorId}" — Pre (${preRange}) vs Post (${postRange}). Net sales +6.2% post; promo-attributed orders +14%; ad ROAS stable. Demo preview only.`;
  return {
    run_id: `mr_${Date.now()}`,
    summary_text: summary,
    tables: {
      daily_net_sales: {
        columns: ["date", "pre_net", "post_net", "delta_pct"],
        rows: [
          { date: "Mon", pre_net: 4200, post_net: 4510, delta_pct: 7.4 },
          { date: "Tue", pre_net: 3980, post_net: 4120, delta_pct: 3.5 },
          { date: "Wed", pre_net: 4410, post_net: 4680, delta_pct: 6.1 },
        ],
      },
      channel_mix: {
        columns: ["channel", "pre_share_pct", "post_share_pct"],
        rows: [
          { channel: "Organic", pre_share_pct: 62, post_share_pct: 58 },
          { channel: "Ads", pre_share_pct: 22, post_share_pct: 25 },
          { channel: "Promo", pre_share_pct: 16, post_share_pct: 17 },
        ],
      },
    },
  };
}
