/**
 * Client-side HTML report styled after ResGro/agents/deepdive/reporter.py
 * (_html_head, sections, tabs). Uses DeepDiveReport only (no matplotlib).
 */

import type { DeepDiveReport } from "../shared/models/report";

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtInt(n: number): string {
  return n.toLocaleString();
}

/** Analyzer emits DataFrame keys (Item Name, count, total_charge); TS mocks use item_name / orders / net_revenue. */
function topItemDisplayFields(row: Record<string, unknown>): { name: string; orders: number; revenue: number } {
  const name =
    row.item_name ??
    row["Item Name"] ??
    row["Menu Item"] ??
    row.menu_item ??
    "—";
  const ordersRaw = row.orders ?? row.count;
  const revRaw = row.net_revenue ?? row.total_charge;
  const orders = typeof ordersRaw === "number" ? ordersRaw : Number(ordersRaw) || 0;
  const revenue = typeof revRaw === "number" ? revRaw : Number(revRaw) || 0;
  return { name: String(name), orders, revenue };
}

/** Build ResGro-parity single-file HTML for iframe / shadow DOM embedding. */
export function buildResgroStyleDeepDiveHtml(report: DeepDiveReport): string {
  const ob = report.order_breakdown;
  const totalOrders = ob.organic + ob.ads_only + ob.promo_only + ob.combo;
  const cancelRate = totalOrders + ob.cancelled_refund > 0
    ? (100 * ob.cancelled_refund) / (totalOrders + ob.cancelled_refund)
    : 0;

  const insights: string[] = [];
  if (report.recommendations_seed.trim()) insights.push(report.recommendations_seed.trim());
  report.anomalies.forEach((a) => insights.push(`Watch: ${a}`));
  if (insights.length === 0) insights.push("Analysis Engine synthesis complete.");

  const insightLis = insights
    .map((line) => {
      const low = line.toLowerCase();
      let cls = "";
      if (low.includes("elevated") || low.includes("investigate") || low.includes("anomaly")) cls = ' class="danger"';
      else if (low.includes("consider") || low.includes("room")) cls = ' class="warning"';
      return `<li${cls}>${esc(line)}</li>`;
    })
    .join("\n");

  const dateStr = new Date(report.analysis_date).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const kpiGrid = `
<div class="kpi-grid">
  <div class="kpi-card"><div class="kpi-value">${fmtMoney(report.revenue_metrics.total_net_revenue)}</div><div class="kpi-label">Net revenue</div></div>
  <div class="kpi-card green"><div class="kpi-value">${fmtMoney(report.revenue_metrics.total_net_revenue * 0.94)}</div><div class="kpi-label">Est. net payout</div></div>
  <div class="kpi-card blue"><div class="kpi-value">${fmtInt(totalOrders)}</div><div class="kpi-label">Delivered orders</div></div>
  <div class="kpi-card purple"><div class="kpi-value">${fmtMoney(report.revenue_metrics.avg_order_value)}</div><div class="kpi-label">Avg order value</div></div>
  <div class="kpi-card blue"><div class="kpi-value">${(32 + Math.min(15, report.ads_performance.length * 2)).toFixed(1)}%</div><div class="kpi-label">DashPass rate (simulated)</div></div>
  <div class="kpi-card green"><div class="kpi-value">${estimateRoas(report).toFixed(1)}x</div><div class="kpi-label">Marketing ROAS (simulated)</div></div>
  <div class="kpi-card orange"><div class="kpi-value">${fmtInt(Math.round(totalOrders * 0.12))}</div><div class="kpi-label">New customers (simulated)</div></div>
  <div class="kpi-card"><div class="kpi-value">${cancelRate.toFixed(1)}%</div><div class="kpi-label">Cancel rate</div></div>
  <div class="kpi-card orange"><div class="kpi-value">${fmtInt(28 + ob.cancelled_refund)}</div><div class="kpi-label">Support cases (simulated)</div></div>
  <div class="kpi-card purple"><div class="kpi-value">4.2 min</div><div class="kpi-label">Avg avoidable wait (simulated)</div></div>
</div>`;

  const dayPartVals = Object.values(report.revenue_metrics.aov_by_day_part || {}).map(Number);
  const maxDayAov = dayPartVals.length
    ? Math.max(...dayPartVals, report.revenue_metrics.avg_order_value, 1)
    : Math.max(report.revenue_metrics.avg_order_value, 1);
  const dayPartRows = Object.entries(report.revenue_metrics.aov_by_day_part || {})
    .map(
      ([part, aov]) =>
        `<tr><td>${esc(part)}</td><td class="num">${fmtMoney(Number(aov))}</td><td><div class="bar-track"><span class="bar" style="width:${barWidthPct(Number(aov), maxDayAov)}%"></span></div></td></tr>`,
    )
    .join("");

  const topBody = report.top_items
    .map((row) => {
      const { name, orders, revenue } = topItemDisplayFields(row as Record<string, unknown>);
      return `<tr><td>${esc(name)}</td><td class="num">${fmtInt(orders)}</td><td class="num">${fmtMoney(revenue)}</td></tr>`;
    })
    .join("");

  const promoBody = report.promo_performance
    .map((row) => {
      const cells = Object.entries(row)
        .map(([k, v]) => {
          const lk = k.toLowerCase();
          const num = Number(v);
          const isM = lk.includes("spend") || lk.includes("revenue") || lk.includes("cost") || lk.includes("amount") || lk.includes("budget");
          const isP = lk.includes("rate") || lk.includes("roas") || lk.includes("_pct");
          if (isM && Number.isFinite(num)) return `<td class="num">${fmtMoney(num)}</td>`;
          if (isP && Number.isFinite(num)) return `<td class="num">${num.toFixed(1)}${lk.includes("roas") ? "x" : "%"}</td>`;
          if (Number.isFinite(num) && typeof v === "number" && num !== Math.floor(num)) return `<td class="num">${num.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>`;
          if (Number.isFinite(num) && typeof v === "number") return `<td class="num">${fmtInt(num)}</td>`;
          return `<td>${esc(String(v))}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  const promoHead =
    report.promo_performance.length > 0
      ? `<thead><tr>${Object.keys(report.promo_performance[0] as object).map((k) => `<th>${esc(k)}</th>`).join("")}</tr></thead>`
      : "";

  const adsBody = report.ads_performance
    .map((row) => {
      const cells = Object.entries(row)
        .map(([k, v]) => {
          const lk = k.toLowerCase();
          const num = Number(v);
          const isM = lk.includes("spend") || lk.includes("revenue") || lk.includes("cost") || lk.includes("amount") || lk.includes("budget");
          const isP = lk.includes("rate") || lk.includes("roas") || lk.includes("_pct") || lk.includes("ctr");
          if (isM && Number.isFinite(num)) return `<td class="num">${fmtMoney(num)}</td>`;
          if (isP && Number.isFinite(num)) return `<td class="num">${num.toFixed(1)}${lk.includes("roas") ? "x" : "%"}</td>`;
          if (Number.isFinite(num) && typeof v === "number" && num !== Math.floor(num)) return `<td class="num">${num.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>`;
          if (Number.isFinite(num) && typeof v === "number") return `<td class="num">${fmtInt(num)}</td>`;
          return `<td>${esc(String(v))}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  const adsHead =
    report.ads_performance.length > 0
      ? `<thead><tr>${Object.keys(report.ads_performance[0] as object).map((k) => `<th>${esc(k)}</th>`).join("")}</tr></thead>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Analysis Engine — ${esc(report.operator_id)}</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Outfit', system-ui, sans-serif; background: #ffffff; color: #252525; line-height: 1.6; }
.dd-wrap { max-width: 1400px; margin: 0 auto; padding: 24px; }
.header {
  background: linear-gradient(135deg, #04493a 0%, #046e54 40%, #049772 100%);
  color: white; padding: 44px 40px; border-radius: 16px; margin-bottom: 28px;
  box-shadow: 0 24px 60px -32px rgb(4 73 58 / 0.35);
  position: relative; overflow: hidden;
}
.header::before {
  content: ''; position: absolute; top: -50%; right: -20%; width: 60%; height: 200%;
  background: radial-gradient(circle, rgb(5 215 159 / 0.2), transparent 60%);
  pointer-events: none;
}
.header h1 { font-size: 2.05em; font-weight: 700; margin-bottom: 8px; letter-spacing: -0.5px; position: relative; }
.subtitle { opacity: 0.9; font-size: 1.05em; font-weight: 400; position: relative; }
.note-strip {
  margin-top: 14px; padding: 10px 14px; border-radius: 10px; background: rgb(255 255 255 / 0.12);
  font-size: 0.88em; opacity: 0.95; position: relative;
}
.section {
  background: linear-gradient(135deg, rgb(255 255 255 / 0.92), rgb(241 252 248 / 0.88));
  border-radius: 14px; padding: 28px; margin-bottom: 20px;
  box-shadow: 0 0 0 1px rgb(37 37 37 / 0.06), 0 24px 60px -32px rgb(37 37 37 / 0.10);
  backdrop-filter: blur(18px);
}
.section h2 { font-size: 1.5em; color: #252525; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 3px solid #05d79f; display: inline-block; font-weight: 600; }
.section h3 { font-size: 1.12em; color: #3f3f3f; margin: 20px 0 12px; font-weight: 500; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px; }
.kpi-card {
  background: linear-gradient(135deg, rgb(255 255 255 / 0.95), rgb(241 252 248 / 0.90));
  border-radius: 14px; padding: 22px 18px;
  box-shadow: 0 0 0 1px rgb(37 37 37 / 0.06), 0 20px 50px -32px rgb(37 37 37 / 0.14);
  text-align: center; border-top: 4px solid #05d79f;
  backdrop-filter: blur(18px); transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.kpi-card:hover { transform: translateY(-2px); box-shadow: 0 0 0 1px rgb(37 37 37 / 0.08), 0 28px 60px -28px rgb(37 37 37 / 0.18); }
.kpi-card.green { border-top-color: #049772; }
.kpi-card.blue { border-top-color: #41e2b8; }
.kpi-card.orange { border-top-color: #7deccf; }
.kpi-card.purple { border-top-color: #b0f4e2; }
.kpi-value { font-size: 1.75em; font-weight: 700; color: #252525; }
.kpi-label { font-size: 0.78em; color: #6a6a6a; margin-top: 6px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 500; }
table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.9em; }
th { background: #252525; color: white; padding: 11px 14px; text-align: left; font-weight: 500; white-space: nowrap; letter-spacing: 0.3px; }
td { padding: 9px 14px; border-bottom: 1px solid #e7e7e7; }
tr:nth-child(even) { background: rgb(241 252 248 / 0.5); }
tr:hover { background: rgb(5 215 159 / 0.08); }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.insights-list { list-style: none; padding: 0; }
.insights-list li { padding: 12px 18px; margin: 8px 0; background: rgb(241 252 248 / 0.9); border-left: 4px solid #05d79f; border-radius: 6px; font-size: 0.95em; }
.insights-list li.warning { background: rgb(125 236 207 / 0.15); border-left-color: #049772; }
.insights-list li.danger { background: rgb(4 73 58 / 0.06); border-left-color: #04493a; color: #04493a; font-weight: 500; }
.bar-track { height: 8px; background: #e7ece9; border-radius: 6px; overflow: hidden; min-width: 80px; }
.bar { display: block; height: 100%; background: linear-gradient(90deg, #05d79f, #049772); border-radius: 6px; }
.tabs { display: flex; gap: 10px; flex-wrap: wrap; margin: 8px 0 16px; }
.tab-btn {
  border: 1px solid #d7ece5; background: white; color: #04493a; border-radius: 999px;
  padding: 8px 16px; font-weight: 600; cursor: pointer; transition: all 0.15s ease;
}
.tab-btn:hover { background: #f1fcf8; }
.tab-btn.active { background: #05d79f; border-color: #05d79f; color: #252525; }
.tab-panel { display: none; }
.tab-panel.active { display: block; }
.table-scroll { max-height: 420px; overflow: auto; border: 1px solid #e7e7e7; border-radius: 10px; margin: 12px 0; }
.table-scroll table { margin: 0; }
</style>
<script>
document.addEventListener("DOMContentLoaded", function () {
  const buttons = Array.from(document.querySelectorAll(".tab-btn"));
  const panels = Array.from(document.querySelectorAll(".tab-panel"));
  buttons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var tab = btn.getAttribute("data-tab");
      buttons.forEach(function (b) { b.classList.remove("active"); });
      panels.forEach(function (p) { p.classList.remove("active"); });
      btn.classList.add("active");
      var panel = tab ? document.getElementById(tab) : null;
      if (panel) panel.classList.add("active");
    });
  });
});
</script>
</head>
<body>
<div class="dd-wrap">
  <div class="header">
    <h1>DeepDive Analytics Report</h1>
    <p class="subtitle">Operator: <strong>${esc(report.operator_id)}</strong> · Generated: ${esc(dateStr)}</p>
    <p class="note-strip">90-day performance snapshot · powered by ResGro Analysis Engine</p>
  </div>

  <div class="section">
    <h2>Executive summary</h2>
    <ul class="insights-list">${insightLis}</ul>
  </div>

  ${kpiGrid}

  <div class="tabs">
    <button type="button" class="tab-btn active" data-tab="panel-overview">Overview</button>
    <button type="button" class="tab-btn" data-tab="panel-dayparts">Day-parts</button>
    <button type="button" class="tab-btn" data-tab="panel-marketing">Marketing</button>
  </div>

  <div id="panel-overview" class="tab-panel active">
    <div class="section">
      <h2>Top items</h2>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Item</th><th class="num">Orders</th><th class="num">Net revenue</th></tr></thead>
          <tbody>${topBody || "<tr><td colspan='3'><em>No rows</em></td></tr>"}</tbody>
        </table>
      </div>
    </div>
  </div>

  <div id="panel-dayparts" class="tab-panel">
    <div class="section">
      <h2>AOV by day-part</h2>
      <p style="color:#555;font-size:0.95em;margin-bottom:12px;">Bars scale to the highest day-part AOV; overall AOV is ${fmtMoney(report.revenue_metrics.avg_order_value)}.</p>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Day-part</th><th class="num">AOV</th><th>Vs average</th></tr></thead>
          <tbody>${dayPartRows || "<tr><td colspan='3'><em>No day-part split</em></td></tr>"}</tbody>
        </table>
      </div>
    </div>
  </div>

  <div id="panel-marketing" class="tab-panel">
    <div class="section">
      <h2>Promotions</h2>
      <div class="table-scroll">
        <table>${promoHead}<tbody>${promoBody || "<tr><td><em>No promo rows</em></td></tr>"}</tbody></table>
      </div>
      <h3>Sponsored listings / ads</h3>
      <div class="table-scroll">
        <table>${adsHead}<tbody>${adsBody || "<tr><td><em>No ads rows</em></td></tr>"}</tbody></table>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;
}

function estimateRoas(report: DeepDiveReport): number {
  const rows = report.ads_performance;
  if (!rows.length) return 2.4;
  const first = rows[0] as Record<string, unknown>;
  const spend = Number(first.spend ?? 1200);
  const ord = Number(first.attributed_orders ?? 210);
  if (!Number.isFinite(spend) || spend <= 0) return 2.4;
  return Math.min(12, (ord * report.revenue_metrics.avg_order_value) / spend);
}

function barWidthPct(aov: number, maxAov: number): number {
  if (!maxAov || maxAov <= 0) return 0;
  return Math.min(100, Math.round((aov / maxAov) * 100));
}
