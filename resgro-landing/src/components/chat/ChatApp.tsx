import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  MessageSquare,
  Plus,
  Send,
  Paperclip,
  X,
  BarChart3,
  FileText,
  ArrowLeft,
  Square,
  Loader2,
  Sparkles,
  Menu,
  Bot,
  Upload,
  Download,
  ChevronRight,
  User,
  Users,
  CreditCard,
  HelpCircle,
  LogOut,
  Layers,
  Zap,
  Copy,
  Check,
  Calendar,
  Lock,
  Mail,
  Database,
  Megaphone,
  Settings2,
  ClipboardCheck,
  Trash2,
} from "lucide-react";
import { resolveAgentsApiUrl } from "@/lib/agentsApi";
import {
  fetchAgentsApi,
  formatApiErrorDetail,
  runMonthlyReporterWithFiles,
  runSessionAgent,
  uploadFilesToSession,
  TIMEOUT_AGENT_RUN_MS,
} from "@/lib/agentWorkflow";
import { assertDirectUploadSizeWithinLimit, shouldUseGcsUpload } from "@/lib/gcsUpload";
import { getDjangoAdminUrl, isAdminEmail } from "@/config/admin";
import {
  AGENT_REGISTRY,
  findAgentByCommand,
  searchAgents,
  type AgentConfig,
} from "./agentRegistry";
import { SlashCommandMenu } from "./SlashCommandMenu";
import { UploadRequirementsCard } from "./UploadRequirementsCard";
import { ProcessPanel } from "./ProcessPanel";
import type { ProcessState } from "./processTypes";
import {
  createProcessState,
  advanceStep,
  completeAll,
  failStep,
} from "./processStepRegistry";
import { ProfilePanel } from "./ProfilePanel";
import { BillingPanel } from "./BillingPanel";
import type { SubscriptionData } from "../../hooks/useSubscription";
import type { WorkspaceUser } from "../../lib/userDirectory";
import { apiLogActivity } from "../../config/authApi";
import {
  apiListChatSessions,
  apiGetChatSession,
  apiSaveChatSession,
  apiDeleteChatSession,
} from "../../lib/chatSessionsApi";

/* ─── Types ─────────────────────────────────────────────────────────────────── */

interface PreviewTableData {
  columns: string[];
  rows: Record<string, unknown>[];
}

interface AgentResult {
  type:
    | "data_upload"
    | "deepdive"
    | "marketingreco"
    | "campaign_setup"
    | "campaign_review"
    | "monthly_reporter"
    | "boss";
  runId?: string;
  sessionId?: string;
  summaryText?: string;
  aiSummary?: string;
  reportHtml?: string;
  tables?: Record<string, PreviewTableData>;
  campaigns?: Record<string, unknown>[];
  campaignPlan?: Record<string, unknown>[];
  adsTable?: Record<string, unknown>[];
  slotTables?: {
    slots: string[];
    stores: string[];
    aov_table: Record<string, unknown>[];
    profitability_table: Record<string, unknown>[];
  };
  campaignReviews?: Record<string, unknown>[];
  summaryMetrics?: Record<string, Record<string, unknown>>;
  campaignComparison?: Record<string, unknown>[];
  campaignPerformance?: Record<string, unknown>[];
  downloads?: Record<string, string>;
  bossSteps?: Record<
    string,
    { status: string; run_id?: string; summary?: string }
  >;
  notes?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  agent?: string;
  files?: string[];
  isLoading?: boolean;
  agentResult?: AgentResult;
  processState?: ProcessState;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

type SidebarView = "chats" | "agents";
type MainView = "chat" | "profile" | "billing" | "help";

/* ─── Constants ────────────────────────────────────────────────────────────── */

const STORAGE_KEY_LEGACY = "resgro-chat-sessions";
function userStorageKey(userId: string) {
  return `resgro-chat-sessions-${userId}`;
}

const WELCOME_SUGGESTIONS = [
  { label: "Pull my data", command: "/data", icon: Database },
  { label: "Analyze my data", command: "/deepdive", icon: BarChart3 },
  { label: "Get marketing plan", command: "/marketingreco", icon: Megaphone },
  { label: "Campaign setup", command: "/campaigns", icon: Settings2 },
  { label: "Campaign review", command: "/review", icon: ClipboardCheck },
  { label: "Monthly KPI report", command: "/monthlyreport", icon: FileText },
  { label: "Full pipeline", command: "/boss", icon: Zap },
];

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function uid(): string {
  return (
    crypto.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderMarkdown(raw: string): string {
  let t = escapeHtml(raw);
  t = t.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    '<pre class="bg-black/40 rounded-lg p-3 my-2 overflow-x-auto text-sm font-mono"><code>$2</code></pre>',
  );
  t = t.replace(
    /`([^`]+)`/g,
    '<code class="bg-black/30 px-1.5 py-0.5 rounded text-sm font-mono text-orange-300">$1</code>',
  );
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  t = t.replace(
    /^### (.+)$/gm,
    '<h3 class="text-base font-semibold mt-3 mb-1 text-white">$1</h3>',
  );
  t = t.replace(
    /^## (.+)$/gm,
    '<h2 class="text-lg font-semibold mt-4 mb-2 text-white">$1</h2>',
  );
  t = t.replace(
    /^# (.+)$/gm,
    '<h1 class="text-xl font-bold mt-4 mb-2 text-white">$1</h1>',
  );
  t = t.replace(
    /^[-•] (.+)$/gm,
    '<div class="flex gap-2 ml-2"><span class="text-[#FF6B35]">•</span><span>$1</span></div>',
  );
  t = t.replace(
    /^(\d+)\. (.+)$/gm,
    '<div class="flex gap-2 ml-2"><span class="text-[#FF6B35] font-medium min-w-[1.5ch]">$1.</span><span>$2</span></div>',
  );
  t = t.replace(/\n\n/g, '<div class="h-3"></div>');
  t = t.replace(/\n/g, "<br/>");
  return t;
}

function titleFromMessage(text: string): string {
  const clean = text.replace(/\n/g, " ").trim();
  return clean.length > 40 ? clean.slice(0, 40) + "…" : clean;
}

function loadSessionsFromLocal(userId?: string): ChatSession[] {
  try {
    const key = userId ? userStorageKey(userId) : STORAGE_KEY_LEGACY;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSessionsToLocal(sessions: ChatSession[], userId?: string) {
  const key = userId ? userStorageKey(userId) : STORAGE_KEY_LEGACY;
  localStorage.setItem(key, JSON.stringify(sessions));
}

function messageToRemote(m: Message) {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: m.timestamp,
    agent: m.agent || undefined,
    files: m.files || [],
    agentResult: m.agentResult || undefined,
    process: m.processState || undefined,
  };
}

function remoteToMessage(m: {
  id: string;
  role: string;
  content: string;
  timestamp: number;
  agent?: string | null;
  files?: string[];
  agentResult?: unknown;
  process?: unknown;
}): Message {
  return {
    id: m.id,
    role: m.role as Message["role"],
    content: m.content,
    timestamp: m.timestamp,
    agent: m.agent || undefined,
    files: m.files || [],
    agentResult: m.agentResult as AgentResult | undefined,
    processState: m.process as ProcessState | undefined,
  };
}

/* ─── Inline Components ───────────────────────────────────────────────────── */

const _MONEY_COLS = new Set([
  "sales", "payouts", "revenue", "net_revenue", "spend", "cost", "amount",
  "subtotal", "payout", "commission", "net_revenue_delta", "budget",
  "total_spend", "avg_order_value", "price", "profit", "total_charge",
  "aov", "gross_revenue", "estimated_revenue", "net_payout", "yoy",
  "prevspost", "lastyear pre vs post", "pre", "post", "last year-post",
  "average check",
]);
const _PCT_COLS = new Set([
  "growth%", "yoy%", "aov_lift_pct", "order_volume_lift_pct", "cancel_rate",
  "conversion_rate", "dashpass_rate", "margin", "roas", "ctr", "profitability",
]);

function _isMoney(key: string, val: unknown): boolean {
  const lk = key.toLowerCase().trim();
  if (_MONEY_COLS.has(lk)) return true;
  if (lk.includes("revenue") || lk.includes("spend") || lk.includes("cost") || lk.includes("payout") || lk.includes("budget") || lk.includes("price")) return true;
  return false;
}

function _isPct(key: string): boolean {
  const lk = key.toLowerCase().trim();
  if (_PCT_COLS.has(lk)) return true;
  if (lk.includes("%") || lk.includes("_pct") || lk.includes("growth") || lk.includes("profitability")) return true;
  return false;
}

function _isNumCol(key: string): boolean {
  const lk = key.toLowerCase().trim();
  return _isMoney(key, 0) || _isPct(key) || lk === "orders" || lk.includes("count") || lk === "yoy";
}

function _fmtCell(key: string, val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  const s = String(val);
  const num = typeof val === "number" ? val : Number(s.replace(/[,$%]/g, ""));

  if (_isMoney(key, val) && Number.isFinite(num)) {
    const sign = num < 0 ? "-" : "";
    return `${sign}$${Math.abs(num).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
  }
  if (_isPct(key) && Number.isFinite(num)) {
    const sign = num > 0 ? "+" : "";
    return `${sign}${num.toFixed(1)}%`;
  }
  if (Number.isFinite(num) && typeof val === "number") {
    if (num !== Math.floor(num)) return num.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return num.toLocaleString();
  }
  return s;
}

function _prettyHdr(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b(pct|id)\b/gi, (m) => m.toUpperCase())
    .replace(/\baov\b/gi, "AOV")
    .replace(/\broas\b/gi, "ROAS")
    .replace(/\byoy\b/gi, "YoY")
    .replace(/^./, (c) => c.toUpperCase());
}

