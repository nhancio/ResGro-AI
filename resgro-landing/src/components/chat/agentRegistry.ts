import {
  Database,
  BarChart3,
  Megaphone,
  Settings2,
  ClipboardCheck,
  FileText,
  Zap,
  type LucideIcon,
} from "lucide-react";

export interface AgentConfig {
  id: string;
  name: string;
  command: string;
  icon: LucideIcon;
  description: string;
  color: string;
  acceptedFiles: string[];
  uploadRequirements: string[];
  exampleInputs: string[];
  outputType: string[];
  suggestedFollowUps: string[];
}

export const AGENT_REGISTRY: AgentConfig[] = [
  {
    id: "data_agent",
    name: "Data Agent",
    command: "/data",
    icon: Database,
    description:
      "Pull financial reports from DoorDash Merchant Portal. Provide your credentials and date range — the agent logs in and downloads the data automatically.",
    color: "from-sky-500 to-blue-700",
    acceptedFiles: [],
    uploadRequirements: [],
    exampleInputs: [
      "Pull last 3 months of DoorDash data",
      "Download financial report for Q1 2026",
    ],
    outputType: ["Data session ID", "Validated datasets", "Store ID mappings"],
    suggestedFollowUps: [
      "Run a deep dive analysis on this data",
      "Get marketing recommendations",
      "Generate a monthly report",
    ],
  },
  {
    id: "deepdive",
    name: "DeepDive Analysis",
    command: "/deepdive",
    icon: BarChart3,
    description:
      "Analyze 90-day performance data — orders, revenue, promos, ads, and anomalies. Generates a comprehensive report.",
    color: "from-orange-500 to-orange-700",
    acceptedFiles: [".csv", ".zip", ".xlsx"],
    uploadRequirements: [
      "All available DoorDash export ZIPs (financial, sponsored listings, promotions, etc.)",
    ],
    exampleInputs: [
      "90-day DoorDash export ZIP",
      "Financial summary CSV",
      "Ads performance report",
    ],
    outputType: [
      "Performance report (HTML)",
      "Order breakdown analysis",
      "Revenue metrics & trends",
      "Anomaly detection results",
    ],
    suggestedFollowUps: [
      "Get marketing recommendations based on this analysis",
      "Set up new campaigns",
      "Review existing campaigns",
    ],
  },
  {
    id: "marketingreco",
    name: "Marketing Recommendations",
    command: "/marketingreco",
    icon: Megaphone,
    description:
      "Takes the AOV & Profitability tables from DeepDive and builds a campaign plan with ads targeting.",
    color: "from-emerald-600 to-teal-700",
    acceptedFiles: [".csv", ".zip", ".xlsx", ".pdf"],
    uploadRequirements: [
      "slot_aov_table.csv (from DeepDive)",
      "slot_profitability_table.csv (from DeepDive)",
    ],
    exampleInputs: [
      "slot_aov_table.csv downloaded from DeepDive",
      "slot_profitability_table.csv downloaded from DeepDive",
    ],
    outputType: [
      "Campaign plan (Resgro-{StoreID}-${AOV})",
      "Ads table (Resgro-Ads-{StoreID}, profitability > 60%)",
    ],
    suggestedFollowUps: [],
  },
  {
    id: "campaign_setup",
    name: "Campaign Setup",
    command: "/campaigns",
    icon: Settings2,
    description:
      "Set up promotional offers and sponsored listing campaigns in the DoorDash Merchant Portal.",
    color: "from-orange-400 to-emerald-700",
    acceptedFiles: [".csv", ".zip", ".xlsx"],
    uploadRequirements: [
      "Approved marketing plan (from Marketing Reco agent)",
      "Store IDs and portal credentials",
      "Campaign schedule preferences",
    ],
    exampleInputs: [
      "Marketing plan with approved campaigns",
      "Store configuration file",
      "Campaign schedule CSV",
    ],
    outputType: [
      "Campaign setup confirmation",
      "Portal campaign IDs",
      "Scheduled campaign dates",
    ],
    suggestedFollowUps: [
      "Review campaign performance after 7 days",
      "Generate a monthly report",
      "Run another deep dive",
    ],
  },
  {
    id: "campaign_review",
    name: "Campaign Review",
    command: "/review",
    icon: ClipboardCheck,
    description:
      "Review active campaign performance with pre/post metrics. Get recommendations to update, keep, or cancel campaigns.",
    color: "from-amber-500 to-orange-600",
    acceptedFiles: [".csv", ".zip", ".xlsx"],
    uploadRequirements: [
      "Post-campaign performance data (7-day DoorDash export)",
      "Pre-campaign baseline data",
      "Active campaign list",
    ],
    exampleInputs: [
      "7-day post-campaign DoorDash export",
      "Baseline metrics from DeepDive",
      "Active promotions list",
    ],
    outputType: [
      "Campaign review report",
      "Pre/post performance comparison",
      "Recommendations (update/keep/cancel)",
    ],
    suggestedFollowUps: [
      "Update campaigns based on recommendations",
      "Get new marketing recommendations",
      "Generate a monthly report",
    ],
  },
  {
    id: "monthly_reporter",
    name: "Monthly Report",
    command: "/monthlyreport",
    icon: FileText,
    description:
      "Generate consolidated monthly KPI reports with revenue, orders, and campaign performance across platforms.",
    color: "from-violet-500 to-indigo-700",
    acceptedFiles: [".csv", ".xlsx"],
    uploadRequirements: [
      "DoorDash financial data (dd-data.csv)",
      "UberEats data (ue-data.csv)",
      "Marketing campaign CSVs (optional)",
    ],
    exampleInputs: [
      "dd-data.csv (DoorDash monthly export)",
      "ue-data.csv (UberEats monthly export)",
      "MARKETING_promos.csv",
    ],
    outputType: [
      "Monthly KPI Excel report",
      "Platform comparison tables",
      "Revenue & order trends",
    ],
    suggestedFollowUps: [],
  },
  {
    id: "boss",
    name: "Boss Agent (Full Pipeline)",
    command: "/boss",
    icon: Zap,
    description:
      "Runs the complete pipeline: Data → Analysis → Recommendations → Campaign Setup → Review → Monthly Report. One command, full automation.",
    color: "from-red-600 to-amber-500",
    acceptedFiles: [".csv", ".zip", ".xlsx"],
    uploadRequirements: [
      "DoorDash data export (CSV or ZIP)",
      "UberEats data (optional)",
      "Portal credentials for campaign setup (optional)",
    ],
    exampleInputs: [
      "Complete DoorDash 90-day export ZIP",
      "UberEats monthly CSV",
      "Campaign configuration file",
    ],
    outputType: [
      "Full pipeline results",
      "Step-by-step agent status",
      "All agent outputs combined",
    ],
    suggestedFollowUps: [
      "Download all generated reports",
      "Review individual agent outputs",
      "Start a new data session",
    ],
  },
];

export function findAgentByCommand(input: string): AgentConfig | undefined {
  const cmd = input.trim().toLowerCase().split(/\s+/)[0];
  if (!cmd.startsWith("/")) return undefined;
  return AGENT_REGISTRY.find((a) => a.command === cmd);
}

export function searchAgents(query: string): AgentConfig[] {
  const q = query.toLowerCase().replace(/^\//, "");
  if (!q) return AGENT_REGISTRY;
  return AGENT_REGISTRY.filter(
    (a) =>
      a.command.slice(1).includes(q) ||
      a.name.toLowerCase().includes(q) ||
      a.id.includes(q),
  );
}
