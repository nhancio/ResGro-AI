/** Report envelopes — DeepDive + monthly preview (same role as shared/models/report.py). */

export interface OrderBreakdown {
  organic: number;
  ads_only: number;
  promo_only: number;
  combo: number;
  cancelled_refund: number;
}

export interface RevenueMetrics {
  total_net_revenue: number;
  avg_order_value: number;
  aov_by_day_part: Record<string, number>;
}

export interface DeepDiveReport {
  operator_id: string;
  analysis_date: string;
  order_breakdown: OrderBreakdown;
  revenue_metrics: RevenueMetrics;
  top_items: Array<Record<string, unknown>>;
  promo_performance: Array<Record<string, unknown>>;
  ads_performance: Array<Record<string, unknown>>;
  anomalies: string[];
  recommendations_seed: string;
}

export type TablePreview = { columns: string[]; rows: Record<string, unknown>[] };

export interface MonthlyReporterPreview {
  run_id: string;
  summary_text: string;
  tables: Record<string, TablePreview>;
}
