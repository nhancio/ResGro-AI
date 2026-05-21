"""
Build MarketingPlan + Ads Plan from DeepDive full analysis output.

Accepts either the full deepdive analysis dict (preferred) or the thin
legacy DeepDiveReport (backward compat — produces limited output).

Ads logic: slot-level tiering from metric_hierarchy (DEFEND/GROW/HARVEST/SKIP).
Promo logic: data-driven recommendations from marketing ROAS, product mix, and
performance gaps across dayparts.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from shared.models.campaign import RecommendedCampaign
from shared.models.report import DeepDiveReport, MarketingPlan
from shared.utils.date_helpers import utc_now_iso

# ---------------------------------------------------------------------------
# Tiering constants (aligned with ads_planner.py)
# ---------------------------------------------------------------------------

TIER_THRESHOLDS = {"DEFEND": 0.70, "GROW": 0.30, "HARVEST": 0.10}
TIER_PARAMS = {
    "DEFEND": {
        "target_audience": "All customers",
        "bid_strategy": "automatic",
        "bid_pct_of_aov": None,
        "budget_weight": 1.0,
    },
    "GROW": {
        "target_audience": "New customers",
        "bid_strategy": "custom",
        "bid_pct_of_aov": 0.22,
        "budget_weight": 0.7,
    },
    "HARVEST": {
        "target_audience": "Lapsed customers",
        "bid_strategy": "custom",
        "bid_pct_of_aov": 0.18,
        "budget_weight": 0.35,
    },
}
MIN_BID = 3.0
PROFITABILITY_FLOOR = 0.80
DOW_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
DP_ORDER = ["Early morning", "Breakfast", "Lunch", "Afternoon", "Dinner", "Late night"]


# ---------------------------------------------------------------------------
# Ads plan from metric hierarchy
# ---------------------------------------------------------------------------

def _percentile_rank(values: list[float]) -> list[float]:
    n = len(values)
    if n == 0:
        return []
    indexed = sorted(range(n), key=lambda i: values[i])
    ranks = [0.0] * n
    for rank_pos, idx in enumerate(indexed):
        ranks[idx] = (rank_pos + 1) / n
    return ranks


def _assign_tier(score: float) -> str:
    if score >= TIER_THRESHOLDS["DEFEND"]:
        return "DEFEND"
    if score >= TIER_THRESHOLDS["GROW"]:
        return "GROW"
    if score >= TIER_THRESHOLDS["HARVEST"]:
        return "HARVEST"
    return "SKIP"


def _build_ads_from_hierarchy(hierarchy: dict[str, Any]) -> dict[str, Any] | None:
    """Build slot-level ads plan from metric_hierarchy data."""
    slots = hierarchy.get("by_store_weekday_slot", [])
    if not slots:
        return None

    min_orders = 5
    eligible = [s for s in slots if s.get("orders", 0) >= min_orders]
    if not eligible:
        return None

    orders_list = [float(s["orders"]) for s in eligible]
    aov_list = [float(s.get("aov", 0)) for s in eligible]
    prof_list = [float(s.get("profitability_pct", 0)) for s in eligible]

    vol_ranks = _percentile_rank(orders_list)
    rev_ranks = _percentile_rank(aov_list)
    margin_ranks = _percentile_rank(prof_list)

    today = datetime.now().date()
    end_date = today + timedelta(days=6)
    dow_rank = {d: i for i, d in enumerate(DOW_ORDER)}
    dp_rank = {d: i for i, d in enumerate(DP_ORDER)}

    campaigns: list[dict[str, Any]] = []
    slot_table: list[dict[str, Any]] = []
    stores_seen: dict[str, str] = {}

    for i, s in enumerate(eligible):
        composite = 0.45 * vol_ranks[i] + 0.30 * rev_ranks[i] + 0.25 * margin_ranks[i]
        tier = _assign_tier(composite)
        store_id = s.get("store_id", 0)
        store_name = s.get("store_name", "")
        weekday = s.get("weekday", "")
        slot = s.get("slot", "")
        sales = float(s.get("sales", 0))
        net = float(s.get("payouts", 0))
        n = int(s.get("orders", 0))
        prof = float(s.get("profitability_pct", 0)) / 100.0
        aov = float(s.get("aov", 0))

        placement = "Yes" if prof > PROFITABILITY_FLOOR else "No"
        headroom = max(0.0, net - PROFITABILITY_FLOOR * sales)
        min_bid_ceiling = float(n * MIN_BID)
        budget = round(min(headroom, min_bid_ceiling), 2) if placement == "Yes" else 0.0
        weekly_budget = round(budget / 12.0, 2) if placement == "Yes" else 0.0

        slot_table.append({
            "store_id": store_id,
            "store_name": store_name,
            "slot": f"{weekday} · {slot}",
            "day_of_week": weekday,
            "daypart": slot,
            "orders": n,
            "sales": round(sales, 2),
            "net_total": round(net, 2),
            "profitability": round(prof, 5),
            "profitability_pct": round(prof * 100, 2),
            "ad_penetration": s.get("ad_penetration", 0),
            "promo_penetration": s.get("promo_penetration", 0),
            "ad_placement": placement,
            "budget_estimate": budget,
            "weekly_budget": weekly_budget,
        })

        if store_id:
            stores_seen[str(store_id)] = store_name

        if tier == "SKIP":
            continue

        params = TIER_PARAMS[tier]
        if params["bid_strategy"] == "automatic":
            bid_amount = None
            bid_display = "Automatic"
        else:
            raw_bid = aov * (params.get("bid_pct_of_aov") or 0.20)
            bid_amount = max(MIN_BID, round(raw_bid, 2))
            bid_display = f"${bid_amount:.2f}"

        campaigns.append({
            "store_id": store_id,
            "store_name": store_name,
            "day_of_week": weekday,
            "daypart": slot,
            "tier": tier,
            "target_audience": params["target_audience"],
            "start_date": str(today),
            "end_date": str(end_date),
            "bid_strategy": params["bid_strategy"],
            "bid_amount": bid_amount,
            "bid_display": bid_display,
            "budget_weight": params["budget_weight"],
            "campaign_name": f"{store_id}_{weekday[:3]}_{slot.replace(' ', '_')}_{tier}",
            "metrics": {
                "order_count": n,
                "avg_aov": round(aov, 2),
                "profitability_pct": round(prof, 4),
                "ad_penetration": s.get("ad_penetration", 0),
                "promo_penetration": s.get("promo_penetration", 0),
                "composite_score": round(composite, 3),
            },
        })

    total_weight = sum(c["budget_weight"] for c in campaigns)
    for c in campaigns:
        c["allocation_share"] = (c["budget_weight"] / total_weight) if total_weight > 0 else 0
        c["allocation_pct"] = round(c["allocation_share"] * 100, 2)

    campaigns.sort(key=lambda c: -c["metrics"]["composite_score"])
    for i, c in enumerate(campaigns):
        c["priority_rank"] = i + 1

    campaigns.sort(key=lambda c: (
        dow_rank.get(c["day_of_week"], 99), dp_rank.get(c["daypart"], 99)
    ))
    slot_table.sort(key=lambda x: (
        str(x.get("store_id", "")),
        dow_rank.get(str(x["day_of_week"]), 99),
        dp_rank.get(str(x["daypart"]), 99),
    ))

    stores_list = [{"store_id": sid, "store_name": sn} for sid, sn in sorted(stores_seen.items())]

    return {
        "source": "deepdive_metric_hierarchy",
        "store_count": len(stores_seen),
        "stores": stores_list,
        "date_range": f"{today} → {end_date}",
        "total_campaigns": len(campaigns),
        "tier_summary": {
            "DEFEND": sum(1 for c in campaigns if c["tier"] == "DEFEND"),
            "GROW": sum(1 for c in campaigns if c["tier"] == "GROW"),
            "HARVEST": sum(1 for c in campaigns if c["tier"] == "HARVEST"),
        },
        "campaigns": campaigns,
        "slot_table": slot_table,
    }


# ---------------------------------------------------------------------------
# Promo recommendations from analysis sections
# ---------------------------------------------------------------------------

def _build_promo_campaigns(analysis: dict[str, Any], budget_cap: float | None) -> list[RecommendedCampaign]:
    """Generate promo RecommendedCampaigns from deepdive analysis."""
    sections = analysis.get("sections") or {}
    marketing = sections.get("marketing") or {}
    summary = sections.get("executive_summary") or {}
    product_mix = sections.get("product_mix") or {}
    hierarchy = sections.get("metric_hierarchy") or {}
    financial = sections.get("financial") or {}

    campaigns: list[RecommendedCampaign] = []
    today = utc_now_iso()

    total_revenue = float(summary.get("total_revenue", 0) or financial.get("total_subtotal", 0) or 0)
    total_net = float(summary.get("total_net_payout", 0) or financial.get("total_net_revenue", 0) or 0)
    overall_margin = (total_net / total_revenue) if total_revenue > 0 else 0.0
    promo_roas = float(marketing.get("promo_roas", 0) or 0)
    sponsored_roas = float(marketing.get("sponsored_roas", 0) or 0)
    current_promo_spend = float(marketing.get("promo_total_spend", 0) or 0)
    current_ad_spend = float(marketing.get("sponsored_total_spend", 0) or 0)
    new_customers_acquired = int(marketing.get("promo_new_customers", 0) or 0)
    promo_cost_per_new = float(marketing.get("promo_cost_per_new_customer", 0) or 0)

    # --- Identify weak dayparts from hierarchy ---
    by_slot = hierarchy.get("by_slot_all_stores") or []
    if by_slot:
        avg_orders = sum(s.get("orders", 0) for s in by_slot) / max(len(by_slot), 1)
        weak_slots = [
            s for s in by_slot
            if s.get("orders", 0) < avg_orders * 0.7
        ]
        strong_slots = [
            s for s in by_slot
            if s.get("orders", 0) >= avg_orders * 1.2 and s.get("profitability_pct", 0) > 75
        ]
    else:
        weak_slots, strong_slots = [], []

    # --- Campaign 1: Sponsored listings for high-performing slots ---
    if strong_slots:
        target_parts = [s["slot"] for s in strong_slots[:3]]
        best_aov = max(s.get("aov", 0) for s in strong_slots)
        ad_budget = _compute_ad_budget(strong_slots, budget_cap, current_ad_spend, sponsored_roas)

        rationale_parts = [
            f"Target strongest dayparts ({', '.join(target_parts)}) with sponsored listings.",
        ]
        if sponsored_roas > 0:
            rationale_parts.append(f"Historical sponsored ROAS: {sponsored_roas}x.")
        if best_aov > 0:
            rationale_parts.append(f"Peak AOV ${best_aov:.0f} in these slots.")

        campaigns.append(RecommendedCampaign(
            campaign_type="sponsored_listing",
            campaign_name="Defend top dayparts — sponsored listings",
            budget=ad_budget,
            start_date=today,
            duration_days=14,
            target_day_parts=target_parts,
            target_items=[],
            discount_pct=0.0,
            rationale=" ".join(rationale_parts)[:500],
        ))

    # --- Campaign 2: Promo for weak dayparts to drive traffic ---
    if weak_slots:
        target_parts = [s["slot"] for s in weak_slots[:3]]
        discount = _compute_discount_pct(overall_margin, weak_slots)
        promo_budget = _compute_promo_budget(weak_slots, budget_cap, current_promo_spend, promo_roas)

        rationale_parts = [
            f"Drive traffic in underperforming dayparts ({', '.join(target_parts)}).",
        ]
        if promo_roas > 0:
            rationale_parts.append(f"Historical promo ROAS: {promo_roas}x.")
        rationale_parts.append(
            f"Overall margin {overall_margin*100:.0f}% supports {discount:.0f}% discount."
        )

        campaigns.append(RecommendedCampaign(
            campaign_type="promo",
            campaign_name="Traffic boost — weak daypart promo",
            budget=promo_budget,
            start_date=today,
            duration_days=7,
            target_day_parts=target_parts,
            target_items=[],
            discount_pct=discount,
            rationale=" ".join(rationale_parts)[:500],
        ))

    # --- Campaign 3: AOV lift — spend-threshold promo on top items ---
    top_sellers = product_mix.get("top_sellers") or []
    if top_sellers:
        eligible_items = [
            t for t in top_sellers[:10]
            if float(t.get("error_rate_pct", 100)) < 5
        ]
        if eligible_items:
            item_names = [t.get("item_name", "") for t in eligible_items[:5] if t.get("item_name")]
            overall = hierarchy.get("overall") or {}
            current_aov = float(overall.get("aov", 0) or summary.get("avg_order_value", 0))
            threshold_aov = round(current_aov * 1.15, 0) if current_aov > 0 else 0

            rationale_parts = [f"Lift AOV above ${threshold_aov:.0f} with spend-threshold promo."]
            if item_names:
                rationale_parts.append(f"Feature top sellers: {', '.join(item_names[:3])}.")
            if current_aov > 0:
                rationale_parts.append(f"Current AOV ${current_aov:.2f}.")

            campaigns.append(RecommendedCampaign(
                campaign_type="promo",
                campaign_name="AOV lift — spend threshold promo",
                budget=0.0,
                start_date=today,
                duration_days=7,
                target_day_parts=["lunch", "dinner"],
                target_items=item_names[:5],
                discount_pct=_compute_discount_pct(overall_margin, []),
                rationale=" ".join(rationale_parts)[:500],
            ))

    # --- Campaign 4: New customer acquisition (if promos have good CAC) ---
    if new_customers_acquired > 0 and promo_cost_per_new > 0:
        target_cac = promo_cost_per_new
        max_reasonable_cac = float(summary.get("avg_order_value", 20))
        if target_cac < max_reasonable_cac:
            nc_budget = _compute_new_customer_budget(
                target_cac, budget_cap, current_promo_spend, promo_roas
            )
            campaigns.append(RecommendedCampaign(
                campaign_type="combo",
                campaign_name="New customer acquisition — combo",
                budget=nc_budget,
                start_date=today,
                duration_days=14,
                target_day_parts=["lunch", "dinner"],
                target_items=[],
                discount_pct=min(20.0, _compute_discount_pct(overall_margin, []) + 5),
                rationale=(
                    f"Acquire new customers at ${target_cac:.2f}/customer "
                    f"(historical: {new_customers_acquired} acquired at ${promo_cost_per_new:.2f}/ea). "
                    f"Promo ROAS {promo_roas}x supports continued investment."
                )[:500],
            ))

    # --- Campaign 5: Weekend push (if weekday data shows Sat/Sun weakness) ---
    by_weekday = hierarchy.get("by_weekday_all_stores") or []
    if by_weekday:
        weekday_map = {w.get("weekday"): w for w in by_weekday}
        sat = weekday_map.get("Saturday", {})
        sun = weekday_map.get("Sunday", {})
        avg_daily_orders = sum(w.get("orders", 0) for w in by_weekday) / max(len(by_weekday), 1)
        weekend_avg = (sat.get("orders", 0) + sun.get("orders", 0)) / 2

        if weekend_avg < avg_daily_orders * 0.8 and weekend_avg > 0:
            campaigns.append(RecommendedCampaign(
                campaign_type="promo",
                campaign_name="Weekend traffic recovery",
                budget=_compute_promo_budget([], budget_cap, current_promo_spend, promo_roas) * 0.5,
                start_date=today,
                duration_days=14,
                target_day_parts=["lunch", "dinner"],
                target_items=[],
                discount_pct=_compute_discount_pct(overall_margin, []),
                rationale=(
                    f"Weekend orders ({weekend_avg:.0f}/day) trail weekday average "
                    f"({avg_daily_orders:.0f}/day) by {(1 - weekend_avg/avg_daily_orders)*100:.0f}%. "
                    f"Targeted promo to close the gap."
                )[:500],
            ))

    if not campaigns:
        insights = summary.get("insights") or []
        seed = " ".join(insights).strip() if insights else "Drive traffic and protect margin."
        campaigns.append(RecommendedCampaign(
            campaign_type="sponsored_listing",
            campaign_name="Baseline visibility — sponsored listings",
            budget=150.0,
            start_date=today,
            duration_days=14,
            target_day_parts=["lunch", "dinner"],
            target_items=[],
            discount_pct=0.0,
            rationale=seed[:500],
        ))

    return campaigns


def _compute_ad_budget(
    strong_slots: list[dict], budget_cap: float | None, current_spend: float, roas: float
) -> float:
    total_headroom = sum(
        max(0, s.get("payouts", 0) - PROFITABILITY_FLOOR * s.get("sales", 0))
        for s in strong_slots
    )
    suggested = round(min(total_headroom * 0.3, 500.0), 2)
    if roas > 3 and current_spend > 0:
        suggested = max(suggested, round(current_spend * 1.1, 2))
    if budget_cap is not None:
        suggested = min(suggested, budget_cap * 0.4)
    return max(suggested, 50.0)


def _compute_promo_budget(
    slots: list[dict], budget_cap: float | None, current_spend: float, roas: float
) -> float:
    if current_spend > 0 and roas > 2:
        suggested = round(current_spend * 0.8, 2)
    elif slots:
        total_sales = sum(s.get("sales", 0) for s in slots)
        suggested = round(total_sales * 0.05, 2)
    else:
        suggested = 100.0
    if budget_cap is not None:
        suggested = min(suggested, budget_cap * 0.3)
    return max(suggested, 50.0)


def _compute_new_customer_budget(
    target_cac: float, budget_cap: float | None, current_spend: float, roas: float
) -> float:
    suggested = round(target_cac * 20, 2)
    if budget_cap is not None:
        suggested = min(suggested, budget_cap * 0.2)
    return max(suggested, 50.0)


def _compute_discount_pct(overall_margin: float, weak_slots: list[dict]) -> float:
    if overall_margin >= 0.85:
        base = 20.0
    elif overall_margin >= 0.75:
        base = 15.0
    elif overall_margin >= 0.65:
        base = 10.0
    else:
        base = 5.0
    if weak_slots:
        avg_prof = sum(s.get("profitability_pct", 80) for s in weak_slots) / len(weak_slots)
        if avg_prof > 85:
            base = min(base + 5, 25.0)
    return base


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_plan(
    deepdive_report: DeepDiveReport,
    *,
    budget_cap: float | None = None,
) -> MarketingPlan:
    """Legacy entry point — thin DeepDiveReport only. Produces limited output."""
    seed = deepdive_report.recommendations_seed or "Drive traffic and protect margin."
    ob = deepdive_report.order_breakdown
    rm = deepdive_report.revenue_metrics
    total_orders = ob.organic + ob.ads_only + ob.promo_only + ob.combo

    campaigns: list[RecommendedCampaign] = []

    if ob.ads_only > 0 or ob.promo_only > 0:
        campaigns.append(RecommendedCampaign(
            campaign_type="sponsored_listing",
            campaign_name="Visibility — sponsored listings",
            budget=150.0,
            start_date=utc_now_iso(),
            duration_days=14,
            target_day_parts=["dinner", "late_night"],
            target_items=[],
            discount_pct=0.0,
            rationale=(
                f"Based on {ob.ads_only} ads orders and {ob.promo_only} promo orders "
                f"out of {total_orders} total. {seed}"
            )[:500],
        ))

    if rm.avg_order_value > 0:
        campaigns.append(RecommendedCampaign(
            campaign_type="promo",
            campaign_name="AOV lift — spend threshold",
            budget=0.0,
            start_date=utc_now_iso(),
            duration_days=7,
            target_day_parts=["lunch"],
            target_items=[],
            discount_pct=15.0,
            rationale=f"Current AOV ${rm.avg_order_value:.2f}. {seed}"[:500],
        ))

    if not campaigns:
        campaigns.append(RecommendedCampaign(
            campaign_type="sponsored_listing",
            campaign_name="Baseline visibility",
            budget=150.0,
            start_date=utc_now_iso(),
            duration_days=14,
            target_day_parts=["lunch", "dinner"],
            target_items=[],
            discount_pct=0.0,
            rationale=seed[:500],
        ))

    return MarketingPlan(
        operator_id=deepdive_report.operator_id,
        plan_date=utc_now_iso(),
        recommended_campaigns=campaigns,
        approval_status="pending",
        approver_notes="",
    )


def generate_plan_from_analysis(
    analysis: dict[str, Any],
    *,
    budget_cap: float | None = None,
) -> tuple[MarketingPlan, dict[str, Any] | None]:
    """
    Full entry point — uses complete deepdive analysis.

    Returns (MarketingPlan with promo campaigns, ads_plan dict or None).
    """
    operator_id = analysis.get("operator_id", "unknown")
    hierarchy = (analysis.get("sections") or {}).get("metric_hierarchy") or {}

    # Build ads plan from hierarchy
    ads_plan = _build_ads_from_hierarchy(hierarchy)

    # Build promo campaigns from full analysis
    promo_campaigns = _build_promo_campaigns(analysis, budget_cap)

    plan = MarketingPlan(
        operator_id=operator_id,
        plan_date=utc_now_iso(),
        recommended_campaigns=promo_campaigns,
        approval_status="pending",
        approver_notes="",
    )

    return plan, ads_plan
