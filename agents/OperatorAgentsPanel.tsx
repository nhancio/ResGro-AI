import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@resgro-app/components/ui/button";
import { Input } from "@resgro-app/components/ui/input";
import { Textarea } from "@resgro-app/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@resgro-app/components/ui/table";
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  Crown,
  Database,
  Download,
  ExternalLink,
  Loader2,
  Maximize2,
  Play,
  ShoppingBag,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import {
  SAMPLE_MARKETING_PLAN_ADS_JSON,
  SAMPLE_MARKETING_PLAN_JSON,
} from "./campaign_setup";
import { buildResgroStyleDeepDiveHtml } from "./deepdive/resgroStyleReportHtml";
import { OPERATOR_AGENT_CATALOG } from "./orchestrator/registry";
import type { OperatorAgentId, OperatorAgentStatus } from "./shared/models/operator";
import type { DeepDiveReport, MonthlyReporterPreview } from "./shared/models/report";
import { API_BASE, resolveAgentsApiUrl } from "@resgro-app/lib/agentsApi";

function isDeepDiveReportPayload(v: unknown): v is DeepDiveReport {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.operator_id === "string" &&
    o.revenue_metrics != null &&
    typeof o.revenue_metrics === "object" &&
    o.order_breakdown != null &&
    typeof o.order_breakdown === "object"
  );
}

const RUNNABLE: ReadonlySet<OperatorAgentId> = new Set([
  "boss",
  "data",
  "deepdive",
  "marketingreco",
  "resgro-offers",
  "resgro-ads",
  "review",
  "monthly-reporter",
]);

const DEEPDIVE_RUN_DESCRIPTION =
  "Upload DoorDash export zips. For full revenue, payout, and order KPIs, include the **Financial** report zip (contains `FINANCIAL_DETAILED_TRANSACTIONS_*.csv`). You can add Marketing, Sales, and Operations zips in the same run. Without the Financial export, some KPIs are estimated from Sales totals only.";
const DEEPDIVE_ZIP_HELPER =
  "Required for net payout & commission: a zip with FINANCIAL_DETAILED (often named `financial_*.zip` from the portal). Add marketing / SALES_ / operations zips for the rest of the report.";
const MRK_MANUAL_HELPER =
  "Upload FINANCIAL_DETAILED export as .zip (preferred) or .csv. The API builds combined analysis and campaign recommendations.";
const MRK_AUTO_HELPER =
  "Fetches reporting data via Merchant Portal automation (same as Marketer flows). Requires DoorDash credentials. UberEats credentials are optional.";
const REVIEW_MANUAL_HELPER =
  "Upload MARKETING_PROMOTION* / MARKETING_SPONSORED_LISTING* exports (.csv or .zip). Matches the API manual mode.";
const REVIEW_AUTO_HELPER =
  "Loads marketing datasets from the server data tree for this operator (default paths under data/). Optional: set a custom data_dir if your layout differs.";

function formatMdY(d: Date) {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function defaultMonthlyReporterRanges() {
  const today = new Date();
  const postEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  const postStart = new Date(postEnd.getFullYear(), postEnd.getMonth(), 1);
  const preEnd = new Date(postStart);
  preEnd.setDate(0);
  const preStart = new Date(preEnd.getFullYear(), preEnd.getMonth(), 1);
  return {
    pre: `${formatMdY(preStart)}-${formatMdY(preEnd)}`,
    post: `${formatMdY(postStart)}-${formatMdY(postEnd)}`,
  };
}

function campaignsToPreview(campaigns: unknown): { columns: string[]; rows: Record<string, unknown>[] } {
  if (!Array.isArray(campaigns) || campaigns.length === 0) return { columns: [], rows: [] };
  const first = campaigns[0];
  if (!first || typeof first !== "object") return { columns: [], rows: [] };
  const columns = Object.keys(first as object).slice(0, 16);
  return { columns, rows: campaigns as Record<string, unknown>[] };
}

/** Flatten campaign review items for a readable table (avoid nested JSON in cells). */
function campaignReviewPreviewRows(reviews: unknown): { columns: string[]; rows: Record<string, unknown>[] } {
  if (!Array.isArray(reviews) || reviews.length === 0) return { columns: [], rows: [] };
  const rows: Record<string, unknown>[] = [];
  for (const raw of reviews) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    rows.push({
      campaign_name: r.campaign_name ?? "—",
      recommendation: r.recommendation ?? "—",
      aov_lift_pct: r.aov_lift_pct ?? "—",
      order_volume_lift_pct: r.order_volume_lift_pct ?? "—",
      net_revenue_delta: r.net_revenue_delta ?? "—",
      rationale:
        typeof r.rationale === "string" ? (r.rationale.length > 160 ? `${r.rationale.slice(0, 160)}…` : r.rationale) : "—",
    });
  }
  if (!rows.length) return { columns: [], rows: [] };
  return { columns: Object.keys(rows[0]), rows };
}

const MONEY_KEYS = new Set([
  "revenue", "net_revenue", "spend", "cost", "amount", "subtotal", "payout",
  "commission", "net_revenue_delta", "budget", "total_spend", "avg_order_value",
  "price", "discount", "profit", "total_charge", "aov", "gross_revenue",
  "total_net_revenue", "estimated_revenue", "net_payout",
]);
const PCT_KEYS = new Set([
  "aov_lift_pct", "order_volume_lift_pct", "cancel_rate", "conversion_rate",
  "dashpass_rate", "margin", "roas", "ctr", "rate", "pct", "percentage",
  "lift_pct", "growth",
]);

