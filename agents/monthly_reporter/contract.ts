import type { OperatorAgentCatalogItem } from "../shared/models/operator";

export const MONTHLY_REPORTER_AGENT_ID = "monthly-reporter" as const;

export const monthlyReporterCatalogEntry: OperatorAgentCatalogItem = {
  id: "monthly-reporter",
  title: "Monthly reporting",
  description:
    "Consolidated monthly KPI rollup and narrative for operators; matches multi-file CSV workflow (DD / UE / marketing).",
  requires: [
    "Pre/Post date ranges (MM/DD/YYYY-MM/DD/YYYY), operator ID & name",
    "dd-data.csv, ue-data.csv; optional MARKETING_*.csv (multi-upload)",
    "Optional: exclude dates, DD/UE store ID filters",
  ],
  produces: [
    "Excel export + optional date-wise workbook",
    "Preview tables in app; run artifacts for audit",
    "Optional cloud upload when service account is configured server-side",
  ],
};
