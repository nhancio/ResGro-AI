"""MarketingReco agent — builds campaign plan & ads table from DeepDive slot tables.

Pipeline:  DeepDive → slot AOV/profitability tables → this agent → campaign plan + ads table.

Campaign Plan:  Resgro-{StoreID}-${rounded_AOV}  →  slots whose AOV rounds up to that 5-multiple.
Ads Table:      Resgro-Ads-{StoreID}             →  slots with profitability > 80%.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from shared.config.settings import data_root
from shared.models.campaign import RecommendedCampaign
from shared.models.report import MarketingPlan
from shared.utils.date_helpers import utc_now_iso

from agents.deepdive.analyzer import SLOT_NUMBER_MAP
from .approval_handler import apply_command


def _deepdive_analysis_path(operator_id: str) -> Path:
    return data_root() / "operators" / operator_id / "reports" / "deepdive_analysis.json"


def _plan_path(operator_id: str) -> Path:
    return data_root() / "operators" / operator_id / "reports" / "marketing_plan.json"


def _ceil5(value: float) -> int:
    """Round up to nearest multiple of 5.  e.g. 23→25, 50→50, 21→25."""
    return int(math.ceil(value / 5) * 5)


def _slot_nums(slot_names: list[str]) -> list[int]:
    """Convert slot names to DoorDash grid numbers (1-42), sorted."""
    return sorted(SLOT_NUMBER_MAP.get(s, 0) for s in slot_names if SLOT_NUMBER_MAP.get(s))


# ---------------------------------------------------------------------------
# Campaign Plan builder
# ---------------------------------------------------------------------------


def _build_campaign_plan(slot_tables: dict[str, Any]) -> list[dict[str, Any]]:
    """Group slots by (store, rounded AOV) into promo campaigns."""
    aov_table = slot_tables.get("aov_table", [])
    stores = slot_tables.get("stores", [])

    buckets: dict[tuple[str, int], list[str]] = {}

    for row in aov_table:
        slot = row["slot"]
        for store_id in stores:
            aov = row.get(store_id)
            if aov is None or aov <= 0:
                continue
            rounded = _ceil5(aov)
            buckets.setdefault((store_id, rounded), []).append(slot)

    plan: list[dict[str, Any]] = []
    for (store_id, rounded_aov), slots in sorted(buckets.items()):
        plan.append({
            "campaign_name": f"Resgro-{store_id}-${rounded_aov}",
            "store_id": store_id,
            "min_subtotal": rounded_aov,
            "slots": _slot_nums(slots),
        })
    return plan


# ---------------------------------------------------------------------------
# Ads Table builder
# ---------------------------------------------------------------------------


def _build_ads_table(slot_tables: dict[str, Any]) -> list[dict[str, Any]]:
    """Collect slots with profitability > 60% per store into ads campaigns."""
    prof_table = slot_tables.get("profitability_table", [])
    stores = slot_tables.get("stores", [])

    ads: dict[str, list[str]] = {}
    for row in prof_table:
        slot = row["slot"]
        for store_id in stores:
            prof = row.get(store_id)
            if prof is not None and prof > 60:
                ads.setdefault(store_id, []).append(slot)

    return [
        {"campaign_name": f"Resgro-Ads-{sid}", "store_id": sid, "slots": _slot_nums(slots)}
        for sid, slots in sorted(ads.items())
    ]


# ---------------------------------------------------------------------------
# Backward-compat bridge to RecommendedCampaign / MarketingPlan
# ---------------------------------------------------------------------------


def _to_recommended_campaigns(
    campaign_plan: list[dict[str, Any]],
    ads_table: list[dict[str, Any]],
) -> list[RecommendedCampaign]:
    campaigns: list[RecommendedCampaign] = []
    for cp in campaign_plan:
        campaigns.append(
            RecommendedCampaign(
                campaign_type="promo",
                campaign_name=cp["campaign_name"],
                budget=0.0,
                start_date=utc_now_iso(),
                duration_days=7,
                target_day_parts=[str(s) for s in cp["slots"]],
                target_items=[],
                discount_pct=0.0,
                rationale=f"Store {cp['store_id']}, min subtotal ${cp['min_subtotal']}, {len(cp['slots'])} slots.",
            )
        )
    for ad in ads_table:
        campaigns.append(
            RecommendedCampaign(
                campaign_type="sponsored_listing",
                campaign_name=ad["campaign_name"],
                budget=0.0,
                start_date=utc_now_iso(),
                duration_days=7,
                target_day_parts=[str(s) for s in ad["slots"]],
                target_items=[],
                discount_pct=0.0,
                rationale=f"Store {ad['store_id']}, {len(ad['slots'])} high-profitability slots (>80%).",
            )
        )
    return campaigns


# ---------------------------------------------------------------------------
# Fallback: build slot tables directly from a financial CSV
# ---------------------------------------------------------------------------


def _slot_tables_from_csv(csv_path: str | Path) -> dict[str, Any]:
    """Build slot tables from a FINANCIAL_DETAILED CSV when no deepdive analysis exists."""
    import pandas as pd
    from agents.deepdive.analyzer import build_slot_tables

    df = pd.read_csv(csv_path)
    return build_slot_tables({"financial_detailed": df})


def _slot_tables_from_uploaded_csvs(
    aov_csv_path: str | Path,
    profitability_csv_path: str | Path | None = None,
) -> dict[str, Any]:
    """Build slot_tables dict from the two CSVs downloaded from DeepDive."""
    import pandas as pd

    aov_df = pd.read_csv(aov_csv_path)
    if "slot" not in aov_df.columns:
        return {}
    stores = [c for c in aov_df.columns if c != "slot"]
    aov_records = []
    for _, row in aov_df.iterrows():
        rec: dict[str, Any] = {"slot": row["slot"]}
        for s in stores:
            val = row[s]
            rec[s] = float(val) if pd.notna(val) else None
        aov_records.append(rec)

    prof_records: list[dict[str, Any]] = []
    if profitability_csv_path and Path(profitability_csv_path).is_file():
        prof_df = pd.read_csv(profitability_csv_path)
        for _, row in prof_df.iterrows():
            rec = {"slot": row.get("slot", "")}
            for s in stores:
                val = row.get(s)
                rec[s] = float(val) if pd.notna(val) else None
            prof_records.append(rec)

    return {
        "slots": [r["slot"] for r in aov_records],
        "stores": stores,
        "aov_table": aov_records,
        "profitability_table": prof_records,
    }


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def run(
    operator_id: str,
    *,
    mode: str = "deepdive",
    deepdive_report: dict[str, Any] | None = None,
    financial_report_path: str | None = None,
    aov_csv_path: str | None = None,
    profitability_csv_path: str | None = None,
    doordash_email: str | None = None,
    doordash_password: str | None = None,
    reporting_root: str = "agents/resgro-browser-automation",
    operator_profile: dict[str, Any] | None = None,
    budget_cap: float | None = None,
    campaign_history: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build campaign plan + ads table from DeepDive slot tables."""
    slot_tables: dict[str, Any] | None = None

    def _has_both() -> bool:
        return bool(slot_tables and slot_tables.get("aov_table") and slot_tables.get("profitability_table"))

    # 1. Try uploaded AOV/profitability CSVs (downloaded from DeepDive)
    if aov_csv_path:
        slot_tables = _slot_tables_from_uploaded_csvs(aov_csv_path, profitability_csv_path)

    # 2. Try deepdive_report passed directly
    if not _has_both():
        if deepdive_report and "slot_tables" in deepdive_report:
            slot_tables = deepdive_report["slot_tables"]

    # 3. Try saved analysis on disk
    if not _has_both():
        analysis_path = _deepdive_analysis_path(operator_id)
        if analysis_path.is_file():
            analysis = json.loads(analysis_path.read_text(encoding="utf-8"))
            if analysis.get("slot_tables", {}).get("aov_table"):
                slot_tables = analysis["slot_tables"]

    # 4. Fallback: build directly from financial CSV (always has both tables)
    if not _has_both() and financial_report_path:
        slot_tables = _slot_tables_from_csv(financial_report_path)

    if not slot_tables or not slot_tables.get("aov_table"):
        return {
            "operator_id": operator_id,
            "status": "no_data",
            "message": "No slot tables available. Run DeepDive with FINANCIAL_DETAILED data first.",
        }

    campaign_plan = _build_campaign_plan(slot_tables)
    ads_table = _build_ads_table(slot_tables)
    recommended = _to_recommended_campaigns(campaign_plan, ads_table)

    plan = MarketingPlan(
        operator_id=operator_id,
        plan_date=utc_now_iso(),
        recommended_campaigns=recommended,
        approval_status="pending",
        approver_notes="",
    )

    plan_file = _plan_path(operator_id)
    plan_file.parent.mkdir(parents=True, exist_ok=True)
    plan_file.write_text(plan.model_dump_json(indent=2), encoding="utf-8")

    result = json.loads(plan.model_dump_json())
    result["campaign_plan"] = campaign_plan
    result["ads_table"] = ads_table
    result["slot_tables"] = slot_tables
    result["status"] = "success"
    return result


def approve(operator_id: str, command: str, notes: str = "") -> dict[str, Any]:
    path = _plan_path(operator_id)
    plan = MarketingPlan.model_validate_json(path.read_text(encoding="utf-8"))
    if command not in ("approve", "reject", "modify"):
        raise ValueError("command must be approve|reject|modify")
    apply_command(plan, command, notes)  # type: ignore[arg-type]
    path.write_text(plan.model_dump_json(indent=2), encoding="utf-8")
    return json.loads(plan.model_dump_json())


if __name__ == "__main__":
    import sys

    oid = sys.argv[1] if len(sys.argv) > 1 else "dev_operator"
    print(json.dumps(run(oid), indent=2))