function _downloadCsv(columns: string[], rows: Record<string, unknown>[], filename: string) {
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map(escape).join(",");
  const body = rows.map((r) => columns.map((c) => escape(r[c])).join(",")).join("\n");
  const blob = new Blob([header + "\n" + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function _deltaColor(val: unknown): string {
  if (val === null || val === undefined) return "";
  const num = typeof val === "number" ? val : Number(String(val).replace(/[,$%]/g, ""));
  if (!Number.isFinite(num) || num === 0) return "";
  return num > 0 ? "text-emerald-400" : "text-red-400";
}

function ChatPreviewTable({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: string[];
  rows: Record<string, unknown>[];
}) {
  const cols = columns.slice(0, 14);
  if (!cols.length) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-[#333338] bg-[#1e1e22] mt-3">
      <div className="flex items-center gap-2 border-b border-[#333338] bg-[#242428] px-3 py-2">
        <span className="text-xs font-semibold text-gray-200">
          {_prettyHdr(title.replace(/_/g, " "))}
        </span>
        <span className="text-[10px] text-gray-500">({rows.length} {rows.length === 1 ? "row" : "rows"})</span>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 z-10 bg-[#242428]">
            <tr className="border-b border-[#333338]">
              {cols.map((c) => (
                <th
                  key={c}
                  className={`whitespace-nowrap px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 ${_isNumCol(c) ? "text-right" : ""}`}
                >
                  {_prettyHdr(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 80).map((row, ri) => (
              <tr
                key={ri}
                className="border-b border-[#2a2a2e] last:border-0 hover:bg-[#2a2a2e]/60"
              >
                {cols.map((c) => {
                  const isDelta = c.toLowerCase().includes("vs") || c.toLowerCase().includes("growth") || c.toLowerCase().includes("yoy") || c.toLowerCase().includes("delta") || c.toLowerCase().includes("prevspost");
                  return (
                    <td
                      key={c}
                      className={`whitespace-nowrap px-3 py-1.5 text-[11px] tabular-nums ${_isNumCol(c) ? "text-right font-medium" : "text-gray-300"} ${isDelta ? _deltaColor(row[c]) : "text-gray-300"}`}
                    >
                      {_fmtCell(c, row[c])}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabbedTables({ tables }: { tables: Record<string, PreviewTableData> }) {
  const keys = Object.keys(tables);
  const [active, setActive] = useState(keys[0] || "");
  if (!keys.length) return null;
  const t = tables[active];
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-1.5 mb-2">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setActive(k)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
              active === k
                ? "bg-[#FF6B35] text-white"
                : "bg-[#2a2a2e] text-gray-400 hover:bg-[#333338] hover:text-gray-200"
            }`}
          >
            {_prettyHdr(k.replace(/_/g, " "))}
          </button>
        ))}
      </div>
      {t && t.columns?.length ? (
        <ChatPreviewTable title={active} columns={t.columns} rows={t.rows} />
      ) : (
        <p className="text-xs text-gray-500 italic py-4 text-center">No data available for this view</p>
      )}
    </div>
  );
}

function AgentResultCard({
  result,
}: {
  result: AgentResult;
}) {
  const [reportExpanded, setReportExpanded] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-3 space-y-3">
      {/* AI Summary */}
      {result.aiSummary && (
        <div className="rounded-xl border border-[#FF6B35]/20 bg-[#FF6B35]/5 overflow-hidden">
          <button
            onClick={() => setSummaryExpanded(!summaryExpanded)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-left"
          >
            <Sparkles size={14} className="text-[#FF6B35] shrink-0" />
            <span className="text-xs font-semibold text-[#FF6B35] uppercase tracking-wider">
              AI Summary
            </span>
            <ChevronRight
              size={12}
              className={`text-[#FF6B35]/60 ml-auto transition-transform ${summaryExpanded ? "rotate-90" : ""}`}
            />
          </button>
          {summaryExpanded && (
            <div className="px-4 pb-3 border-t border-[#FF6B35]/10">
              <div
                className="text-sm text-gray-200 leading-relaxed mt-2"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(result.aiSummary),
                }}
              />
              <button
                onClick={() => handleCopy(result.aiSummary!)}
                className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-gray-500 hover:text-[#FF6B35] hover:bg-[#FF6B35]/10 transition-colors"
              >
                {copied ? <Check size={10} /> : <Copy size={10} />}
                {copied ? "Copied" : "Copy summary"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* DeepDive Slot Tables + Download Buttons */}
      {result.type === "deepdive" && result.slotTables && (result.slotTables.aov_table.length > 0 || result.slotTables.profitability_table.length > 0) && (
        <>
          {result.slotTables.aov_table.length > 0 && (
            <ChatPreviewTable
              title="Store Slot AOV Table"
              columns={["slot", ...result.slotTables.stores]}
              rows={result.slotTables.aov_table}
            />
          )}
          {result.slotTables.profitability_table.length > 0 && (
            <ChatPreviewTable
              title="Store Slot Profitability %"
              columns={["slot", ...result.slotTables.stores]}
              rows={result.slotTables.profitability_table}
            />
          )}
          <div className="flex flex-wrap gap-2">
            {result.slotTables.aov_table.length > 0 && (
              <button
                onClick={() => _downloadCsv(["slot", ...result.slotTables!.stores], result.slotTables!.aov_table, "slot_aov_table.csv")}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FF6B35]/15 text-[#FF6B35] text-xs font-medium hover:bg-[#FF6B35]/25 transition-colors border border-[#FF6B35]/20"
              >
                <Download size={12} />
                Download AOV Table
              </button>
            )}
            {result.slotTables.profitability_table.length > 0 && (
              <button
                onClick={() => _downloadCsv(["slot", ...result.slotTables!.stores], result.slotTables!.profitability_table, "slot_profitability_table.csv")}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FF6B35]/15 text-[#FF6B35] text-xs font-medium hover:bg-[#FF6B35]/25 transition-colors border border-[#FF6B35]/20"
              >
                <Download size={12} />
                Download Profitability Table
              </button>
            )}
          </div>
        </>
      )}

      {/* DeepDive Report */}
      {result.type === "deepdive" && result.reportHtml && (
        <>
          <button
            onClick={() => setReportExpanded(!reportExpanded)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FF6B35]/15 text-[#FF6B35] text-xs font-medium hover:bg-[#FF6B35]/25 transition-colors"
          >
            <BarChart3 size={12} />
            {reportExpanded ? "Collapse Report" : "View Full Report"}
          </button>
          {reportExpanded && (
            <div className="overflow-hidden rounded-xl border border-[#333338]">
              <iframe
                srcDoc={result.reportHtml}
                className="w-full border-0 bg-white"
                style={{ minHeight: "70vh" }}
                title="DeepDive Report"
              />
            </div>
          )}
        </>
      )}

      {/* Marketing Reco — Campaign Plan & Ads Table + Downloads */}
      {result.type === "marketingreco" && (result.campaignPlan?.length || result.adsTable?.length) && (
        <>
          {result.campaignPlan && result.campaignPlan.length > 0 && (
            <ChatPreviewTable
              title="Campaign Plan"
              columns={Object.keys(result.campaignPlan[0]).slice(0, 14)}
              rows={result.campaignPlan}
            />
          )}
          {result.adsTable && result.adsTable.length > 0 && (
            <ChatPreviewTable
              title="Ads Table (Profitability > 60%)"
              columns={Object.keys(result.adsTable[0]).slice(0, 14)}
              rows={result.adsTable}
            />
          )}
          <div className="flex flex-wrap gap-2">
            {result.campaignPlan && result.campaignPlan.length > 0 && (
              <button
                onClick={() => _downloadCsv(Object.keys(result.campaignPlan![0]).slice(0, 14), result.campaignPlan!, "campaign_plan.csv")}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FF6B35]/15 text-[#FF6B35] text-xs font-medium hover:bg-[#FF6B35]/25 transition-colors border border-[#FF6B35]/20"
              >
                <Download size={12} />
                Download Campaign Plan
              </button>
            )}
            {result.adsTable && result.adsTable.length > 0 && (
              <button
                onClick={() => _downloadCsv(Object.keys(result.adsTable![0]).slice(0, 14), result.adsTable!, "ads_table.csv")}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FF6B35]/15 text-[#FF6B35] text-xs font-medium hover:bg-[#FF6B35]/25 transition-colors border border-[#FF6B35]/20"
              >
                <Download size={12} />
                Download Ads Table
              </button>
            )}
          </div>
        </>
      )}

      {/* Marketing Reco — Legacy Campaigns (backwards compat) */}
      {result.type === "marketingreco" && !result.campaignPlan && result.campaigns && result.campaigns.length > 0 && (
        <ChatPreviewTable
          title="Recommended Campaigns"
          columns={Object.keys(result.campaigns[0] as Record<string, unknown>).slice(0, 12)}
          rows={result.campaigns as Record<string, unknown>[]}
        />
      )}

      {/* Campaign Review */}
      {result.type === "campaign_review" && (
        <>
          {result.notes && (
            <div className="rounded-xl border border-[#333338] bg-[#242428] p-3">
              <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
                Notes
              </p>
              <p className="text-xs text-gray-300">{result.notes}</p>
            </div>
          )}
          {/* Channel Summary (promo / sponsored / combined) */}
          {result.summaryMetrics && (() => {
            const channels = ["promo", "sponsored_listing", "combined"] as const;
            const rows: Record<string, unknown>[] = [];
            for (const ch of channels) {
              const m = result.summaryMetrics![ch];
              if (!m) continue;
              rows.push({
                channel: ch === "sponsored_listing" ? "Sponsored Listings" : ch === "promo" ? "Promotions" : "Combined",
                orders: m.orders,
                sales: m.sales,
                spend: m.spend,
                roas: m.roas,
                aov: m.avg_order_value,
                cost_per_order: m.cost_per_order,
                ctr_pct: m.ctr_pct,
                conversion_pct: m.conversion_rate_pct,
                new_customers: m.new_customers,
              });
            }
            if (!rows.length) return null;
            return (
              <ChatPreviewTable
                title="Channel Summary"
                columns={Object.keys(rows[0])}
                rows={rows}
              />
            );
          })()}
          {/* Per-Campaign Performance */}
          {result.campaignPerformance && result.campaignPerformance.length > 0 && (
            <ChatPreviewTable
              title="Campaign Performance"
              columns={Object.keys(result.campaignPerformance[0]).slice(0, 14)}
              rows={result.campaignPerformance}
            />
          )}
          {/* Campaign Comparison (pre vs post) */}
          {result.campaignComparison && result.campaignComparison.length > 0 && (
            <ChatPreviewTable
              title="Campaign Pre vs Post Comparison"
              columns={Object.keys(result.campaignComparison[0]).slice(0, 14)}
              rows={result.campaignComparison}
            />
          )}
        </>
      )}

      {/* Monthly Reporter Tables — tabbed */}
      {result.type === "monthly_reporter" && result.tables && (
        <TabbedTables tables={result.tables} />
      )}

      {/* Boss Pipeline Steps */}
      {result.type === "boss" && result.bossSteps && (
        <div className="space-y-2">
          {Object.entries(result.bossSteps).map(([step, info]) => (
            <div
              key={step}
              className="rounded-xl border border-[#333338] bg-[#242428] p-3 flex items-start gap-3"
            >
              <span
                className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                  info.status === "success"
                    ? "bg-green-500"
                    : info.status === "skipped"
                      ? "bg-gray-500"
                      : "bg-red-500"
                }`}
              />
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-200">
                  {step.replace(/_/g, " ")}
                </p>
                {info.summary && (
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {info.summary}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Download Buttons */}
      {result.downloads && Object.keys(result.downloads).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(result.downloads).map(([label, url]) => (
            <a
              key={label}
              href={resolveAgentsApiUrl(url)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FF6B35]/15 text-[#FF6B35] text-xs font-medium hover:bg-[#FF6B35]/25 transition-colors border border-[#FF6B35]/20"
            >
              <Download size={12} />
              {label}
            </a>
          ))}
        </div>
      )}

      {/* Run ID */}
      {result.runId && (
        <p className="text-[10px] text-gray-600">Run: {result.runId}</p>
      )}

    </div>
  );
}

/* ─── Main Component ──────────────────────────────────────────────────────── */

interface ChatAppProps {
  subscription?: SubscriptionData | null;
  sessionUser?: WorkspaceUser | null;
  onBack?: () => void;
  onLogout?: () => void;
}

export function ChatApp({
  subscription,
  sessionUser,
  onBack,
  onLogout,
}: ChatAppProps) {
  const userId = sessionUser?.id ?? null;
  const [sessions, setSessions] = useState<ChatSession[]>(() =>
    loadSessionsFromLocal(userId ?? undefined),
  );
  const [activeId, setActiveId] = useState<string | null>(() => {
    const s = loadSessionsFromLocal(userId ?? undefined);
    return s.length > 0 ? s[0].id : null;
  });
  const [input, setInput] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<AgentConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mainView, setMainView] = useState<MainView>("chat");
  const [sidebarView, setSidebarView] = useState<SidebarView>("chats");
  const [slashMenuVisible, setSlashMenuVisible] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const isAdminUser = isAdminEmail(sessionUser?.email);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeSession = sessions.find((s) => s.id === activeId) ?? null;
  const messages = activeSession?.messages ?? [];
  const awaitingAgentUpload =
    !!selectedAgent && !messages.some((m) => m.role === "user");

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingSessionRef = useRef<string | null>(null);

  // Persist sessions to localStorage (immediate, local cache)
  useEffect(() => {
    saveSessionsToLocal(sessions, userId ?? undefined);
  }, [sessions, userId]);

  // Debounced save to backend
  const scheduleSave = useCallback(
    (session: ChatSession) => {
      if (!userId) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      savingSessionRef.current = session.id;
      saveTimerRef.current = setTimeout(() => {
        apiSaveChatSession(userId, {
          id: session.id,
          title: session.title,
          messages: session.messages.map(messageToRemote),
        }).catch(() => {});
        savingSessionRef.current = null;
      }, 2000);
    },
    [userId],
  );

  // Flush pending save immediately (for unmount / session switch)
  const flushSave = useCallback(() => {
    if (!userId || !savingSessionRef.current) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const session = sessions.find((s) => s.id === savingSessionRef.current);
    if (session) {
      apiSaveChatSession(userId, {
        id: session.id,
        title: session.title,
        messages: session.messages.map(messageToRemote),
      }).catch(() => {});
    }
    savingSessionRef.current = null;
  }, [userId, sessions]);

  // Load sessions from backend on mount / user change
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    // Migrate legacy localStorage sessions
    const legacy = loadSessionsFromLocal();
    if (legacy.length > 0 && !localStorage.getItem(`resgro-chat-migrated-${userId}`)) {
      for (const s of legacy) {
        apiSaveChatSession(userId, {
          id: s.id,
          title: s.title,
          messages: s.messages.map(messageToRemote),
        }).catch(() => {});
      }
      localStorage.setItem(`resgro-chat-migrated-${userId}`, "1");
      localStorage.removeItem(STORAGE_KEY_LEGACY);
    }

    apiListChatSessions(userId)
      .then(async (summaries) => {
        if (cancelled) return;
        if (summaries.length === 0) {
          // No remote sessions — keep local cache as-is
          return;
        }
        // Load full data for each session
        const loaded: ChatSession[] = [];
        for (const s of summaries) {
          try {
            const full = await apiGetChatSession(userId, s.id);
            loaded.push({
              id: full.id,
              title: full.title,
              messages: full.messages.map(remoteToMessage),
              createdAt: full.createdAt,
              updatedAt: full.updatedAt,
            });
          } catch {
            loaded.push({
              id: s.id,
              title: s.title,
              messages: [],
              createdAt: s.createdAt,
              updatedAt: s.updatedAt,
            });
          }
        }
        if (!cancelled && loaded.length > 0) {
          setSessions(loaded);
          setActiveId((prev) =>
            loaded.some((s) => s.id === prev) ? prev : loaded[0].id,
          );
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save on beforeunload
  useEffect(() => {
    const handler = () => flushSave();
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
      flushSave();
    };
  }, [flushSave]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, messages[messages.length - 1]?.content]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, [input]);

  /* ─── Session CRUD ──────────────────────────────────────────────────── */

  const createSession = useCallback(
    (options?: { resetAgent?: boolean }): ChatSession => {
      const s: ChatSession = {
        id: uid(),
        title: "New Chat",
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setSessions((prev) => [s, ...prev]);
      setActiveId(s.id);
      if (options?.resetAgent !== false) {
        setSelectedAgent(null);
        setFiles([]);
        setInput("");
      }
      setMainView("chat");
      setMobileSidebar(false);
      if (userId) {
        apiLogActivity({ userId, activityType: "chat", chatId: s.id });
        apiSaveChatSession(userId, {
          id: s.id,
          title: s.title,
          messages: [],
        }).catch(() => {});
      }
      return s;
    },
    [userId],
  );

  const stopSession = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsLoading(false);
    setLoadingSessionId(null);
  }, []);

  const deleteSession = useCallback(
    (sessionId: string) => {
      setSessions((prev) => {
        const remaining = prev.filter((s) => s.id !== sessionId);
        if (activeId === sessionId) {
          setActiveId(remaining.length > 0 ? remaining[0].id : null);
        }
        return remaining;
      });
      if (userId) {
        apiDeleteChatSession(userId, sessionId).catch(() => {});
      }
    },
    [activeId, userId],
  );

  /* ─── Message helpers ───────────────────────────────────────────────── */

  const addMessage = useCallback(
    (msg: Message, sessionId?: string) => {
      const sid = sessionId ?? activeId;
      if (!sid) return;
      setSessions((prev) => {
        const next = prev.map((s) => {
          if (s.id !== sid) return s;
          const updated: ChatSession = {
            ...s,
            messages: [...s.messages, msg],
            updatedAt: Date.now(),
          };
          if (msg.role === "user" && s.messages.length === 0) {
            updated.title = titleFromMessage(msg.content);
          }
          scheduleSave(updated);
          return updated;
        });
        return next;
      });
    },
    [activeId, scheduleSave],
  );

  const updateLastAssistant = useCallback(
    (
      content: string,
      sessionId?: string,
      options?: { agentResult?: AgentResult; processState?: ProcessState },
    ) => {
      const sid = sessionId ?? activeId;
      if (!sid) return;
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sid) return s;
          const msgs = [...s.messages];
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].role === "assistant") {
              msgs[i] = {
                ...msgs[i],
                content,
                isLoading: false,
                ...(options?.agentResult ? { agentResult: options.agentResult } : {}),
                ...(options?.processState ? { processState: options.processState } : {}),
              };
              break;
            }
          }
          const updated = { ...s, messages: msgs, updatedAt: Date.now() };
          scheduleSave(updated);
          return updated;
        }),
      );
      if (sessionUser?.id && options?.agentResult) {
        const ar = options.agentResult;
        if (ar.sessionId) {
          apiLogActivity({
            userId: sessionUser.id,
            activityType: "session",
            chatId: sid,
            sessionId: ar.sessionId,
            agentName: ar.type,
          });
        }
        if (ar.runId) {
          apiLogActivity({
            userId: sessionUser.id,
            activityType: "run",
            chatId: sid,
            sessionId: ar.sessionId || "",
            runId: ar.runId,
            agentName: ar.type,
            status: "completed",
          });
        }
      }
    },
    [activeId, sessionUser, scheduleSave],
  );

  /* ─── LLM Summary ──────────────────────────────────────────────────── */

  async function summarizeWithLLM(rawOutput: string): Promise<string> {
    try {
      const resp = await fetch(resolveAgentsApiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `You are a business analyst AI. Summarize this agent output for a restaurant business user.\n\nInclude:\n- Executive summary (2-3 sentences)\n- Key insights (bullet points)\n- Important warnings (if any)\n- Recommended next steps\n\nKeep concise but actionable. Use markdown formatting.\n\nAgent Output:\n${rawOutput.slice(0, 4000)}`,
          history: [],
        }),
      });
      if (!resp.ok) return "";
      const contentType = resp.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream")) {
        const reader = resp.body?.getReader();
        if (!reader) return "";
        const decoder = new TextDecoder();
        let fullText = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
            try {
              const d = JSON.parse(line.slice(6));
              if (d.text) fullText += d.text;
            } catch {}
          }
        }
        return fullText;
      }
      const data = await resp.json();
      return data.response || "";
    } catch {
      return "";
    }
  }

  /* ─── Agent Selection ───────────────────────────────────────────────── */

  const handleAgentSelect = useCallback(
    (agent: AgentConfig) => {
      setSlashMenuVisible(false);
      setSlashQuery("");
      setInput("");
      setMainView("chat");
      setFiles([]);

      let sid = activeId;
      if (!sid || (activeSession && activeSession.messages.length > 0)) {
        sid = createSession({ resetAgent: false }).id;
      }

      setSelectedAgent(agent);

      const CRED_AGENTS = ["data_agent", "campaign_setup", "boss"];
      const systemContent = CRED_AGENTS.includes(agent.id)
        ? `**${agent.name}** selected. ${agent.description}\n\nEnter your credentials below.`
        : `**${agent.name}** selected. ${agent.description}\n\nUpload your files and click Send to run this agent.`;

      addMessage(
        {
          id: uid(),
          role: "system",
          content: systemContent,
          timestamp: Date.now(),
          agent: agent.id,
        },
        sid,
      );
    },
    [activeId, activeSession, createSession, addMessage],
  );

  const selectAgentByCommand = useCallback(
    (command: string, options?: { focusInput?: boolean }) => {
      const agent = findAgentByCommand(command);
      if (!agent) return false;

      handleAgentSelect(agent);
      if (options?.focusInput) textareaRef.current?.focus();
      return true;
    },
    [handleAgentSelect],
  );

  const handleSlashSelect = useCallback(
    (agent: AgentConfig) => {
      handleAgentSelect(agent);
      textareaRef.current?.focus();
    },
    [handleAgentSelect],
  );

  /* ─── File handling ─────────────────────────────────────────────────── */

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const added = Array.from(e.target.files ?? []);
      setFiles((prev) => [...prev, ...added]);
      e.target.value = "";
    },
    [],
  );

  const removeFile = useCallback((idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  /* ─── Input handling with slash commands ────────────────────────────── */

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setInput(val);

      if (val.startsWith("/")) {
        const query = val.slice(1);
        setSlashQuery(query);
        setSlashMenuVisible(true);
      } else {
        setSlashMenuVisible(false);
        setSlashQuery("");
      }
    },
    [],
  );

  /* ─── Send ──────────────────────────────────────────────────────────── */

  const handleSend = useCallback(async () => {
    const text = input.trim();

    // Handle slash command submission
    if (text.startsWith("/") && !selectedAgent) {
      if (selectAgentByCommand(text)) {
        return;
      }
    }

    if (!text && files.length === 0) return;
    if (isLoading) return;

    const CRED_ONLY_AGENTS = ["data_agent", "campaign_setup", "boss"];
    if (selectedAgent && !CRED_ONLY_AGENTS.includes(selectedAgent.id) && files.length === 0) {
      let remindSid = activeId;
      if (!remindSid) {
        remindSid = createSession({ resetAgent: false }).id;
      }
      addMessage(
        {
          id: uid(),
          role: "system",
          content: `Upload the required files for **${selectedAgent.name}**, then click Send.`,
          timestamp: Date.now(),
          agent: selectedAgent.id,
        },
        remindSid,
      );
      return;
    }

    let sid = activeId;
    if (!sid) {
      const s = createSession();
      sid = s.id;
    }

    const fileNames = files.map((f) => f.name);
    const userMsg: Message = {
      id: uid(),
      role: "user",
      content: text || `Uploaded ${fileNames.join(", ")}`,
      timestamp: Date.now(),
      agent: selectedAgent?.id,
      files: fileNames.length > 0 ? fileNames : undefined,
    };
    addMessage(userMsg, sid);
    setInput("");
    setIsLoading(true);
    setLoadingSessionId(sid);

    // Agent-specific file uploads
    if (selectedAgent && files.length > 0) {
      const agentId = selectedAgent.id;
      const uploadFiles = [...files];
      setFiles([]);
      setSelectedAgent(null);

      if (!shouldUseGcsUpload(uploadFiles)) {
        try {
          assertDirectUploadSizeWithinLimit(uploadFiles);
        } catch (err) {
          addMessage(
            {
              id: uid(),
              role: "assistant",
              content: `Agent error: ${err instanceof Error ? err.message : "Upload too large"}`,
              timestamp: Date.now(),
              agent: agentId,
            },
            sid,
          );
          setIsLoading(false);
          setLoadingSessionId(null);
          return;
        }
      }

      addMessage(
        {
          id: uid(),
          role: "assistant",
          content: "",
          timestamp: Date.now(),
          isLoading: true,
          agent: agentId,
        },
        sid,
      );

      try {
        if (agentId === "data_agent") {
          await runDataAgentUpload(sid, uploadFiles);
        } else if (agentId === "monthly_reporter") {
          await runMonthlyReporter(sid, uploadFiles);
        } else if (
          ["deepdive", "marketingreco", "campaign_review"].includes(agentId)
        ) {
          await runAgentWithFiles(sid, agentId, uploadFiles, text);
        } else {
          await runAgentWithFiles(sid, agentId, uploadFiles, text);
        }
      } catch (err) {
        updateLastAssistant(
          `Agent error: ${err instanceof Error ? err.message : "Unknown error"}`,
          sid,
        );
      } finally {
        setIsLoading(false);
        setLoadingSessionId(null);
      }
      return;
    }

    setFiles([]);

    // Regular chat message — send to Gemini
    addMessage(
      {
        id: uid(),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        isLoading: true,
      },
      sid,
    );

    try {
      const session = sessions.find((s) => s.id === sid);
      const history = (session?.messages ?? [])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-20)
        .map((m) => ({
          role: m.role === "user" ? "user" : "model",
          content: m.content,
        }));

      const resp = await fetch(resolveAgentsApiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        const detail = String(err.detail || resp.statusText || "");
        if (resp.status === 503 && detail.toLowerCase().includes("rate-limit")) {
          throw new Error(
            "AI chat is temporarily rate-limited. Wait a minute and try again, or use agent tools (DeepDive, Monthly Report) which do not depend on chat.",
          );
        }
        throw new Error(detail || `Error ${resp.status}`);
      }

      const contentType = resp.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream")) {
        const reader = resp.body?.getReader();
        if (!reader) throw new Error("No response stream");
        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });

          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
            try {
              const d = JSON.parse(line.slice(6));
              if (d.text) {
                fullText += d.text;
                updateLastAssistant(fullText, sid);
              }
            } catch {}
          }
        }

        if (!fullText) {
          updateLastAssistant(
            "I couldn't generate a response. Please try again.",
            sid,
          );
        }
      } else {
        const data = await resp.json();
        updateLastAssistant(data.response || "No response received.", sid);
      }
    } catch (err) {
      updateLastAssistant(
        `Sorry, there was an error: ${err instanceof Error ? err.message : "Unknown error"}`,
        sid,
      );
    } finally {
      setIsLoading(false);
      setLoadingSessionId(null);
    }
  }, [
    input,
    files,
    isLoading,
    activeId,
    selectedAgent,
    sessions,
    createSession,
    addMessage,
    updateLastAssistant,
    selectAgentByCommand,
  ]);

  /* ─── Agent API helpers ─────────────────────────────────────────────── */

  async function runDataAgentUpload(sessionId: string, uploadFiles: File[]) {
    let ps = createProcessState("data_agent_upload");
    if (ps) ps = advanceStep(ps, "upload");
    updateLastAssistant("Uploading and processing your data...", sessionId, { processState: ps });
    try {
      const dataSid = await uploadFilesToSession(uploadFiles, {
        onProgress: (msg) => updateLastAssistant(msg, sessionId, { processState: ps }),
      });

      if (ps) ps = advanceStep(ps, "validate");
      updateLastAssistant("Validating datasets...", sessionId, { processState: ps });

      const rawOutput = `Data uploaded successfully. Session ID: ${dataSid}. Datasets validated and ready for analysis.`;
      const aiSummary = await summarizeWithLLM(rawOutput);

      if (ps) ps = completeAll(ps);
      updateLastAssistant(
        `Data uploaded successfully!\n\n**Session ID:** \`${dataSid}\`\n\nYou can now use **DeepDive**, **Marketing**, or other agents to analyze this data.`,
        sessionId,
        { agentResult: { type: "data_upload", sessionId: dataSid, aiSummary: aiSummary || undefined }, processState: ps },
      );
    } catch (err) {
      if (ps) {
        const cur = ps.steps.find((s) => s.status === "running");
        if (cur) ps = failStep(ps, cur.id, err instanceof Error ? err.message : "Unknown error");
      }
      updateLastAssistant(
        `Failed to upload data: ${err instanceof Error ? err.message : "Unknown error"}`,
        sessionId,
        { processState: ps },
      );
    }
  }

  async function runDataAgentAutopilot(
    sessionId: string,
    creds: { email: string; password: string; startDate: string; endDate: string },
  ) {
    let ps = createProcessState("data_agent_autopilot");
    if (ps) ps = advanceStep(ps, "login");
    updateLastAssistant(
      "Starting browser session... Logging in to DoorDash Merchant Portal.",
      sessionId,
      { processState: ps },
    );
    try {
      const fmtDate = (iso: string) => {
        const [y, m, d] = iso.split("-");
        return `${m}/${d}/${y}`;
      };
      const fd = new FormData();
      fd.append("operator_id", sessionUser?.id || "chat-upload");
      fd.append("operator_name", sessionUser?.email || "Chat Upload");
      fd.append("mode", "autopilot");
      fd.append("doordash_email", creds.email);
      fd.append("doordash_password", creds.password);
      fd.append("start_date", fmtDate(creds.startDate));
      fd.append("end_date", fmtDate(creds.endDate));

      if (ps) ps = advanceStep(ps, "navigate");
      updateLastAssistant("Navigating to reports...", sessionId, { processState: ps });

      if (ps) ps = advanceStep(ps, "download");
      updateLastAssistant("Downloading financial reports... This may take 5-15 minutes.", sessionId, { processState: ps });

      const resp = await fetchAgentsApi("/api/sessions", {
        method: "POST",
        body: fd,
        timeoutKind: "agent_run",
      });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(
          formatApiErrorDetail(
            (e as { detail?: unknown }).detail,
            `Data pull failed: ${resp.status}`,
          ),
        );
      }
      const result = await resp.json();
      const dataSid = result.session_id;
      const datasets = result.datasets || [];
      const status = result.status;

      if (status === "download_failed") {
        if (ps) ps = failStep(ps, "download", result.message || "Could not download reports");
        updateLastAssistant(
          `Browser session failed: ${result.message || "Could not download reports. Check your credentials and try again."}`,
          sessionId,
          { processState: ps },
        );
        return;
      }

      if (ps) ps = advanceStep(ps, "validate");
      updateLastAssistant("Validating datasets...", sessionId, { processState: ps });

      if (ps) ps = completeAll(ps);
      updateLastAssistant(
        `Data pulled successfully!\n\n**Session ID:** \`${dataSid}\`\n**Datasets:** ${datasets.length > 0 ? datasets.join(", ") : "None found"}\n\nYou can now use **DeepDive**, **Marketing**, or other agents to analyze this data.`,
        sessionId,
        { agentResult: { type: "data_upload", sessionId: dataSid }, processState: ps },
      );
    } catch (err) {
      if (ps) {
        const cur = ps.steps.find((s) => s.status === "running");
        if (cur) ps = failStep(ps, cur.id, err instanceof Error ? err.message : "Unknown error");
      }
      updateLastAssistant(
        `Data pull failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        sessionId,
        { processState: ps },
      );
    }
  }

  async function runCampaignSetupWithFiles(
    sessionId: string,
    creds: { email: string; password: string; files: File[] },
  ) {
    let ps = createProcessState("campaign_setup");
    if (ps) ps = advanceStep(ps, "upload");
    updateLastAssistant("Uploading campaign input files...", sessionId, { processState: ps });
    try {
      const dataSid = await uploadFilesToSession(creds.files, {
        onProgress: (msg) => updateLastAssistant(msg, sessionId, { processState: ps }),
      });

      if (ps) ps = advanceStep(ps, "session");
      updateLastAssistant("Creating data session...", sessionId, { processState: ps });

      if (ps) ps = advanceStep(ps, "run");
      updateLastAssistant("Starting campaign setup... This may take 10-30 minutes.", sessionId, { processState: ps });

      const fd = new FormData();
      fd.append("doordash_email", creds.email);
      fd.append("doordash_password", creds.password);

      const resp = await fetchAgentsApi(
        `/api/sessions/${encodeURIComponent(dataSid)}/run/campaign-setup`,
        { method: "POST", body: fd, timeoutKind: "agent_run" },
      );
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(
          formatApiErrorDetail(
            (e as { detail?: unknown }).detail,
            `Campaign setup failed: ${resp.status}`,
          ),
        );
      }
      const result = await resp.json();
      const offersStatus = result.offers?.status || "skipped";
      const adsStatus = result.ads?.status || "skipped";

      if (ps) ps = advanceStep(ps, "offers");
      if (offersStatus === "failed") {
        ps = failStep(ps!, "offers", "Offers creation failed");
      }

      if (ps && ps.overallStatus !== "failed") {
        ps = advanceStep(ps, "ads");
        if (adsStatus === "failed") {
          ps = failStep(ps, "ads", "Ads setup failed");
        }
      }

      if (ps) ps = advanceStep(ps, "summarize");
      updateLastAssistant("Creating summary...", sessionId, { processState: ps });

      const rawOutput = `Campaign setup complete. Offers: ${offersStatus}. Ads: ${adsStatus}.`;
      const aiSummary = await summarizeWithLLM(rawOutput);

      if (ps) ps = completeAll(ps);
      updateLastAssistant(rawOutput, sessionId, {
        agentResult: {
          type: "campaign_setup",
          runId: result.run_id,
          sessionId: dataSid,
          bossSteps: {
            offers: { status: offersStatus, summary: `Promo offers: ${offersStatus}` },
            ads: { status: adsStatus, summary: `Sponsored listings: ${adsStatus}` },
          },
          aiSummary: aiSummary || undefined,
        },
        processState: ps,
      });
    } catch (err) {
      if (ps) {
        const cur = ps.steps.find((s) => s.status === "running");
        if (cur) ps = failStep(ps, cur.id, err instanceof Error ? err.message : "Unknown error");
      }
      updateLastAssistant(
        `Campaign setup failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        sessionId,
        { processState: ps },
      );
    }
  }

  async function runBossAgentWithFiles(
    sessionId: string,
    creds: { email: string; password: string; files: File[] },
  ) {
    let ps = createProcessState("boss");
    if (ps) ps = advanceStep(ps, "data");
    updateLastAssistant(
      "Starting data download from DoorDash... This may take 5-15 minutes.",
      sessionId,
      { processState: ps },
    );
    try {
      const fd = new FormData();
      fd.append("doordash_email", creds.email);
      fd.append("doordash_password", creds.password);

      const resp = await fetchAgentsApi(
        "/api/run/boss",
        { method: "POST", body: fd, timeoutKind: "agent_run" },
      );
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(
          formatApiErrorDetail(
            (e as { detail?: unknown }).detail,
            `Boss agent failed: ${resp.status}`,
          ),
        );
      }
      const result = await resp.json();
      const stepsCompleted: string[] = result.steps_completed || [];
      const stepsFailed: string[] = result.steps_failed || [];

      if (ps) {
        const stepMap: Record<string, string> = {
          data: "data",
          deepdive: "deepdive",
          marketingreco: "marketingreco",
          campaign_setup: "campaign_setup",
        };
        for (const done of stepsCompleted) {
          const mapped = stepMap[done];
          if (mapped) {
            ps = advanceStep(ps, mapped);
            ps = completeAll({ ...ps, steps: ps.steps.map((s) => s.id === mapped ? { ...s, status: "success" as const, completedAt: Date.now() } : s), overallStatus: "running" });
          }
        }
        for (const fail of stepsFailed) {
          const mapped = stepMap[fail];
          if (mapped) {
            ps = failStep(ps, mapped, `${fail} failed`);
          }
        }
        if (!stepsFailed.length) ps = completeAll(ps);
      }

      const rawOutput = `Pipeline ${result.status}. Completed: ${stepsCompleted.join(", ") || "none"}. ${stepsFailed.length ? `Failed: ${stepsFailed.join(", ")}` : ""}`;
      const aiSummary = await summarizeWithLLM(rawOutput);

      updateLastAssistant(rawOutput, sessionId, {
        agentResult: {
          type: "boss",
          runId: result.run_id,
          sessionId: result.session_id,
          bossSteps: result.step_results,
          aiSummary: aiSummary || undefined,
        },
        processState: ps,
      });
    } catch (err) {
      if (ps) {
        const cur = ps.steps.find((s) => s.status === "running");
        if (cur) ps = failStep(ps, cur.id, err instanceof Error ? err.message : "Unknown error");
      }
      updateLastAssistant(
        `Pipeline failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        sessionId,
        { processState: ps },
      );
    }
  }

  async function runMonthlyReporter(
    sessionId: string,
    uploadFiles: File[],
  ) {
    let ps = createProcessState("monthly_reporter");
    if (ps) ps = advanceStep(ps, "upload");
    updateLastAssistant("Starting monthly report…", sessionId, { processState: ps });
    try {
      if (ps) ps = advanceStep(ps, "merge");
      const result = await runMonthlyReporterWithFiles(uploadFiles, (msg) =>
        updateLastAssistant(msg, sessionId, { processState: ps }),
      );

      if (ps) ps = advanceStep(ps, "kpis");
      updateLastAssistant("Calculating KPIs...", sessionId, { processState: ps });

      const previewTables: Record<string, PreviewTableData> = {};
      if (result.preview && typeof result.preview === "object") {
        const preview = result.preview as { tables?: Record<string, PreviewTableData> };
        if (preview.tables) {
          for (const [key, t] of Object.entries(preview.tables)) {
            previewTables[key] = t;
          }
        }
      }

      if (ps) ps = advanceStep(ps, "excel");
      updateLastAssistant("Generating Excel report...", sessionId, { processState: ps });

      const summaryText =
        typeof result.summary_text === "string" ? result.summary_text : undefined;
      const rawOutput = summaryText || "Monthly report generated with KPI data.";

      if (ps) ps = advanceStep(ps, "summarize");
      updateLastAssistant("Creating AI summary...", sessionId, { processState: ps });

      if (ps) ps = completeAll(ps);
      updateLastAssistant(
        summaryText || "Monthly report generated!",
        sessionId,
        {
          agentResult: {
            type: "monthly_reporter",
            runId: typeof result.run_id === "string" ? result.run_id : undefined,
            summaryText,
            tables:
              Object.keys(previewTables).length > 0 ? previewTables : undefined,
            downloads:
              result.downloads && typeof result.downloads === "object"
                ? (result.downloads as Record<string, string>)
                : undefined,
          },
          processState: ps,
        },
      );
      void summarizeWithLLM(rawOutput).then((aiSummary) => {
        if (!aiSummary) return;
        updateLastAssistant(
          summaryText || "Monthly report generated!",
          sessionId,
          {
            agentResult: {
              type: "monthly_reporter",
              runId: typeof result.run_id === "string" ? result.run_id : undefined,
              summaryText,
              tables:
                Object.keys(previewTables).length > 0 ? previewTables : undefined,
              downloads:
                result.downloads && typeof result.downloads === "object"
                  ? (result.downloads as Record<string, string>)
                  : undefined,
              aiSummary,
            },
            processState: ps,
          },
        );
      });
    } catch (err) {
      if (ps) {
        const cur = ps.steps.find((s) => s.status === "running");
        if (cur) ps = failStep(ps, cur.id, err instanceof Error ? err.message : "Unknown error");
      }
      updateLastAssistant(
        `Failed to generate report: ${err instanceof Error ? err.message : "Unknown error"}`,
        sessionId,
        { processState: ps },
      );
    }
  }

  async function runAgentWithFiles(
    sessionId: string,
    agentType: string,
    uploadFiles: File[],
    userText: string,
  ) {
    const agentLabel = AGENT_REGISTRY.find((a) => a.id === agentType)?.name || agentType;
    let ps = createProcessState(agentType);
    if (ps) ps = advanceStep(ps, "upload");
    updateLastAssistant(`Uploading files for ${agentLabel}...`, sessionId, { processState: ps });
    try {
      const dataSid = await uploadFilesToSession(uploadFiles, {
        onProgress: (msg) => updateLastAssistant(msg, sessionId, { processState: ps }),
      });

      const analyzeStepId =
        agentType === "deepdive" ? "parse" :
        agentType === "marketingreco" ? "analyze" :
        agentType === "campaign_review" ? "load" : "upload";
      if (ps && analyzeStepId !== "upload") ps = advanceStep(ps, analyzeStepId);
      updateLastAssistant(
        `Running ${agentLabel}... This may take several minutes.`,
        sessionId,
        { processState: ps },
      );

      const agentSlug =
        agentType === "campaign_review" ? "campaign-review" : agentType;
      const data = await runSessionAgent(dataSid, agentSlug);

      if (agentType === "deepdive") {
        if (ps) ps = advanceStep(ps, "analyze");
        updateLastAssistant("Running analysis...", sessionId, { processState: ps });

        let reportHtml: string | undefined;
        const reportUrl =
          data.report_url ||
          (data.run_id ? `/api/runs/deepdive/${data.run_id}/report` : undefined);
        if (reportUrl) {
          try {
            if (ps) ps = advanceStep(ps, "report");
            updateLastAssistant("Generating report...", sessionId, { processState: ps });
            const htmlRes = await fetch(resolveAgentsApiUrl(reportUrl));
            if (htmlRes.ok) reportHtml = await htmlRes.text();
          } catch {}
        }
        const execInsights = data.sections?.executive_summary?.insights as
          | string[]
          | undefined;
        const rawOutput =
          data.summary ||
          (execInsights?.length
            ? execInsights.map((i) => `• ${i}`).join("\n")
            : "DeepDive analysis complete.");

        if (ps) ps = advanceStep(ps, "summarize");
        updateLastAssistant("Creating AI summary...", sessionId, { processState: ps });
        const aiSummary = await summarizeWithLLM(rawOutput);

        if (ps) ps = completeAll(ps);
        updateLastAssistant(rawOutput, sessionId, {
          agentResult: {
            type: "deepdive",
            runId: data.run_id,
            reportHtml,
            summaryText: rawOutput,
            aiSummary: aiSummary || undefined,
            slotTables: data.slot_tables || undefined,
            downloads:
              data.downloads ||
              (reportUrl ? { "HTML Report": reportUrl } : undefined),
          },
          processState: ps,
        });
      } else if (agentType === "marketingreco") {
        if (ps) ps = advanceStep(ps, "plan");
        updateLastAssistant("Building campaign plan...", sessionId, { processState: ps });

        const planCount = data.campaign_plan?.length || data.recommended_campaigns?.length || 0;
        const adsCount = data.ads_table?.length || 0;

        if (ps) ps = advanceStep(ps, "ads");
        updateLastAssistant("Generating ads table...", sessionId, { processState: ps });

        if (ps) ps = advanceStep(ps, "summarize");
        updateLastAssistant("Creating AI summary...", sessionId, { processState: ps });

        const rawOutput = `Marketing recommendations ready. ${planCount} campaigns planned${adsCount ? `, ${adsCount} ad slots identified` : ""}.`;
        const aiSummary = await summarizeWithLLM(rawOutput);

        if (ps) ps = completeAll(ps);
        updateLastAssistant(rawOutput, sessionId, {
          agentResult: {
            type: "marketingreco",
            runId: data.run_id,
            campaignPlan: data.campaign_plan,
            adsTable: data.ads_table,
            campaigns: data.recommended_campaigns,
            slotTables: data.slot_tables || undefined,
            downloads: data.downloads,
            aiSummary: aiSummary || undefined,
          },
          processState: ps,
        });
      } else if (agentType === "campaign_review") {
        if (ps) ps = advanceStep(ps, "compare");
        updateLastAssistant("Comparing pre/post metrics...", sessionId, { processState: ps });

        const sm = data.summary_metrics || {};
        const campaignPerf: Record<string, unknown>[] = [];
        const nameMetrics = sm.campaign_metrics_by_name || {};
        for (const [name, m] of Object.entries(nameMetrics)) {
          const met = m as Record<string, unknown>;
          campaignPerf.push({
            campaign: name,
            orders: met.orders,
            sales: met.sales,
            spend: met.spend,
            roas: met.roas,
            aov: met.avg_order_value,
            cost_per_order: met.cost_per_order,
            ctr_pct: met.ctr_pct,
            conversion_pct: met.conversion_rate_pct,
            new_customers: met.new_customers,
          });
        }

        if (ps) ps = advanceStep(ps, "recommend");
        updateLastAssistant("Generating recommendations...", sessionId, { processState: ps });

        if (ps) ps = advanceStep(ps, "summarize");
        updateLastAssistant("Creating AI summary...", sessionId, { processState: ps });

        const rawOutput = data.notes || "Campaign review complete.";
        const aiSummary = await summarizeWithLLM(rawOutput);

        if (ps) ps = completeAll(ps);
        updateLastAssistant(rawOutput, sessionId, {
          agentResult: {
            type: "campaign_review",
            runId: data.run_id,
            campaignReviews: data.campaign_reviews,
            summaryMetrics: {
              promo: sm.promo,
              sponsored_listing: sm.sponsored_listing,
              combined: sm.combined,
            },
            campaignPerformance: campaignPerf.length ? campaignPerf : undefined,
            campaignComparison: sm.campaign_comparison,
            notes: data.notes,
            aiSummary: aiSummary || undefined,
            downloads: data.downloads,
          },
          processState: ps,
        });
      } else {
        if (ps) ps = completeAll(ps);
        const rawOutput = JSON.stringify(data, null, 2).slice(0, 2000);
        const aiSummary = await summarizeWithLLM(rawOutput);
        updateLastAssistant(rawOutput, sessionId, {
          agentResult: {
            type: "boss",
            runId: data.run_id,
            bossSteps: data.steps,
            aiSummary: aiSummary || undefined,
            downloads: data.downloads,
          },
          processState: ps,
        });
      }
    } catch (err) {
      if (ps) {
        const cur = ps.steps.find((s) => s.status === "running");
        if (cur) ps = failStep(ps, cur.id, err instanceof Error ? err.message : "Unknown error");
      }
      updateLastAssistant(
        `Agent error: ${err instanceof Error ? err.message : "Unknown error"}`,
        sessionId,
        { processState: ps },
      );
    }
  }

  /* ─── Keyboard ──────────────────────────────────────────────────────── */

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (slashMenuVisible) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend, slashMenuVisible],
  );

  /* ─── Drag & Drop ──────────────────────────────────────────────────── */

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      setFiles((prev) => [...prev, ...droppedFiles]);
    }
  }, []);

  /* ─── Render ────────────────────────────────────────────────────────── */

  return (
    <div
      className="flex h-screen bg-[#141416] text-gray-200 font-sans overflow-hidden"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* ── Mobile sidebar overlay ── */}
      {mobileSidebar && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileSidebar(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`
          fixed lg:relative z-50 lg:z-auto h-full
          ${mobileSidebar ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          ${sidebarOpen ? "w-72" : "lg:w-0"}
          transition-all duration-200 bg-[#0f0f11] border-r border-[#1e1e22] flex flex-col overflow-hidden shrink-0
        `}
      >
        {/* Logo + New Chat */}
        <div className="p-4 border-b border-[#1e1e22] min-w-[286px]">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#FF6B35] to-[#FF8C42] flex items-center justify-center">
              <Sparkles size={16} className="text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight text-white">
              RES<span className="text-[#FF6B35]">GRO</span>
              <span className="text-[10px] font-normal text-gray-600 ml-1 uppercase tracking-widest">
                AI
              </span>
            </span>
          </div>
          <button
            onClick={() => createSession()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#FF6B35] hover:bg-[#FF8C42] text-white text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            New Chat
          </button>
        </div>

        {/* Sidebar tabs */}
        <div className="flex border-b border-[#1e1e22] min-w-[286px]">
          <button
            onClick={() => setSidebarView("chats")}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              sidebarView === "chats"
                ? "text-[#FF6B35] border-b-2 border-[#FF6B35]"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            Chats
          </button>
          <button
            onClick={() => setSidebarView("agents")}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              sidebarView === "agents"
                ? "text-[#FF6B35] border-b-2 border-[#FF6B35]"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            Agents
          </button>
        </div>

        {/* Sidebar content */}
        <div className="flex-1 overflow-y-auto min-w-[286px]">
          {sidebarView === "chats" ? (
            <div className="p-2 space-y-0.5">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                    session.id === activeId && mainView === "chat"
                      ? "bg-[#1e1e22] text-white"
                      : "text-gray-400 hover:bg-[#141416] hover:text-gray-200"
                  }`}
                  onClick={() => {
                    setActiveId(session.id);
                    setSelectedAgent(null);
                    setFiles([]);
                    setMainView("chat");
                    setMobileSidebar(false);
                  }}
                >
                  <MessageSquare size={14} className="shrink-0 opacity-60" />
                  <span className="flex-1 text-sm truncate">
                    {session.title}
                  </span>
                  {isLoading && loadingSessionId === session.id ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        stopSession();
                      }}
                      className="text-red-400 hover:text-red-300 transition-colors p-1"
                      title="Stop agent"
                    >
                      <Square size={12} fill="currentColor" />
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(session.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all p-1"
                      title="Delete chat"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
              {sessions.length === 0 && (
                <p className="text-xs text-gray-600 text-center mt-8 px-4">
                  No conversations yet.
                  <br />
                  Start a new chat or select an agent.
                </p>
              )}
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {AGENT_REGISTRY.map((agent) => {
                const Icon = agent.icon;
                return (
	                  <button
	                    key={agent.id}
	                    onClick={() => {
	                      selectAgentByCommand(agent.command, {
	                        focusInput: true,
	                      });
	                      setMobileSidebar(false);
	                    }}
	                    className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors hover:bg-[#1e1e22]"
	                  >
                    <div
                      className={`w-8 h-8 rounded-lg bg-gradient-to-br ${agent.color} flex items-center justify-center shrink-0 mt-0.5`}
                    >
                      <Icon size={14} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">
                          {agent.name}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 line-clamp-1 mt-0.5">
                        {agent.description}
                      </p>
                      <code className="text-[10px] text-gray-600 bg-[#1a1a1e] px-1.5 py-0.5 rounded mt-1 inline-block">
                        {agent.command}
                      </code>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom nav */}
        <div className="border-t border-[#1e1e22] p-2 space-y-0.5 min-w-[286px]">
          {subscription && sessionUser && (
            <>
              <button
                onClick={() => {
                  setMainView("profile");
                  setMobileSidebar(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  mainView === "profile"
                    ? "bg-[#1e1e22] text-white"
                    : "text-gray-500 hover:text-gray-300 hover:bg-[#141416]"
                }`}
              >
                <User size={14} />
                Profile
              </button>
              <button
                onClick={() => {
                  setMainView("billing");
                  setMobileSidebar(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  mainView === "billing"
                    ? "bg-[#1e1e22] text-white"
                    : "text-gray-500 hover:text-gray-300 hover:bg-[#141416]"
                }`}
              >
                <CreditCard size={14} />
                Billing
              </button>
              {isAdminUser && (
                <button
                  onClick={() => {
                    window.location.href = getDjangoAdminUrl();
                    setMobileSidebar(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-300 hover:bg-[#141416] transition-colors"
                >
                  <Users size={14} />
                  Admin
                </button>
              )}
            </>
          )}
          <button
            onClick={() => {
              setMainView("help");
              setMobileSidebar(false);
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              mainView === "help"
                ? "bg-[#1e1e22] text-white"
                : "text-gray-500 hover:text-gray-300 hover:bg-[#141416]"
            }`}
          >
            <HelpCircle size={14} />
            Help
          </button>
          {onLogout && (
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-red-400 hover:bg-red-500/5 transition-colors"
            >
              <LogOut size={14} />
              Logout
            </button>
          )}
          {onBack && !onLogout && (
            <button
              onClick={onBack}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-300 hover:bg-[#141416] transition-colors"
            >
              <ArrowLeft size={14} />
              Back to Portal
            </button>
          )}
        </div>
      </aside>

      {/* ── Main Area ── */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#1a1a1e]">
        {/* Header */}
        <header className="h-14 border-b border-[#2a2a2e] flex items-center px-4 shrink-0 bg-[#1a1a1e]">
          <button
            onClick={() => {
              if (window.innerWidth < 1024) {
                setMobileSidebar(!mobileSidebar);
              } else {
                setSidebarOpen(!sidebarOpen);
              }
            }}
            className="p-2 rounded-lg hover:bg-[#2a2a2e] text-gray-400 hover:text-white transition-colors"
          >
            <Menu size={18} />
          </button>
          <div className="ml-3 flex items-center gap-2 min-w-0">
            {mainView === "chat" ? (
              <>
                <Sparkles size={16} className="text-[#FF6B35] shrink-0" />
                <span className="text-sm font-medium text-white truncate">
                  {activeSession?.title || "ResGro AI"}
                </span>
              </>
            ) : mainView === "profile" ? (
              <>
                <User size={16} className="text-[#FF6B35] shrink-0" />
                <span className="text-sm font-medium text-white">Profile</span>
              </>
            ) : mainView === "billing" ? (
              <>
                <CreditCard size={16} className="text-[#FF6B35] shrink-0" />
                <span className="text-sm font-medium text-white">Billing</span>
              </>
            ) : (
              <>
                <HelpCircle size={16} className="text-[#FF6B35] shrink-0" />
                <span className="text-sm font-medium text-white">Help</span>
              </>
            )}
          </div>
          {mainView !== "chat" && (
            <button
              onClick={() => setMainView("chat")}
              className="ml-auto px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-[#2a2a2e] transition-colors"
            >
              Back to Chat
            </button>
          )}
          {mainView === "chat" && selectedAgent && (
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gradient-to-r ${selectedAgent.color} text-white`}
              >
                <selectedAgent.icon size={12} />
                {selectedAgent.name}
              </span>
              <button
                onClick={() => setSelectedAgent(null)}
                className="p-1 rounded hover:bg-[#2a2a2e] text-gray-500 hover:text-white transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </header>

        {/* Main Content */}
        {mainView === "profile" && subscription && sessionUser ? (
          <ProfilePanel subscription={subscription} sessionUser={sessionUser} />
        ) : mainView === "billing" && subscription && sessionUser ? (
          <BillingPanel subscription={subscription} sessionUser={sessionUser} />
        ) : mainView === "help" ? (
          <HelpPanel />
        ) : (
          <>
            {/* Messages or Welcome */}
            <div className="flex-1 overflow-y-auto">
              {messages.length === 0 && !selectedAgent ? (
                <WelcomeScreen
                  onAgentSelect={handleAgentSelect}
                  onSuggestionClick={(text) => {
                    setInput(text);
                    textareaRef.current?.focus();
                  }}
                  userName={
                    sessionUser?.metadata.businessName?.trim() || "there"
                  }
                />
              ) : awaitingAgentUpload && selectedAgent?.id === "data_agent" ? (
                <DataPullForm
                  onDismiss={() => setSelectedAgent(null)}
                  onSubmit={(creds) => {
                    let sid = activeId;
                    if (!sid) {
                      const s = createSession();
                      sid = s.id;
                    }
                    addMessage(
                      {
                        id: uid(),
                        role: "user",
                        content: `Pull DoorDash data for **${creds.email}** from ${creds.startDate} to ${creds.endDate}`,
                        timestamp: Date.now(),
                        agent: "data_agent",
                      },
                      sid,
                    );
                    setSelectedAgent(null);
                    setIsLoading(true);
                    setLoadingSessionId(sid);
                    addMessage(
                      {
                        id: uid(),
                        role: "assistant",
                        content: "",
                        timestamp: Date.now(),
                        isLoading: true,
                        agent: "data_agent",
                      },
                      sid,
                    );
                    runDataAgentAutopilot(sid, creds).finally(() => {
                      setIsLoading(false);
                      setLoadingSessionId(null);
                    }
                    );
                  }}
                />
              ) : awaitingAgentUpload && (selectedAgent?.id === "campaign_setup" || selectedAgent?.id === "boss") ? (
                <CampaignCredentialForm
                  agentId={selectedAgent.id}
                  onDismiss={() => setSelectedAgent(null)}
                  onSubmit={(creds) => {
                    const agentId = selectedAgent!.id;
                    const agentName = selectedAgent!.name;
                    let sid = activeId;
                    if (!sid) {
                      const s = createSession();
                      sid = s.id;
                    }
                    const fileNames = creds.files.map((f) => f.name);
                    addMessage(
                      {
                        id: uid(),
                        role: "user",
                        content: agentId === "boss"
                          ? `Run **${agentName}** for **${creds.email}**`
                          : `Run **${agentName}** for **${creds.email}** with ${fileNames.join(", ")}`,
                        timestamp: Date.now(),
                        agent: agentId,
                        files: fileNames.length > 0 ? fileNames : undefined,
                      },
                      sid,
                    );
                    setSelectedAgent(null);
                    setIsLoading(true);
                    setLoadingSessionId(sid);
                    addMessage(
                      {
                        id: uid(),
                        role: "assistant",
                        content: "",
                        timestamp: Date.now(),
                        isLoading: true,
                        agent: agentId,
                      },
                      sid,
                    );
                    const handler = agentId === "boss"
                      ? runBossAgentWithFiles(sid, creds)
                      : runCampaignSetupWithFiles(sid, creds);
                    handler.finally(() => {
                      setIsLoading(false);
                      setLoadingSessionId(null);
                    });
                  }}
                />
              ) : awaitingAgentUpload ? (
                <div className="flex flex-col items-center justify-center h-full px-6 max-w-2xl mx-auto">
                  <UploadRequirementsCard
                    agent={selectedAgent}
                    onDismiss={() => setSelectedAgent(null)}
                    onUploadClick={() => fileInputRef.current?.click()}
                    filesAttached={files.length}
                  />
                </div>
              ) : (
                <div className="mx-auto px-4 py-6 space-y-4" style={{ maxWidth: "64rem" }}>
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""} ${msg.role === "system" ? "justify-center" : ""}`}
                    >
                      {msg.role === "system" ? (
                        <div className="px-4 py-2.5 rounded-xl bg-[#2a2a2e]/60 border border-[#333338] max-w-lg">
                          <p
                            className="text-xs text-gray-400"
                            dangerouslySetInnerHTML={{
                              __html: renderMarkdown(msg.content),
                            }}
                          />
                        </div>
                      ) : msg.role === "user" ? (
                        <div className="max-w-[75%]">
                          {msg.files && msg.files.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-1.5 justify-end">
                              {msg.files.map((f, i) => (
                                <span
                                  key={`${f}-${i}`}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FF6B35]/15 text-[#FF6B35] text-xs"
                                >
                                  <Paperclip size={10} />
                                  {f}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="px-4 py-2.5 rounded-2xl rounded-br-md bg-[#FF6B35] text-white text-sm whitespace-pre-wrap">
                            {msg.content}
                          </div>
                        </div>
                      ) : (
                        <div className={`flex gap-3 ${msg.agentResult ? "max-w-full w-full" : "max-w-[85%]"}`}>
                          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#FF6B35] to-[#FF8C42] flex items-center justify-center shrink-0 mt-0.5">
                            <Bot size={14} className="text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            {msg.isLoading && !msg.content && !msg.processState ? (
                              <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
                                <Loader2
                                  size={14}
                                  className="animate-spin"
                                />
                                <span className="animate-pulse">
                                  {msg.agent
                                    ? `Running ${AGENT_REGISTRY.find((a) => a.id === msg.agent)?.name || msg.agent}...`
                                    : "Thinking..."}
                                </span>
                              </div>
                            ) : (
                              <>
                                {msg.processState && (
                                  <ProcessPanel state={msg.processState} />
                                )}
                                {msg.content && (
                                  <div
                                    className="text-sm text-gray-200 leading-relaxed"
                                    dangerouslySetInnerHTML={{
                                      __html: renderMarkdown(msg.content),
                                    }}
                                  />
                                )}
                                {msg.agentResult && (
                                  <AgentResultCard
                                    result={msg.agentResult}
                                  />
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Upload Requirements Card (compact, after user has started the thread) */}
            {selectedAgent && !awaitingAgentUpload && selectedAgent.id !== "data_agent" && (
              <div className="max-w-3xl mx-auto w-full px-4 pb-2">
                <UploadRequirementsCard
                  agent={selectedAgent}
                  onDismiss={() => setSelectedAgent(null)}
                  onUploadClick={() => fileInputRef.current?.click()}
                  filesAttached={files.length}
                />
              </div>
            )}

            {/* ── Input Area ── */}
            <div className="border-t border-[#2a2a2e] p-4 shrink-0 bg-[#1a1a1e]">
              <div className="max-w-3xl mx-auto">
                {/* File previews */}
                {files.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {files.map((file, idx) => (
                      <div
                        key={`${file.name}-${idx}`}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#2a2a2e] border border-[#333338] text-xs"
                      >
                        <Upload size={12} className="text-[#FF6B35]" />
                        <span className="text-gray-300 max-w-[150px] truncate">
                          {file.name}
                        </span>
                        <button
                          onClick={() => removeFile(idx)}
                          className="text-gray-500 hover:text-red-400 transition-colors"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Text input with slash command menu */}
                <div className="relative">
                  <SlashCommandMenu
                    query={slashQuery}
                    onSelect={handleSlashSelect}
                    onClose={() => {
                      setSlashMenuVisible(false);
                      setSlashQuery("");
                    }}
                    visible={slashMenuVisible}
                  />
                  <div className="bg-[#242428] rounded-2xl border border-[#333338] focus-within:border-[#FF6B35]/40 transition-colors">
                    <textarea
                      ref={textareaRef}
                      value={input}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      placeholder={
                        selectedAgent
                          ? `Upload files for ${selectedAgent.name} and press Send`
                          : "Message ResGro AI... (type / for agents)"
                      }
                      rows={1}
                      className="w-full bg-transparent text-white placeholder-gray-500 text-sm px-4 pt-3 pb-1 resize-none outline-none max-h-[200px]"
                      disabled={isLoading}
                    />
                    <div className="flex items-center justify-between px-3 pb-2">
                      <div className="flex items-center gap-1">
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          accept=".csv,.zip,.xlsx,.pdf,.docx"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-[#333338] transition-colors"
                          title="Upload files"
                        >
                          <Paperclip size={16} />
                        </button>
                        <button
                          onClick={() => {
                            setSlashMenuVisible(true);
                            setSlashQuery("");
                            setInput("/");
                            textareaRef.current?.focus();
                          }}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-[#333338] transition-colors"
                          title="Select agent"
                        >
                          <Layers size={16} />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedAgent && (
                          <span className="text-[10px] text-gray-500 hidden sm:block">
                            {selectedAgent.command}
                          </span>
                        )}
                        <button
                          onClick={handleSend}
                          disabled={
                            isLoading || (!input.trim() && files.length === 0)
                          }
                          className="p-2 rounded-xl bg-[#FF6B35] hover:bg-[#FF8C42] disabled:opacity-30 disabled:hover:bg-[#FF6B35] text-white transition-colors"
                        >
                          {isLoading ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Send size={16} />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/* ─── Data Pull Form ─────────────────────────────────────────────────────── */

function DataPullForm({
  onSubmit,
  onDismiss,
}: {
  onSubmit: (data: {
    email: string;
    password: string;
    startDate: string;
    endDate: string;
  }) => void;
  onDismiss: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(0);
    return d.toISOString().slice(0, 10);
  });

  const canSubmit = email.trim() && password && startDate && endDate;

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 max-w-lg mx-auto">
      <div className="w-full rounded-2xl border border-[#2a2a2e] bg-[#1e1e22] p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center">
              <Database size={18} className="text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                Pull Financial Data
              </h3>
              <p className="text-[11px] text-gray-500">
                Auto-login to DoorDash &amp; download reports
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="p-1.5 rounded-lg hover:bg-[#2a2a2e] text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              DoorDash Email
            </label>
            <div className="relative">
              <Mail
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="merchant@example.com"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#16161a] border border-[#2a2a2e] text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#FF6B35]/50 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              DoorDash Password
            </label>
            <div className="relative">
              <Lock
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#16161a] border border-[#2a2a2e] text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#FF6B35]/50 transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Start Date
              </label>
              <div className="relative">
                <Calendar
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
                />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#16161a] border border-[#2a2a2e] text-sm text-white focus:outline-none focus:border-[#FF6B35]/50 transition-colors [color-scheme:dark]"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                End Date
              </label>
              <div className="relative">
                <Calendar
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#16161a] border border-[#2a2a2e] text-sm text-white focus:outline-none focus:border-[#FF6B35]/50 transition-colors [color-scheme:dark]"
                />
              </div>
            </div>
          </div>
        </div>

        <button
          disabled={!canSubmit}
          onClick={() =>
            canSubmit &&
            onSubmit({
              email: email.trim(),
              password,
              startDate,
              endDate,
            })
          }
          className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[#FF6B35] to-[#FF8C42] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          <Download size={14} />
          Pull Reports
        </button>

        <p className="mt-3 text-[10px] text-gray-600 text-center">
          A browser session will open to log in and download your reports
          automatically. This may take 5–15 minutes.
        </p>
      </div>
    </div>
  );
}

/* ─── Campaign / Boss Credential Form ────────────────────────────────────── */

function CampaignCredentialForm({
  agentId,
  onSubmit,
  onDismiss,
}: {
  agentId: string;
  onSubmit: (data: {
    email: string;
    password: string;
    files: File[];
  }) => void;
  onDismiss: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const isBoss = agentId === "boss";
  const title = isBoss ? "Run Full Pipeline" : "Campaign Setup";
  const subtitle = isBoss
    ? "Analysis → Recommendations → Campaign creation"
    : "Create promo offers & sponsored listings";
  const Icon = isBoss ? Zap : Settings2;
  const gradient = isBoss
    ? "from-red-600 to-amber-500"
    : "from-orange-400 to-emerald-700";

  const canSubmit = email.trim() && password && (isBoss || uploadFiles.length > 0);

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 max-w-lg mx-auto">
      <div className="w-full rounded-2xl border border-[#2a2a2e] bg-[#1e1e22] p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center`}
            >
              <Icon size={18} className="text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">{title}</h3>
              <p className="text-[11px] text-gray-500">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="p-1.5 rounded-lg hover:bg-[#2a2a2e] text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              DoorDash Email
            </label>
            <div className="relative">
              <Mail
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="merchant@example.com"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#16161a] border border-[#2a2a2e] text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#FF6B35]/50 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              DoorDash Password
            </label>
            <div className="relative">
              <Lock
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#16161a] border border-[#2a2a2e] text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#FF6B35]/50 transition-colors"
              />
            </div>
          </div>

          {!isBoss && (
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Campaign Input File
            </label>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".csv,.xlsx,.xls,.zip"
              className="hidden"
              onChange={(e) => {
                const added = Array.from(e.target.files ?? []);
                setUploadFiles((prev) => [...prev, ...added]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-[#2a2a2e] hover:border-[#FF6B35]/40 bg-[#16161a] text-sm text-gray-400 hover:text-gray-300 transition-colors"
            >
              <Upload size={16} />
              {uploadFiles.length > 0
                ? `${uploadFiles.length} file${uploadFiles.length > 1 ? "s" : ""} selected`
                : "Upload campaign plan (CSV / Excel)"}
            </button>
            {uploadFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {uploadFiles.map((f, i) => (
                  <div
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#16161a] border border-[#2a2a2e] text-xs"
                  >
                    <Paperclip size={10} className="text-[#FF6B35] shrink-0" />
                    <span className="text-gray-300 truncate flex-1">
                      {f.name}
                    </span>
                    <button
                      onClick={() =>
                        setUploadFiles((prev) =>
                          prev.filter((_, idx) => idx !== i),
                        )
                      }
                      className="text-gray-500 hover:text-red-400 transition-colors shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}
        </div>

        <button
          disabled={!canSubmit}
          onClick={() =>
            canSubmit &&
            onSubmit({
              email: email.trim(),
              password,
              files: uploadFiles,
            })
          }
          className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[#FF6B35] to-[#FF8C42] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          <Zap size={14} />
          {isBoss ? "Run Full Pipeline" : "Set Up Campaigns"}
        </button>

        <p className="mt-3 text-[10px] text-gray-600 text-center">
          {isBoss
            ? "Runs DeepDive → Marketing Reco → Campaign Setup → Review. May take 30-60 minutes."
            : "Uploads file, creates session, then runs browser automation. May take 10-30 minutes."}
        </p>
      </div>
    </div>
  );
}

/* ─── Welcome Screen ──────────────────────────────────────────────────────── */

function WelcomeScreen({
  onAgentSelect,
  onSuggestionClick,
  userName,
}: {
  onAgentSelect: (agent: AgentConfig) => void;
  onSuggestionClick: (text: string) => void;
  userName: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 max-w-3xl mx-auto">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#FF8C42] flex items-center justify-center mb-6 shadow-lg shadow-[#FF6B35]/20">
        <Sparkles size={28} className="text-white" />
      </div>
      <h1 className="text-2xl font-bold text-white mb-1 text-center">
        Welcome back, {userName}
      </h1>
      <p className="text-gray-400 text-sm mb-8 text-center max-w-md">
        What would you like to do today? Pick an agent, type a slash command, or
        just ask a question.
      </p>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full mb-8">
        {WELCOME_SUGGESTIONS.map((s) => {
          const agent = findAgentByCommand(s.command);
          return (
            <button
              key={s.command}
              onClick={() => agent && onAgentSelect(agent)}
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-[#2a2a2e] bg-[#1e1e22] hover:bg-[#242428] hover:border-[#FF6B35]/30 text-left transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-[#FF6B35]/10 flex items-center justify-center shrink-0 group-hover:bg-[#FF6B35]/20 transition-colors">
                <s.icon size={16} className="text-[#FF6B35]" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">{s.label}</p>
                <code className="text-[10px] text-gray-500">{s.command}</code>
              </div>
              <ChevronRight
                size={14}
                className="text-gray-600 ml-auto group-hover:text-[#FF6B35] transition-colors"
              />
            </button>
          );
        })}
      </div>

      {/* Slash command hint */}
      <div className="flex items-center gap-2 text-[11px] text-gray-600">
        <kbd className="px-1.5 py-0.5 rounded bg-[#2a2a2e] text-gray-400 font-mono">
          /
        </kbd>
        <span>to browse agents</span>
        <span className="text-gray-700 mx-1">|</span>
        <kbd className="px-1.5 py-0.5 rounded bg-[#2a2a2e] text-gray-400 font-mono">
          Enter
        </kbd>
        <span>to send</span>
      </div>
    </div>
  );
}

/* ─── Help Panel ──────────────────────────────────────────────────────────── */

function HelpPanel() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-violet-500/20">
            <HelpCircle size={28} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">Help & Support</h1>
          <p className="text-sm text-gray-400 mt-1">
            Get the most out of ResGro AI
          </p>
        </div>

        <div className="space-y-3">
          <HelpItem
            title="Slash Commands"
            description="Type / in the chat input to see all available agents. Select one to see upload requirements."
          />
          <HelpItem
            title="File Upload"
            description="Click the paperclip icon or drag & drop files. Each agent accepts specific file types (CSV, ZIP, XLSX, PDF)."
          />
          <HelpItem
            title="Agent Workflow"
            description="1. Select an agent  2. Upload required files  3. Click Send  4. Get AI-summarized results with downloads"
          />
          <HelpItem
            title="Data Sessions"
            description="Use the Data Agent first to upload your DoorDash/UberEats exports. Other agents can then analyze this data."
          />
          <HelpItem
            title="General Chat"
            description="Ask any question about food delivery, restaurant marketing, or business strategy without selecting an agent."
          />
          <HelpItem
            title="Downloads"
            description="Every agent output includes downloadable files (PDF, Excel, CSV). Look for the download buttons in the results."
          />
        </div>

        <div className="rounded-xl border border-[#2a2a2e] bg-[#1e1e22] p-4 text-center">
          <p className="text-xs text-gray-500">
            Need help?{" "}
            <a
              href="mailto:contact@resgro.ai"
              className="text-[#FF6B35] hover:underline"
            >
              contact@resgro.ai
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function HelpItem({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-[#2a2a2e] bg-[#1e1e22] p-4">
      <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>
      <p className="text-xs text-gray-400 leading-relaxed">{description}</p>
    </div>
  );
}