function formatCellValue(key: string, val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  const s = String(val);
  const lk = key.toLowerCase();
  const num = typeof val === "number" ? val : Number(s.replace(/[,$%]/g, ""));

  if (MONEY_KEYS.has(lk) || lk.includes("revenue") || lk.includes("spend") || lk.includes("cost") || lk.includes("payout") || lk.includes("budget") || lk.includes("price")) {
    if (Number.isFinite(num)) {
      const sign = num < 0 ? "-" : "";
      return `${sign}$${Math.abs(num).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  }
  if (PCT_KEYS.has(lk) || lk.includes("_pct") || lk.includes("rate") || lk.includes("lift")) {
    if (Number.isFinite(num)) {
      const sign = num > 0 ? "+" : "";
      return `${sign}${num.toFixed(1)}%`;
    }
  }
  if (Number.isFinite(num) && typeof val === "number" && !lk.includes("id") && !lk.includes("count") && !lk.includes("date")) {
    if (num !== Math.floor(num)) {
      return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return num.toLocaleString();
  }
  return s;
}

function prettyHeader(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b(pct|id)\b/gi, (m) => m.toUpperCase())
    .replace(/\baov\b/gi, "AOV")
    .replace(/\broas\b/gi, "ROAS")
    .replace(/\bctr\b/gi, "CTR")
    .replace(/^./, (c) => c.toUpperCase());
}

function isNumericColumn(key: string): boolean {
  const lk = key.toLowerCase();
  return MONEY_KEYS.has(lk) || PCT_KEYS.has(lk) ||
    lk.includes("revenue") || lk.includes("spend") || lk.includes("cost") ||
    lk.includes("_pct") || lk.includes("rate") || lk.includes("orders") ||
    lk.includes("count") || lk.includes("amount") || lk.includes("lift");
}

function PreviewTable({ title, columns, rows }: { title: string; columns: string[]; rows: Record<string, unknown>[] }) {
  const cols = columns.slice(0, 18);
  if (!cols.length) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-[#FFF9F6] p-4 text-sm text-gray-500">No rows for {title}</div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 bg-[#FFF9F6] px-3 py-2">
        <span className="text-sm font-semibold text-black">{title}</span>
        <span className="text-xs text-gray-500">({rows.length} {rows.length === 1 ? "row" : "rows"})</span>
      </div>
      <div className="max-h-[min(280px,40vh)] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {cols.map((c) => (
                <TableHead key={c} className={`whitespace-nowrap text-xs font-semibold ${isNumericColumn(c) ? "text-right" : ""}`}>
                  {prettyHeader(c)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, ri) => (
              <TableRow key={ri} className="hover:bg-orange-50/40">
                {cols.map((c) => (
                  <TableCell key={c} className={`max-w-[220px] truncate text-xs tabular-nums ${isNumericColumn(c) ? "text-right font-medium" : ""}`}>
                    {formatCellValue(c, row[c])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function TabbedPreviewTables({ tables }: { tables: Record<string, { columns: string[]; rows: Record<string, unknown>[] }> }) {
  const keys = Object.keys(tables);
  const [activeTab, setActiveTab] = useState(keys[0] || "");
  if (!keys.length) return null;
  const t = tables[activeTab];
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {keys.map((k) => (
          <button key={k} type="button" onClick={() => setActiveTab(k)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${activeTab === k ? "bg-[#FF6B35] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {prettyHeader(k.replace(/_/g, " "))}
          </button>
        ))}
      </div>
      {t && <PreviewTable title={activeTab} columns={t.columns} rows={t.rows} />}
    </div>
  );
}

function statusBadgeClass(status: OperatorAgentStatus) {
  if (status === "running") return "bg-amber-100 text-amber-800";
  if (status === "legacy") return "bg-slate-100 text-slate-600";
  return "bg-orange-100 text-gray-900";
}

const agentIcon: Record<
  OperatorAgentId,
  React.ComponentType<{ className?: string; strokeWidth?: number }>
> = {
  boss: Crown,
  data: Database,
  deepdive: BarChart3,
  marketingreco: Sparkles,
  "resgro-offers": ShoppingBag,
  "resgro-ads": Target,
  review: ClipboardCheck,
  "monthly-reporter": CalendarDays,
};

const agentGradient: Record<OperatorAgentId, string> = {
  boss: "linear-gradient(135deg, #dc2626, #f59e0b)",
  data: "linear-gradient(135deg, #0ea5e9, #1d4ed8)",
  deepdive: "linear-gradient(135deg, #f97316, #c2410c)",
  marketingreco: "linear-gradient(135deg, #404040, #000000)",
  "resgro-offers": "linear-gradient(135deg, #fb923c, #047857)",
  "resgro-ads": "linear-gradient(135deg, #f97316, #1e293b)",
  review: "linear-gradient(135deg, #f59e0b, #ea580c)",
  "monthly-reporter": "linear-gradient(135deg, #8b5cf6, #4338ca)",
};

interface SetupResult {
  status: string;
  run_id: string;
  mode: string;
  operator_id: string;
  rows_file?: string;
}

export function OperatorAgentsPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mrkFinancialRef = useRef<HTMLInputElement>(null);
  const reviewMktFilesRef = useRef<HTMLInputElement>(null);
  const ddFileRef = useRef<HTMLInputElement>(null);
  const ueFileRef = useRef<HTMLInputElement>(null);
  const mktFilesRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<OperatorAgentId | null>(null);
  const [loading, setLoading] = useState(false);

  const [opId, setOpId] = useState("SSM");
  const [zipFiles, setZipFiles] = useState<File[]>([]);

  const [planJson, setPlanJson] = useState(SAMPLE_MARKETING_PLAN_JSON);
  const [storeIds, setStoreIds] = useState("101, 102");
  const [ddEmail, setDdEmail] = useState("");
  const [ddPassword, setDdPassword] = useState("");
  const [ueEmail, setUeEmail] = useState("");
  const [uePassword, setUePassword] = useState("");
  const [mrkMode, setMrkMode] = useState<"manual" | "auto">("manual");
  const [reviewMode, setReviewMode] = useState<"manual" | "auto">("auto");
  const [reviewDataDir, setReviewDataDir] = useState("");

  const initialMonthly = useMemo(() => defaultMonthlyReporterRanges(), []);
  const [preRange, setPreRange] = useState(initialMonthly.pre);
  const [postRange, setPostRange] = useState(initialMonthly.post);
  const [opName, setOpName] = useState("");

  const [dataAgentMode, setDataAgentMode] = useState<"manual" | "autopilot">("manual");
  const [dateRangeStr, setDateRangeStr] = useState("");
  const [dataZipFiles, setDataZipFiles] = useState<File[]>([]);
  const [dataCsvFiles, setDataCsvFiles] = useState<File[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [bossSkipSteps, setBossSkipSteps] = useState("");
  const [dataResult, setDataResult] = useState<Record<string, unknown> | null>(null);
  const [bossResult, setBossResult] = useState<Record<string, unknown> | null>(null);
  const [excludedDates, setExcludedDates] = useState("");
  const [ddStores, setDdStores] = useState("");
  const [ueStores, setUeStores] = useState("");

  const [deepResult, setDeepResult] = useState<DeepDiveReport | null>(null);
  const [deepReportHtml, setDeepReportHtml] = useState<string | null>(null);
  const [setupResult, setSetupResult] = useState<SetupResult | null>(null);
  const [monthlyResult, setMonthlyResult] = useState<MonthlyReporterPreview | null>(null);
  const [marketingRecoResult, setMarketingRecoResult] = useState<Record<string, unknown> | null>(null);
  const [campaignReviewResult, setCampaignReviewResult] = useState<Record<string, unknown> | null>(null);
  const [downloads, setDownloads] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [reportFullscreen, setReportFullscreen] = useState(false);

  const deepDiveHtml = useMemo(() => {
    if (deepReportHtml) return deepReportHtml;
    if (!deepResult) return null;
    try {
      return buildResgroStyleDeepDiveHtml(deepResult);
    } catch {
      return null;
    }
  }, [deepResult, deepReportHtml]);

  const openDeepDiveReportInNewTab = useCallback(() => {
    if (!deepDiveHtml) return;
    const blob = new Blob([deepDiveHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (w) {
      setTimeout(() => URL.revokeObjectURL(url), 120_000);
    } else {
      URL.revokeObjectURL(url);
    }
  }, [deepDiveHtml]);

  const abortRef = useRef<AbortController | null>(null);
  const catalog = selected ? OPERATOR_AGENT_CATALOG.find((a) => a.id === selected) ?? null : null;

  useEffect(() => {
    if (selected === "resgro-ads") setPlanJson(SAMPLE_MARKETING_PLAN_ADS_JSON);
    else if (selected === "resgro-offers") setPlanJson(SAMPLE_MARKETING_PLAN_JSON);
  }, [selected]);

  useEffect(() => {
    if (!reportFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setReportFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reportFullscreen]);

  const goBack = () => {
    abortRef.current?.abort();
    setSelected(null);
    setError(null);
    setReportFullscreen(false);
    setMarketingRecoResult(null);
    setCampaignReviewResult(null);
    setDataResult(null);
    setBossResult(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const runAnalysis = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    setDeepResult(null);
    setDeepReportHtml(null);
    setSetupResult(null);
    setMonthlyResult(null);
    setMarketingRecoResult(null);
    setCampaignReviewResult(null);
    setDataResult(null);
    setBossResult(null);
    setDownloads({});

    if (selected === "data") {
      if (!opId.trim()) {
        setError("Enter an Operator ID.");
        return;
      }
      if (dataAgentMode === "manual") {
        if (dataZipFiles.length === 0 && dataCsvFiles.length === 0) {
          setError("Upload at least one .zip or .csv file, or switch to Autopilot.");
          return;
        }
      } else if (!ddEmail.trim() || !ddPassword) {
        setError("Autopilot requires DoorDash email and password (portal download).");
        return;
      }
    }

    if (selected === "boss") {
      if (!sessionId.trim()) {
        setError("Enter a session ID from the Data agent (session must be ready).");
        return;
      }
      if (!preRange.trim() || !postRange.trim()) {
        setError("Enter Pre and Post ranges for the Monthly reporter step (MM/DD/YYYY-MM/DD/YYYY each).");
        return;
      }
      if (!window.confirm("This will run the full pipeline (Data → Analysis → Marketing → Campaigns → Review → Report). This may take several minutes. Continue?")) {
        return;
      }
    }

    if (selected === "deepdive") {
      if (!opId.trim()) { setError("Enter an Operator ID."); return; }
      if (zipFiles.length === 0) { setError("Upload at least one zip export."); return; }
    }

    if (selected === "resgro-offers" || selected === "resgro-ads") {
      if (!ddEmail.trim() || !ddPassword) {
        setError("DoorDash email and password are required for campaign execution.");
        return;
      }
    }

    if (selected === "monthly-reporter") {
      if (!preRange.trim() || !postRange.trim()) {
        setError("Enter Pre and Post date ranges (MM/DD/YYYY-MM/DD/YYYY each).");
        return;
      }
    }

    if (selected === "marketingreco") {
      if (!opId.trim()) {
        setError("Enter an Operator ID.");
        return;
      }
      if (mrkMode === "manual") {
        const f = mrkFinancialRef.current?.files?.[0];
        if (!f) {
          setError("Manual mode requires a FINANCIAL_DETAILED .zip or .csv file.");
          return;
        }
      } else if (!ddEmail.trim() || !ddPassword) {
        setError("Auto mode requires DoorDash email and password.");
        return;
      }
    }

    if (selected === "review") {
      if (!opId.trim()) {
        setError("Enter an Operator ID.");
        return;
      }
      if (reviewMode === "manual") {
        const files = reviewMktFilesRef.current?.files;
        if (!files?.length) {
          setError("Manual mode requires at least one marketing export (.csv or .zip).");
          return;
        }
      }
    }

    setLoading(true);

    try {
      if (selected === "data") {
        const form = new FormData();
        form.append("operator_id", opId.trim());
        form.append("operator_name", opName.trim());
        form.append("date_range", dateRangeStr.trim());
        if (dataAgentMode === "autopilot") {
          form.append("mode", "autopilot");
          form.append("doordash_email", ddEmail.trim());
          form.append("doordash_password", ddPassword);
        } else {
          for (const f of dataZipFiles) form.append("zip_files", f);
          for (const f of dataCsvFiles) form.append("csv_files", f);
        }

        const res = await fetch(`${API_BASE}/sessions`, { method: "POST", body: form });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: res.statusText }));
          throw new Error(err.detail || err.error || `API error ${res.status}`);
        }
        const data = (await res.json()) as Record<string, unknown>;
        setDataResult(data);
        const sid = typeof data.session_id === "string" ? data.session_id : "";
        if (sid) setSessionId(sid);
      } else if (selected === "boss") {
        const form = new FormData();
        form.append("doordash_email", ddEmail.trim());
        form.append("doordash_password", ddPassword);
        form.append("pre_range", preRange.trim());
        form.append("post_range", postRange.trim());
        if (bossSkipSteps.trim()) {
          form.append("skip_steps", bossSkipSteps.trim());
        }

        const res = await fetch(
          `${API_BASE}/sessions/${encodeURIComponent(sessionId.trim())}/run/boss`,
          { method: "POST", body: form },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: res.statusText }));
          throw new Error(err.detail || err.error || `API error ${res.status}`);
        }
        setBossResult((await res.json()) as Record<string, unknown>);
      } else if (selected === "deepdive") {
        const form = new FormData();
        form.append("operator_id", opId.trim());
        for (const f of zipFiles) form.append("zip_files", f);

        const res = await fetch(`${API_BASE}/runs/deepdive`, { method: "POST", body: form });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: res.statusText }));
          throw new Error(err.detail || err.error || `API error ${res.status}`);
        }
        const data = (await res.json()) as {
          report_url?: string;
          deepdive_report?: DeepDiveReport;
          [key: string]: unknown;
        };

        let htmlOk = false;
        if (data.report_url) {
          try {
            const htmlRes = await fetch(resolveAgentsApiUrl(data.report_url));
            if (htmlRes.ok) {
              setDeepReportHtml(await htmlRes.text());
              htmlOk = true;
            }
          } catch {
            /* fall back to client HTML from deepdive_report */
          }
        }

        if (data.deepdive_report && isDeepDiveReportPayload(data.deepdive_report)) {
          setDeepResult(data.deepdive_report);
        } else if (isDeepDiveReportPayload(data)) {
          setDeepResult(data);
        } else {
          setDeepResult(null);
          if (!htmlOk) {
            setError(
              "Could not load the HTML report. Ensure the report URL points to your agents API (relative /api/... must not load from the marketing domain).",
            );
          }
        }

      } else if (selected === "resgro-offers") {
        const form = new FormData();
        form.append("operator_id", opId.trim() || "SSM");
        form.append("mode", "auto");
        form.append("doordash_email", ddEmail.trim());
        form.append("doordash_password", ddPassword);
        if (ueEmail.trim()) form.append("ue_email", ueEmail.trim());
        if (uePassword) form.append("ue_password", uePassword);

        const res = await fetch(`${API_BASE}/runs/offers`, { method: "POST", body: form });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: res.statusText }));
          throw new Error(err.detail || err.error || `API error ${res.status}`);
        }
        setSetupResult(await res.json());

      } else if (selected === "resgro-ads") {
        const form = new FormData();
        form.append("operator_id", opId.trim() || "SSM");
        form.append("mode", "auto");
        form.append("doordash_email", ddEmail.trim());
        form.append("doordash_password", ddPassword);
        if (ueEmail.trim()) form.append("ue_email", ueEmail.trim());
        if (uePassword) form.append("ue_password", uePassword);

        const res = await fetch(`${API_BASE}/runs/ads`, { method: "POST", body: form });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: res.statusText }));
          throw new Error(err.detail || err.error || `API error ${res.status}`);
        }
        setSetupResult(await res.json());

      } else if (selected === "monthly-reporter") {
        const form = new FormData();
        form.append("pre_range", preRange.trim());
        form.append("post_range", postRange.trim());
        form.append("operator_id", opId.trim() || "SSM");
        form.append("operator_name", opName.trim());
        form.append("excluded_dates", excludedDates.trim());
        form.append("dd_store_ids", ddStores.trim());
        form.append("ue_store_ids", ueStores.trim());

        const ddFile = ddFileRef.current?.files?.[0];
        if (ddFile) form.append("dd_file", ddFile);
        const ueFile = ueFileRef.current?.files?.[0];
        if (ueFile) form.append("ue_file", ueFile);
        const mktFiles = mktFilesRef.current?.files;
        if (mktFiles) {
          for (const f of Array.from(mktFiles)) form.append("marketing_files", f);
        }

        const res = await fetch(`${API_BASE}/runs/monthly-reporter`, { method: "POST", body: form });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: res.statusText }));
          throw new Error(err.detail || err.error || `API error ${res.status}`);
        }
        const data = await res.json();
        if (data.preview) {
          setMonthlyResult({
            run_id: data.run_id,
            summary_text: data.summary_text || data.preview.summary_text || "",
            tables: data.preview.tables || {},
          });
        }
        const rawDl = data.downloads as { full?: string | null; date?: string | null } | undefined;
        const dl: Record<string, string> = {};
        if (rawDl?.full) {
          dl.full = resolveAgentsApiUrl(rawDl.full);
        } else if (typeof data.run_id === "string" && data.run_id) {
          dl.full = resolveAgentsApiUrl(`/api/runs/${data.run_id}/download/full`);
        }
        if (rawDl?.date) {
          dl.date = resolveAgentsApiUrl(rawDl.date);
        }
        setDownloads(dl);
      } else if (selected === "marketingreco") {
        const form = new FormData();
        form.append("operator_id", opId.trim());
        form.append("mode", mrkMode);
        if (mrkMode === "manual") {
          const f = mrkFinancialRef.current?.files?.[0]!;
          form.append("financial_file", f);
        } else {
          form.append("doordash_email", ddEmail.trim());
          form.append("doordash_password", ddPassword);
          if (ueEmail.trim()) form.append("ue_email", ueEmail.trim());
          if (uePassword) form.append("ue_password", uePassword);
        }

        const res = await fetch(`${API_BASE}/runs/marketingreco`, { method: "POST", body: form });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: res.statusText }));
          throw new Error(err.detail || err.error || `API error ${res.status}`);
        }
        const data = (await res.json()) as Record<string, unknown>;
        setMarketingRecoResult(data);
        const dl = data.downloads as Record<string, string> | undefined;
        const runId = typeof data.run_id === "string" ? data.run_id : "";
        const campaigns =
          (dl?.campaigns_excel && resolveAgentsApiUrl(dl.campaigns_excel)) ||
          (runId ? resolveAgentsApiUrl(`/api/runs/marketingreco/${runId}/download/campaigns`) : "");
        setDownloads(campaigns ? { campaigns_excel: campaigns } : {});
      } else if (selected === "review") {
        const form = new FormData();
        form.append("operator_id", opId.trim());
        form.append("mode", reviewMode);
        if (reviewDataDir.trim()) {
          form.append("data_dir", reviewDataDir.trim());
        }
        if (reviewMode === "manual") {
          const files = reviewMktFilesRef.current?.files;
          if (files) {
            for (const f of Array.from(files)) {
              form.append("marketing_files", f);
            }
          }
        }

        const res = await fetch(`${API_BASE}/runs/campaign-review`, { method: "POST", body: form });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: res.statusText }));
          throw new Error(err.detail || err.error || `API error ${res.status}`);
        }
        setCampaignReviewResult((await res.json()) as Record<string, unknown>);
        setDownloads({});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed.");
    } finally {
      setLoading(false);
    }
  };

  /* ── Agent detail view (replaces the grid when an agent is selected) ── */
  if (selected && catalog) {
    const Icon = agentIcon[selected] ?? BarChart3;
    const canRun = RUNNABLE.has(selected);

    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          All agents
        </button>

        <div className="flex items-center gap-4">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl text-white"
            style={{ background: agentGradient[selected], boxShadow: "0 4px 14px -2px rgb(0 0 0 / 0.12)" }}
          >
            <Icon className="h-7 w-7" aria-hidden />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{catalog.title}</h2>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(catalog.status)}`}>
              {catalog.status}
            </span>
          </div>
        </div>

        {!canRun ? (
          <div className="rounded-3xl border border-gray-100 bg-white p-6 text-sm text-gray-600 shadow-sm">
            <p className="mt-1">This agent is not enabled in the dashboard UI yet.</p>
          </div>
        ) : (
          <div
            className={
              selected === "deepdive" && deepDiveHtml
                ? "grid gap-6 lg:grid-cols-1"
                : "grid gap-6 lg:grid-cols-2"
            }
          >
            <div className="space-y-4 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <p className="text-sm leading-relaxed text-gray-600">
                {selected === "data"
                  ? "Standardize inputs once: upload CSV/zip (manual) or use Autopilot to pull from the DoorDash merchant portal. You get a session_id every downstream agent can share. For MoM / YoY comparisons, pick ranges your exports actually cover—portal history limits vary (often a few to several months; deep historical runs may need manual files)."
                  : selected === "boss"
                    ? "Runs the full stack in order: Analysis → Recommendations → Offers → Ads → Campaign review → Monthly reporter. The Data step must already be done (ready session). Reuse the same session_id here."
                    : selected === "deepdive"
                  ? DEEPDIVE_RUN_DESCRIPTION
                  : selected === "marketingreco"
                    ? "Generate marketing_plan-style recommendations from FINANCIAL_DETAILED data (manual upload) or auto-fetch via Merchant Portal credentials."
                    : selected === "review"
                      ? "Post-campaign metrics and /update /delete /keep /new recommendations. Auto uses on-disk operator data; manual accepts fresh marketing exports."
                      : catalog.description}
              </p>
              <div className="border-t border-gray-100 pt-5">
                <h4 className="text-sm font-semibold text-black">
                  {selected === "deepdive" ? "Configuration" : "Input"}
                </h4>

                {selected === "data" && (
                  <div className="mt-4 space-y-4">
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Operator ID</span>
                      <Input
                        value={opId}
                        onChange={(e) => setOpId(e.target.value)}
                        className="mt-1 rounded-xl border-gray-200"
                        placeholder="e.g. SSM"
                      />
                    </div>
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Operator / group name (optional)</span>
                      <Input
                        value={opName}
                        onChange={(e) => setOpName(e.target.value)}
                        className="mt-1 rounded-xl border-gray-200"
                      />
                    </div>
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Time period label (optional)</span>
                      <Input
                        value={dateRangeStr}
                        onChange={(e) => setDateRangeStr(e.target.value)}
                        className="mt-1 rounded-xl border-gray-200"
                        placeholder="e.g. 2024-Q4 or Jan–Mar 2025"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Describes what you uploaded; MoM / YoY windows are set in each reporting agent.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant={dataAgentMode === "manual" ? "cta" : "outline"}
                        className="rounded-full"
                        onClick={() => setDataAgentMode("manual")}
                      >
                        Manual (upload)
                      </Button>
                      <Button
                        type="button"
                        variant={dataAgentMode === "autopilot" ? "cta" : "outline"}
                        className="rounded-full"
                        onClick={() => setDataAgentMode("autopilot")}
                      >
                        Autopilot (portal login)
                      </Button>
                    </div>
                    {dataAgentMode === "manual" ? (
                      <div className="space-y-3">
                        <label className="flex flex-col gap-1">
                          <span className="text-sm font-medium text-gray-700">ZIP exports</span>
                          <input
                            type="file"
                            accept=".zip,application/zip"
                            multiple
                            className="block w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#FF6B35]/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-[#FF6B35]"
                            onChange={(e) => setDataZipFiles(Array.from(e.target.files ?? []))}
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-sm font-medium text-gray-700">CSV files</span>
                          <input
                            type="file"
                            accept=".csv,text/csv"
                            multiple
                            className="block w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#FF6B35]/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-[#FF6B35]"
                            onChange={(e) => setDataCsvFiles(Array.from(e.target.files ?? []))}
                          />
                        </label>
                        <p className="text-xs text-gray-500">Upload at least one file. Formats are normalized into the shared session store.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-xs text-gray-500">
                          Uses DoorDash merchant credentials to download reporting data. (Uber Eats auto-download can be added server-side; contact support if needed.)
                        </p>
                        <div>
                          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">DoorDash email</span>
                          <Input
                            value={ddEmail}
                            onChange={(e) => setDdEmail(e.target.value)}
                            className="mt-1 rounded-xl border-gray-200"
                            type="email"
                            autoComplete="off"
                          />
                        </div>
                        <div>
                          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">DoorDash password</span>
                          <Input
                            value={ddPassword}
                            onChange={(e) => setDdPassword(e.target.value)}
                            className="mt-1 rounded-xl border-gray-200"
                            type="password"
                            autoComplete="off"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {selected === "boss" && (
                  <div className="mt-4 space-y-4">
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Session ID</span>
                      <Input
                        value={sessionId}
                        onChange={(e) => setSessionId(e.target.value)}
                        className="mt-1 rounded-xl border-gray-200 font-mono text-xs"
                        placeholder="Paste session_id from Data agent (status must be ready)"
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Pre range (monthly reporter)</span>
                        <Input value={preRange} onChange={(e) => setPreRange(e.target.value)} className="mt-1 rounded-xl border-gray-200" />
                      </div>
                      <div>
                        <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Post range (monthly reporter)</span>
                        <Input value={postRange} onChange={(e) => setPostRange(e.target.value)} className="mt-1 rounded-xl border-gray-200" />
                      </div>
                    </div>
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">DoorDash (offers + ads steps)</span>
                      <p className="mt-1 text-xs text-gray-500">If empty, those steps are skipped. Fill to run browser automation after recommendations.</p>
                    </div>
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">DoorDash email</span>
                      <Input
                        value={ddEmail}
                        onChange={(e) => setDdEmail(e.target.value)}
                        className="mt-1 rounded-xl border-gray-200"
                        type="email"
                      />
                    </div>
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">DoorDash password</span>
                      <Input
                        value={ddPassword}
                        onChange={(e) => setDdPassword(e.target.value)}
                        className="mt-1 rounded-xl border-gray-200"
                        type="password"
                      />
                    </div>
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Skip steps (optional)</span>
                      <Input
                        value={bossSkipSteps}
                        onChange={(e) => setBossSkipSteps(e.target.value)}
                        className="mt-1 rounded-xl border-gray-200 font-mono text-xs"
                        placeholder="Comma-separated: offers,ads"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Step ids: data (already done), deepdive, marketingreco, offers, ads, campaign_review, monthly_reporter
                      </p>
                    </div>
                  </div>
                )}

                {selected === "marketingreco" && (
                  <div className="mt-4 space-y-4">
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Operator ID</span>
                      <Input value={opId} onChange={(e) => setOpId(e.target.value)} className="mt-1 rounded-xl border-gray-200" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant={mrkMode === "manual" ? "cta" : "outline"}
                        className="rounded-full"
                        onClick={() => setMrkMode("manual")}
                      >
                        Manual (file)
                      </Button>
                      <Button
                        type="button"
                        variant={mrkMode === "auto" ? "cta" : "outline"}
                        className="rounded-full"
                        onClick={() => setMrkMode("auto")}
                      >
                        Auto (merchant login)
                      </Button>
                    </div>
                    {mrkMode === "manual" ? (
                      <label className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-gray-700">FINANCIAL_DETAILED (.zip or .csv)</span>
                        <input
                          ref={mrkFinancialRef}
                          type="file"
                          accept=".zip,.csv,application/zip,text/csv"
                          className="block w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#FF6B35]/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-[#FF6B35]"
                        />
                        <span className="text-xs text-gray-500">{MRK_MANUAL_HELPER}</span>
                      </label>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-xs text-gray-500">{MRK_AUTO_HELPER}</p>
                        <div>
                          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">DoorDash Email</span>
                          <Input
                            value={ddEmail}
                            onChange={(e) => setDdEmail(e.target.value)}
                            className="mt-1 rounded-xl border-gray-200"
                            type="email"
                            placeholder="merchant@example.com"
                          />
                        </div>
                        <div>
                          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">DoorDash Password</span>
                          <Input
                            value={ddPassword}
                            onChange={(e) => setDdPassword(e.target.value)}
                            className="mt-1 rounded-xl border-gray-200"
                            type="password"
                          />
                        </div>
                        <div className="mt-2 border-t border-gray-100 pt-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">UberEats credentials (optional)</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">UberEats Email</span>
                          <Input
                            value={ueEmail}
                            onChange={(e) => setUeEmail(e.target.value)}
                            className="mt-1 rounded-xl border-gray-200"
                            type="email"
                            placeholder="merchant@example.com"
                          />
                        </div>
                        <div>
                          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">UberEats Password</span>
                          <Input
                            value={uePassword}
                            onChange={(e) => setUePassword(e.target.value)}
                            className="mt-1 rounded-xl border-gray-200"
                            type="password"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {selected === "review" && (
                  <div className="mt-4 space-y-4">
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Operator ID</span>
                      <Input value={opId} onChange={(e) => setOpId(e.target.value)} className="mt-1 rounded-xl border-gray-200" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant={reviewMode === "auto" ? "cta" : "outline"}
                        className="rounded-full"
                        onClick={() => setReviewMode("auto")}
                      >
                        Auto (server data)
                      </Button>
                      <Button
                        type="button"
                        variant={reviewMode === "manual" ? "cta" : "outline"}
                        className="rounded-full"
                        onClick={() => setReviewMode("manual")}
                      >
                        Manual (upload)
                      </Button>
                    </div>
                    {reviewMode === "auto" ? (
                      <div className="space-y-2">
                        <p className="text-xs text-gray-500">{REVIEW_AUTO_HELPER}</p>
                        <div>
                          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
                            Optional data_dir (on API host)
                          </span>
                          <Input
                            value={reviewDataDir}
                            onChange={(e) => setReviewDataDir(e.target.value)}
                            className="mt-1 rounded-xl border-gray-200 font-mono text-xs"
                            placeholder="Leave empty for defaults"
                          />
                        </div>
                      </div>
                    ) : (
                      <label className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-gray-700">Marketing exports (.csv / .zip)</span>
                        <input
                          ref={reviewMktFilesRef}
                          type="file"
                          accept=".zip,.csv,application/zip,text/csv"
                          multiple
                          className="block w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#FF6B35]/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-[#FF6B35]"
                        />
                        <span className="text-xs text-gray-500">{REVIEW_MANUAL_HELPER}</span>
                      </label>
                    )}
                  </div>
                )}

                {selected === "deepdive" && (
                  <div className="mt-4 space-y-4">
                    <label className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-gray-700">Operator ID</span>
                      <Input
                        value={opId}
                        onChange={(e) => setOpId(e.target.value)}
                        className="rounded-xl border-gray-200"
                        placeholder="e.g. SSM"
                        required
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-gray-700">Delivery platform exports</span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".zip,application/zip"
                        multiple
                        className="block w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#FF6B35]/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-[#FF6B35]"
                        onChange={(e) => setZipFiles(Array.from(e.target.files ?? []))}
                      />
                      <span className="text-xs text-gray-500">{DEEPDIVE_ZIP_HELPER}</span>
                      {zipFiles.length > 0 && (
                        <span className="text-xs text-gray-600">
                          Selected: {zipFiles.map((f) => f.name).join(", ")}
                        </span>
                      )}
                    </label>
                  </div>
                )}

                {(selected === "resgro-offers" || selected === "resgro-ads") && (
                  <div className="mt-4 space-y-4">
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Operator ID</span>
                      <Input value={opId} onChange={(e) => setOpId(e.target.value)} className="mt-1 rounded-xl border-gray-200" />
                    </div>
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">DoorDash Email</span>
                      <Input
                        value={ddEmail}
                        onChange={(e) => setDdEmail(e.target.value)}
                        className="mt-1 rounded-xl border-gray-200"
                        type="email"
                        placeholder="merchant@example.com"
                      />
                    </div>
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">DoorDash Password</span>
                      <Input
                        value={ddPassword}
                        onChange={(e) => setDdPassword(e.target.value)}
                        className="mt-1 rounded-xl border-gray-200"
                        type="password"
                      />
                    </div>
                    <div className="mt-2 border-t border-gray-100 pt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">UberEats credentials (optional)</p>
                    </div>
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">UberEats Email</span>
                      <Input
                        value={ueEmail}
                        onChange={(e) => setUeEmail(e.target.value)}
                        className="mt-1 rounded-xl border-gray-200"
                        type="email"
                        placeholder="merchant@example.com"
                      />
                    </div>
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">UberEats Password</span>
                      <Input
                        value={uePassword}
                        onChange={(e) => setUePassword(e.target.value)}
                        className="mt-1 rounded-xl border-gray-200"
                        type="password"
                      />
                    </div>
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Store IDs</span>
                      <Input
                        value={storeIds}
                        onChange={(e) => setStoreIds(e.target.value)}
                        className="mt-1 rounded-xl border-gray-200"
                        placeholder="comma-separated"
                      />
                    </div>
                  </div>
                )}

                {selected === "monthly-reporter" && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Pre period</span>
                      <Input value={preRange} onChange={(e) => setPreRange(e.target.value)} className="mt-1 rounded-xl border-gray-200" />
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Post period</span>
                      <Input value={postRange} onChange={(e) => setPostRange(e.target.value)} className="mt-1 rounded-xl border-gray-200" />
                    </div>
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Operator ID</span>
                      <Input value={opId} onChange={(e) => setOpId(e.target.value)} className="mt-1 rounded-xl border-gray-200" />
                    </div>
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Operator name</span>
                      <Input value={opName} onChange={(e) => setOpName(e.target.value)} className="mt-1 rounded-xl border-gray-200" />
                    </div>
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">DoorDash CSV (optional)</span>
                      <input ref={ddFileRef} type="file" accept=".csv" className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#FF6B35]/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-[#FF6B35]" />
                    </div>
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">UberEats CSV (optional)</span>
                      <input ref={ueFileRef} type="file" accept=".csv" className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#FF6B35]/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-[#FF6B35]" />
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Marketing CSVs (optional)</span>
                      <input ref={mktFilesRef} type="file" accept=".csv" multiple className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#FF6B35]/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-[#FF6B35]" />
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Exclude dates (optional)</span>
                      <Input value={excludedDates} onChange={(e) => setExcludedDates(e.target.value)} className="mt-1 rounded-xl border-gray-200" placeholder="MM/DD/YYYY, ..." />
                    </div>
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">DD store IDs (optional)</span>
                      <Input value={ddStores} onChange={(e) => setDdStores(e.target.value)} className="mt-1 rounded-xl border-gray-200" />
                    </div>
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">UE store IDs (optional)</span>
                      <Input value={ueStores} onChange={(e) => setUeStores(e.target.value)} className="mt-1 rounded-xl border-gray-200" />
                    </div>
                  </div>
                )}

                {error && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
                )}

                <Button
                  type="button"
                  onClick={runAnalysis}
                  disabled={loading}
                  variant="cta"
                  className="mt-5 rounded-full"
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                  {selected === "data"
                    ? loading
                      ? "Ingesting data..."
                      : "Create data session"
                    : selected === "boss"
                      ? loading
                        ? "Running full pipeline..."
                        : "Run boss pipeline"
                    : selected === "deepdive"
                    ? loading
                      ? "Uploading and analyzing..."
                      : "Upload and run analysis agent"
                    : selected === "marketingreco"
                      ? loading
                        ? "Running Recommendation Engine..."
                        : "Run Recommendation Engine"
                      : selected === "review"
                        ? loading
                          ? "Running Campaign Review..."
                          : "Run Campaign Review"
                        : loading
                          ? "Running..."
                          : `Run ${catalog.title}`}
                </Button>
              </div>
            </div>

            {/* ── Results panel ── */}
            <div
              className={
                selected === "deepdive" && deepDiveHtml
                  ? "rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6 lg:max-w-none"
                  : "rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"
              }
            >
              {dataResult ? (
                <div className="space-y-3 border-b border-gray-100 pb-3">
                  <h3 className="text-lg font-bold text-black">Data session</h3>
                  <p className="text-sm text-gray-500">
                    Session created. Use <code className="text-xs">session_id</code> when running the Boss agent or
                    session-scoped routes on the API.
                  </p>
                  {typeof dataResult.session_id === "string" && dataResult.session_id ? (
                    <p className="text-xs text-gray-600">
                      <span className="font-semibold text-gray-800">session_id: </span>
                      <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{dataResult.session_id}</code> (also
                      saved in the Session ID field for Boss)
                    </p>
                  ) : null}
                  <pre className="max-h-[min(360px,50vh)] overflow-auto rounded-xl border border-gray-100 bg-[#f8f9fb] p-3 text-xs text-gray-800">
                    {JSON.stringify(dataResult, null, 2)}
                  </pre>
                </div>
              ) : bossResult ? (
                <div className="space-y-3 border-b border-gray-100 pb-3">
                  <h3 className="text-lg font-bold text-black">Boss pipeline</h3>
                  <p className="text-sm text-gray-500">End-to-end run status and per-step results.</p>
                  <pre className="max-h-[min(420px,55vh)] overflow-auto rounded-xl border border-gray-100 bg-[#f8f9fb] p-3 text-xs text-gray-800">
                    {JSON.stringify(bossResult, null, 2)}
                  </pre>
                </div>
              ) : campaignReviewResult ? (
                <div className="border-b border-gray-100 pb-3">
                  <h3 className="text-lg font-bold text-black">Campaign review</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Recommendations and metrics from <code className="text-xs">/api/runs/campaign-review</code>.
                  </p>
                </div>
              ) : marketingRecoResult ? (
                <div className="flex flex-col gap-3 border-b border-gray-100 pb-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-bold text-black">Recommendation output</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Campaign previews below. Export the campaigns workbook for Ads / portal workflows (opens in a new
                      tab).
                    </p>
                  </div>
                  <div className="flex w-fit max-w-full flex-shrink-0 flex-wrap gap-2 self-start sm:self-auto">
                    {(() => {
                      const excelUrl =
                        downloads.campaigns_excel ||
                        (typeof marketingRecoResult.run_id === "string" && marketingRecoResult.run_id
                          ? resolveAgentsApiUrl(
                              `/api/runs/marketingreco/${marketingRecoResult.run_id}/download/campaigns`,
                            )
                          : "");
                      return excelUrl ? (
                        <a
                          href={excelUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex w-fit shrink-0 items-center justify-center gap-2 rounded-full bg-[#FF6B35] px-4 py-2 text-sm font-semibold text-white hover:bg-[#FF8C42]"
                        >
                          <Download className="h-4 w-4 shrink-0" />
                          Download campaigns Excel
                        </a>
                      ) : null;
                    })()}
                  </div>
                </div>
              ) : deepResult || deepReportHtml ? (
                <div className="flex flex-col gap-3 border-b border-gray-100 pb-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-black">Analysis Report</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Full-width layout (Ralph-style). Open in a new tab or expand to full screen.
                    </p>
                  </div>
                  {selected === "deepdive" && deepDiveHtml && (
                    <div className="flex flex-shrink-0 flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full border-gray-300"
                        onClick={openDeepDiveReportInNewTab}
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open in new tab
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full border-gray-300"
                        onClick={() => setReportFullscreen(true)}
                      >
                        <Maximize2 className="mr-2 h-4 w-4" />
                        Full screen
                      </Button>
                    </div>
                  )}
                </div>
              ) : monthlyResult ? (
                <div className="flex flex-col gap-3 border-b border-gray-100 pb-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-bold text-black">Monthly report</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Narrative and preview tables below. Export Excel outputs (parity with Ralph / Streamlit monthly flow).
                    </p>
                  </div>
                  <div className="flex w-fit max-w-full flex-shrink-0 flex-wrap gap-2 self-start sm:self-auto">
                    {(() => {
                      const fullUrl =
                        downloads.full ||
                        (monthlyResult.run_id
                          ? resolveAgentsApiUrl(`/api/runs/${monthlyResult.run_id}/download/full`)
                          : "");
                      const dateUrl = downloads.date || "";
                      return (
                        <>
                          {fullUrl ? (
                            <a
                              href={fullUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex w-fit shrink-0 items-center justify-center gap-2 rounded-full bg-[#FF6B35] px-4 py-2 text-sm font-semibold text-white hover:bg-[#FF8C42]"
                            >
                              <Download className="h-4 w-4 shrink-0" />
                              Export full workbook
                            </a>
                          ) : null}
                          {dateUrl ? (
                            <a
                              href={dateUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex w-fit shrink-0 items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                            >
                              <Download className="h-4 w-4 shrink-0" />
                              Export date breakdown
                            </a>
                          ) : null}
                        </>
                      );
                    })()}
                  </div>
                </div>
              ) : loading ? (
                <>
                  <h3 className="text-lg font-bold text-black">Results</h3>
                  <div className="mt-3 flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-[#FF6B35]" />
                    <p className="text-sm text-gray-500">Running analysis...</p>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-bold text-black">Results</h3>
                  <p className="mt-1 text-sm text-gray-500">Run an agent to see results here.</p>
                </>
              )}

              <div className="mt-5 space-y-4">
                {campaignReviewResult && (
                  <>
                    <div className="rounded-2xl border border-gray-100 bg-[#FFF9F6] p-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Summary</p>
                      <p className="mt-2 text-sm text-gray-700">
                        {typeof campaignReviewResult.notes === "string" ? campaignReviewResult.notes : "Run complete."}
                      </p>
                      <p className="mt-2 text-xs text-gray-500">run_id: {String(campaignReviewResult.run_id ?? "—")}</p>
                      {campaignReviewResult.next_review_date ? (
                        <p className="mt-1 text-xs text-gray-500">
                          Next review: {String(campaignReviewResult.next_review_date)}
                        </p>
                      ) : null}
                    </div>
                    {(() => {
                      const { columns, rows } = campaignReviewPreviewRows(campaignReviewResult.campaign_reviews);
                      if (!columns.length) return null;
                      return <PreviewTable title="Campaign reviews" columns={columns} rows={rows} />;
                    })()}
                  </>
                )}

                {marketingRecoResult && (
                  <>
                    <div className="rounded-2xl border border-gray-100 bg-[#FFF9F6] p-5">
                      <p className="text-sm font-medium text-black">
                        {String(marketingRecoResult.operator_id ?? opId)} —{" "}
                        {Array.isArray(marketingRecoResult.recommended_campaigns)
                          ? `${marketingRecoResult.recommended_campaigns.length} recommended campaign(s)`
                          : "Run complete"}
                      </p>
                      <p className="mt-2 text-xs text-gray-500">
                        run_id: {String(marketingRecoResult.run_id ?? "—")}
                      </p>
                    </div>
                    {(() => {
                      const { columns, rows } = campaignsToPreview(marketingRecoResult.recommended_campaigns);
                      if (!columns.length) return null;
                      return <PreviewTable title="Recommended campaigns" columns={columns} rows={rows} />;
                    })()}
                    {(() => {
                      const rows = marketingRecoResult.ads_upload_rows;
                      const { columns, rows: r } = campaignsToPreview(rows);
                      if (!columns.length) return null;
                      return <PreviewTable title="Ads upload rows (preview)" columns={columns} rows={r} />;
                    })()}
                  </>
                )}

                {(deepResult || deepReportHtml) && deepDiveHtml && (
                  <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-inner">
                    <iframe
                      srcDoc={deepDiveHtml}
                      className={
                        selected === "deepdive"
                          ? "min-h-[calc(100vh-14rem)] w-full border-0 bg-white lg:min-h-[calc(100vh-12rem)]"
                          : "min-h-[min(85vh,920px)] w-full border-0 bg-white"
                      }
                      title="Analysis Report"
                    />
                  </div>
                )}

                {setupResult && (
                  <div className="rounded-2xl border border-gray-100 bg-[#FFF9F6] p-5">
                    <p className="text-sm font-medium text-black">
                      {setupResult.status === "success"
                        ? `Campaign execution completed for ${setupResult.operator_id} (${setupResult.mode} mode).`
                        : `Status: ${setupResult.status}`}
                    </p>
                    <p className="mt-2 text-xs text-gray-500">run_id: {setupResult.run_id}</p>
                  </div>
                )}

                {monthlyResult && (
                  <>
                    <div className="rounded-2xl border border-gray-100 bg-[#FFF9F6] p-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Narrative</p>
                      <p className="mt-2 text-sm text-gray-700">{monthlyResult.summary_text}</p>
                      <p className="mt-2 text-xs text-gray-500">run_id: {monthlyResult.run_id}</p>
                    </div>
                    <TabbedPreviewTables tables={monthlyResult.tables} />
                  </>
                )}

                {!deepResult &&
                  !deepReportHtml &&
                  !setupResult &&
                  !monthlyResult &&
                  !marketingRecoResult &&
                  !campaignReviewResult &&
                  (loading ? (
                    <div className="flex items-center gap-3 py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-[#FF6B35]" />
                      <p className="text-sm text-gray-500">Running analysis...</p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Run an agent to see output here.</p>
                  ))}
              </div>
            </div>
          </div>
        )}

        {reportFullscreen && deepDiveHtml && (
          <div
            className="fixed inset-0 z-[250] flex flex-col bg-white"
            role="dialog"
            aria-modal="true"
            aria-label="Analysis report full screen"
          >
            <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Analysis Report</h2>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full border-gray-300"
                  onClick={openDeepDiveReportInNewTab}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open in new tab
                </Button>
                <Button
                  type="button"
                  variant="cta"
                  className="rounded-full"
                  onClick={() => setReportFullscreen(false)}
                >
                  <X className="mr-2 h-4 w-4" />
                  Close
                </Button>
              </div>
            </div>
            <iframe
              srcDoc={deepDiveHtml}
              className="min-h-0 w-full flex-1 border-0 bg-white"
              title="Analysis Report (full screen)"
            />
          </div>
        )}
      </div>
    );
  }

  /* ── Agent grid (default view) ── */
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm leading-relaxed text-gray-600">
          Select an agent card to configure inputs, then run.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-gray-500">
          Analysis, campaign, and monthly reporting flows accept <strong>DoorDash</strong> and <strong>Uber Eats</strong> data
          where noted (zips, exports, or optional portal credentials). DoorDash is required for some automated merchant-portal
          steps; add Uber Eats credentials or files when you need Eats coverage.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {OPERATOR_AGENT_CATALOG.map((a) => {
          const Icon = agentIcon[a.id] ?? BarChart3;
          return (
            <article
              key={a.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(a.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(a.id);
                }
              }}
              style={{
                background: "linear-gradient(135deg, rgb(255 255 255 / 0.92), rgb(255 249 246 / 0.88))",
                boxShadow: "0 0 0 1px rgb(37 37 37 / 0.06), 0 24px 60px -32px rgb(37 37 37 / 0.18)",
                backdropFilter: "blur(18px)",
              }}
              className="group flex h-full min-h-[220px] cursor-pointer flex-col rounded-[24px] p-5 transition hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-2xl text-white"
                  style={{ background: agentGradient[a.id], boxShadow: "0 4px 14px -2px rgb(0 0 0 / 0.12)" }}
                >
                  <Icon className="h-6 w-6" aria-hidden />
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(a.status)}`}
                >
                  {a.status}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">
                {a.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">{a.description}</p>

              <div className="mt-auto pt-4">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (a.status === "idle") return;
                    setSelected(a.id);
                  }}
                  disabled={a.status === "idle"}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                    a.status === "idle"
                      ? "cursor-not-allowed bg-gray-200 text-gray-400"
                      : "bg-gray-900 text-white hover:bg-gray-800"
                  }`}
                >
                  {a.status === "idle" ? (
                    <>Coming soon</>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Run {a.title.split(" ")[0]}
                    </>
                  )}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
