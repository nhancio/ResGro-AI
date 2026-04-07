import React, { useEffect, useState } from "react";
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
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  Calendar,
  Cpu,
  Loader2,
  Play,
  ShoppingBag,
} from "lucide-react";
import {
  SAMPLE_MARKETING_PLAN_ADS_JSON,
  SAMPLE_MARKETING_PLAN_JSON,
  mockCampaignSetup,
} from "./campaign_setup";
import { mockDeepDiveReport } from "./deepdive";
import { mockMonthlyReporter } from "./monthly_reporter";
import { OPERATOR_AGENT_CATALOG } from "./orchestrator/registry";
import type { CampaignSetupResult } from "./shared/models/campaign";
import type { OperatorAgentId } from "./shared/models/operator";
import type { DeepDiveReport, MonthlyReporterPreview } from "./shared/models/report";
import { parseMarketingPlanJson } from "./shared/utils/planParse";

function IoList({
  title,
  icon: Icon,
  items,
  variant,
}: {
  title: string;
  icon: typeof ArrowDownCircle;
  items: string[];
  variant: "in" | "out";
}) {
  const inStyles =
    variant === "in"
      ? "border-gray-100 bg-[#FFF9F6]"
      : "border-[#FF6B35]/20 bg-[#FF6B35]/5";
  return (
    <div className={`rounded-2xl border ${inStyles}`}>
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
        <Icon className={`h-3.5 w-3.5 shrink-0 ${variant === "in" ? "text-gray-500" : "text-[#FF6B35]"}`} />
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{title}</span>
      </div>
      <ul className="space-y-1.5 px-3 py-2.5">
        {items.map((line) => (
          <li key={line} className="flex gap-2 text-[13px] leading-snug text-gray-600">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#FF6B35]" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function JsonBlock({ data }: { data: unknown }) {
  return (
    <pre className="max-h-[min(360px,50vh)] overflow-auto rounded-2xl border border-gray-100 bg-black/[0.03] p-4 text-xs leading-relaxed text-gray-800">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
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
        <span className="text-xs text-gray-500">({rows.length} rows)</span>
      </div>
      <div className="max-h-[min(280px,40vh)] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {cols.map((c) => (
                <TableHead key={c} className="whitespace-nowrap text-xs">
                  {c}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, ri) => (
              <TableRow key={ri}>
                {cols.map((c) => (
                  <TableCell key={c} className="max-w-[200px] truncate text-xs">
                    {row[c] === null || row[c] === undefined ? "—" : String(row[c])}
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

const agentIcon: Record<OperatorAgentId, React.ComponentType<{ className?: string }>> = {
  deepdive: BarChart3,
  "promo-setup": ShoppingBag,
  "ads-setup": Cpu,
  "monthly-reporter": Calendar,
};

export function OperatorAgentsPanel({ isDemo }: { isDemo: boolean }) {
  const [selected, setSelected] = useState<OperatorAgentId>("deepdive");
  const [loading, setLoading] = useState(false);

  const [opId, setOpId] = useState("demo_operator");
  const [dateRange, setDateRange] = useState("");
  const [zipNames, setZipNames] = useState<string[]>([]);

  const [planJson, setPlanJson] = useState(SAMPLE_MARKETING_PLAN_JSON);
  const [storeIds, setStoreIds] = useState("101, 102");

  const [preRange, setPreRange] = useState("11/1/2025-11/30/2025");
  const [postRange, setPostRange] = useState("12/1/2025-12/31/2025");
  const [opName, setOpName] = useState("");
  const [excludedDates, setExcludedDates] = useState("");
  const [ddStores, setDdStores] = useState("");
  const [ueStores, setUeStores] = useState("");

  const [deepResult, setDeepResult] = useState<DeepDiveReport | null>(null);
  const [setupResult, setSetupResult] = useState<CampaignSetupResult | null>(null);
  const [monthlyResult, setMonthlyResult] = useState<MonthlyReporterPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const catalog = OPERATOR_AGENT_CATALOG.find((a) => a.id === selected)!;

  useEffect(() => {
    if (selected === "ads-setup") setPlanJson(SAMPLE_MARKETING_PLAN_ADS_JSON);
    else if (selected === "promo-setup") setPlanJson(SAMPLE_MARKETING_PLAN_JSON);
  }, [selected]);

  const runAnalysis = async () => {
    setError(null);
    setDeepResult(null);
    setSetupResult(null);
    setMonthlyResult(null);

    if (selected === "deepdive") {
      if (!opId.trim()) {
        setError("Enter an operator ID.");
        return;
      }
      if (!isDemo && zipNames.length === 0) {
        setError("Upload at least one DoorDash zip export (or use demo mode to run without files).");
        return;
      }
    }

    if (selected === "promo-setup" || selected === "ads-setup") {
      const parsed = parseMarketingPlanJson(planJson, opId.trim() || "demo_operator");
      if (!parsed) {
        setError("Marketing plan JSON is invalid.");
        return;
      }
      const needPromo = selected === "promo-setup";
      const hasRow = parsed.recommended_campaigns.some((c) =>
        needPromo ? c.campaign_type === "promo" || c.campaign_type === "combo" : c.campaign_type === "sponsored_listing",
      );
      if (!hasRow) {
        setError(
          needPromo
            ? "Plan must include at least one promo or combo row for this flow."
            : "Plan must include at least one sponsored_listing row for this flow.",
        );
        return;
      }
    }

    if (selected === "monthly-reporter") {
      if (!preRange.trim() || !postRange.trim()) {
        setError("Enter Pre and Post date ranges (MM/DD/YYYY-MM/DD/YYYY each).");
        return;
      }
    }

    setLoading(true);
    await new Promise((r) => setTimeout(r, 700));

    try {
      if (selected === "deepdive") {
        setDeepResult(mockDeepDiveReport(opId.trim()));
      } else if (selected === "promo-setup" || selected === "ads-setup") {
        const ids = storeIds
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        setSetupResult(mockCampaignSetup(opId.trim() || "demo_operator", selected, ids));
      } else {
        setMonthlyResult(
          mockMonthlyReporter(opId.trim() || "demo_operator", opName.trim(), preRange.trim(), postRange.trim()),
        );
      }
    } catch {
      setError("Run failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-gray-600">
        Structured operator tools: same <strong className="font-medium text-black">requires</strong> /{" "}
        <strong className="font-medium text-black">produces</strong> contracts as the legacy pipeline. Runs below are{" "}
        <strong className="font-medium text-black">illustrative</strong>
        {isDemo ? " in demo" : ""}; wire your API to replace mocks when the backend is available.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {OPERATOR_AGENT_CATALOG.map((a) => {
          const Icon = agentIcon[a.id];
          const active = selected === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setSelected(a.id)}
              className={`rounded-2xl border p-4 text-left transition-all ${
                active ? "border-[#FF6B35] bg-[#FF6B35]/5 shadow-sm" : "border-gray-100 bg-white hover:border-[#FF6B35]/30"
              }`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF6B35]/10 text-[#FF6B35]">
                <Icon className="h-5 w-5" />
              </div>
              <h4 className="mt-3 text-sm font-semibold text-black">{a.title}</h4>
              <p className="mt-1 line-clamp-3 text-xs text-gray-500">{a.description}</p>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-3xl border border-white bg-white p-5 shadow-sm sm:p-6">
          <h3 className="text-lg font-bold text-black">{catalog.title}</h3>
          <p className="text-sm text-gray-600">{catalog.description}</p>
          <div className="grid gap-3">
            <IoList title="Requires" icon={ArrowDownCircle} items={catalog.requires} variant="in" />
            <IoList title="Produces" icon={ArrowUpCircle} items={catalog.produces} variant="out" />
          </div>

          <div className="border-t border-gray-100 pt-5">
            <h4 className="text-sm font-semibold text-black">Input</h4>
            {selected === "deepdive" && (
              <div className="mt-4 space-y-4">
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Operator ID</span>
                  <Input
                    value={opId}
                    onChange={(e) => setOpId(e.target.value)}
                    className="mt-1 rounded-xl border-gray-200"
                    placeholder="e.g. north_01"
                  />
                </div>
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Date range (optional)</span>
                  <Input
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value)}
                    className="mt-1 rounded-xl border-gray-200"
                    placeholder="MM/DD/YYYY - MM/DD/YYYY"
                  />
                </div>
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-400">DoorDash zip exports</span>
                  <input
                    type="file"
                    accept=".zip,application/zip"
                    multiple
                    className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#FF6B35]/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-[#FF6B35]"
                    onChange={(e) =>
                      setZipNames(Array.from(e.target.files ?? []).map((f) => f.name))
                    }
                  />
                  {zipNames.length > 0 ? (
                    <p className="mt-1 text-xs text-gray-500">Selected: {zipNames.join(", ")}</p>
                  ) : (
                    <p className="mt-1 text-xs text-gray-500">
                      {isDemo ? "Demo mode: files optional." : "At least one zip required for a real run."}
                    </p>
                  )}
                </div>
              </div>
            )}

            {(selected === "promo-setup" || selected === "ads-setup") && (
              <div className="mt-4 space-y-4">
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Operator ID</span>
                  <Input
                    value={opId}
                    onChange={(e) => setOpId(e.target.value)}
                    className="mt-1 rounded-xl border-gray-200"
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
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Approved marketing_plan (JSON)</span>
                  <Textarea
                    value={planJson}
                    onChange={(e) => setPlanJson(e.target.value)}
                    className="mt-1 min-h-[200px] rounded-xl border-gray-200 font-mono text-xs"
                  />
                </div>
              </div>
            )}

            {selected === "monthly-reporter" && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Pre period</span>
                  <Input
                    value={preRange}
                    onChange={(e) => setPreRange(e.target.value)}
                    className="mt-1 rounded-xl border-gray-200"
                  />
                </div>
                <div className="sm:col-span-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Post period</span>
                  <Input
                    value={postRange}
                    onChange={(e) => setPostRange(e.target.value)}
                    className="mt-1 rounded-xl border-gray-200"
                  />
                </div>
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Operator ID</span>
                  <Input value={opId} onChange={(e) => setOpId(e.target.value)} className="mt-1 rounded-xl border-gray-200" />
                </div>
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Operator name</span>
                  <Input value={opName} onChange={(e) => setOpName(e.target.value)} className="mt-1 rounded-xl border-gray-200" />
                </div>
                <div className="sm:col-span-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Exclude dates (optional)</span>
                  <Input
                    value={excludedDates}
                    onChange={(e) => setExcludedDates(e.target.value)}
                    className="mt-1 rounded-xl border-gray-200"
                    placeholder="MM/DD/YYYY, ..."
                  />
                </div>
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-400">DD store IDs (optional)</span>
                  <Input value={ddStores} onChange={(e) => setDdStores(e.target.value)} className="mt-1 rounded-xl border-gray-200" />
                </div>
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-400">UE store IDs (optional)</span>
                  <Input value={ueStores} onChange={(e) => setUeStores(e.target.value)} className="mt-1 rounded-xl border-gray-200" />
                </div>
                <p className="sm:col-span-2 text-xs text-gray-500">
                  CSV uploads for DD / UE / marketing can be added when you connect a file upload API; fields above match the
                  monthly reporter contract.
                </p>
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            <Button
              type="button"
              onClick={runAnalysis}
              disabled={loading}
              className="mt-5 rounded-full !bg-[#FF6B35] !text-white hover:!bg-[#FF8C42]"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Run analysis
            </Button>
          </div>
        </div>

        <div className="rounded-3xl border border-white bg-white p-5 shadow-sm sm:p-6">
          <h3 className="text-lg font-bold text-black">Analysis output</h3>
          <p className="mt-1 text-sm text-gray-500">Structured payload shape for this agent (demo data).</p>

          <div className="mt-5 space-y-4">
            {deepResult && (
              <>
                <div className="rounded-2xl border border-gray-100 bg-[#FFF9F6] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Summary</p>
                  <p className="mt-2 text-sm text-gray-700">{deepResult.recommendations_seed}</p>
                  <p className="mt-3 text-xs text-gray-500">
                    Anomalies: {deepResult.anomalies.join(" · ") || "—"}
                  </p>
                </div>
                <JsonBlock data={deepResult} />
              </>
            )}

            {setupResult && (
              <>
                <div className="rounded-2xl border border-gray-100 bg-[#FFF9F6] p-4">
                  <p className="text-sm font-medium text-black">{setupResult.setup_summary}</p>
                  <p className="mt-2 text-xs text-gray-500">Review at: {setupResult.review_scheduled_at}</p>
                </div>
                <JsonBlock data={setupResult} />
              </>
            )}

            {monthlyResult && (
              <>
                <div className="rounded-2xl border border-gray-100 bg-[#FFF9F6] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Narrative</p>
                  <p className="mt-2 text-sm text-gray-700">{monthlyResult.summary_text}</p>
                  <p className="mt-2 text-xs text-gray-500">run_id: {monthlyResult.run_id}</p>
                </div>
                {Object.entries(monthlyResult.tables).map(([key, t]) => (
                  <PreviewTable key={key} title={key} columns={t.columns} rows={t.rows} />
                ))}
                <JsonBlock data={monthlyResult} />
              </>
            )}

            {!deepResult && !setupResult && !monthlyResult && !loading && (
              <p className="text-sm text-gray-500">Run an agent to see output here.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
