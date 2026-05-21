"""Load DoorDash export zips from disk: unzip, detect CSV type, load into DataFrames."""

from __future__ import annotations

import logging
import zipfile
from pathlib import Path
from typing import Any

import pandas as pd

_log = logging.getLogger("deepdive.data_loader")

# Map filename patterns to dataset category keys.
# Patterns are matched case-insensitively against the CSV filename.
# Order matters: more specific patterns must come before generic ones.
_CATEGORY_PATTERNS: list[tuple[str, str]] = [
    # Financial
    ("FINANCIAL_DETAILED_TRANSACTIONS", "financial_detailed"),
    ("FINANCIAL_SIMPLIFIED_TRANSACTIONS", "financial_simplified"),
    ("FINANCIAL_ERROR_CHARGES", "financial_errors"),
    ("FINANCIAL_PAYOUT_SUMMARY", "financial_payouts"),
    ("RED_CARD_TRANSACTION_DETAILS", "red_card_transactions"),
    ("RED_CARD_ORDER_ITEM_DETAILS", "red_card_items"),
    ("RED_CARD_OPERATIONS_AND_CONSUMER", "red_card_ops"),
    # Marketing
    ("MARKETING_PROMOTION", "marketing_promotions"),
    ("MARKETING_SPONSORED_LISTING", "marketing_sponsored"),
    # Operations Quality — viewByOrder
    ("operations_quality_avoidable_wait", "ops_avoidable_wait"),
    ("operations_quality_cancelled_orders", "ops_cancelled"),
    ("operations_quality_missing_incorrect", "ops_missing_incorrect"),
    # Operations Quality — viewByStore (specific before generic)
    ("viewByStore_aggregate", "ops_store_aggregate"),
    ("viewByStore_cancellations", "ops_store_cancellations"),
    ("viewByStore_downtime", "ops_store_downtime"),
    ("viewByStore_missingAndIncorrect", "ops_store_missing_incorrect"),
    # Operations Quality — viewByTime (specific before generic)
    ("viewByTime_aggregate", "ops_time_aggregate"),
    ("viewByTime_byStore", "ops_time_by_store"),
    ("viewByTime_productMix", "ops_time_product_mix"),
    # Sales — DD_LAZ naming (SALES_BY_ORDER, SALES_BY_STORE, SALES_BY_TIME)
    ("SALES_BY_ORDER", "sales_by_order"),
    ("SALES_BY_STORE", "sales_by_store"),
    ("SALES_BY_TIME", "sales_by_time"),
    # Sales — legacy naming (SALES_viewByOrder, etc.)
    ("SALES_viewByOrder", "sales_by_order"),
    ("SALES_viewByStore_productPerformance", "sales_store_product"),
    ("SALES_viewByStore_customerCounts", "sales_store_customers"),
    ("SALES_viewByTime_productPerformance_", "sales_time_product"),
    ("SALES_viewByTime_customerCounts_", "sales_time_customers"),
    ("SALES_viewByTime_byStoreProductPerformance", "sales_time_store_product"),
    ("SALES_viewByTime_byStoreCustomerCounts", "sales_time_store_customers"),
    # Product Mix
    ("PRODUCT_MIX", "product_mix"),
    # Support
    ("SUPPORT_", "support"),
]


# ---------- Upload audit ----------

EXPECTED_ZIP_GROUPS: dict[str, dict] = {
    "financial": {
        "label": "Financial",
        "zip_pattern": "financial_",
        "categories": ["financial_detailed", "financial_simplified", "financial_errors", "financial_payouts"],
        "description": "Detailed transactions, simplified transactions, error charges, payout summary",
    },
    "marketing": {
        "label": "Marketing",
        "zip_pattern": "marketing_",
        "categories": ["marketing_promotions", "marketing_sponsored"],
        "description": "Promotion performance, sponsored listing performance",
    },
    "ops_by_order": {
        "label": "Operations Quality (by Order)",
        "zip_pattern": "OPERATIONS_QUALITY_viewByORDER_",
        "categories": ["ops_avoidable_wait", "ops_cancelled", "ops_missing_incorrect"],
        "description": "Avoidable wait orders, cancelled orders, missing/incorrect orders",
    },
    "ops_by_store": {
        "label": "Operations Quality (by Store)",
        "zip_pattern": "OPERATIONS_QUALITY_viewByStore_",
        "categories": ["ops_store_aggregate", "ops_store_cancellations", "ops_store_downtime", "ops_store_missing_incorrect"],
        "description": "Store scorecard, cancellation breakdown, downtime, error breakdown",
    },
    "ops_by_time": {
        "label": "Operations Quality (by Time)",
        "zip_pattern": "OPERATIONS_QUALITY_viewByTime_",
        "categories": ["ops_time_aggregate", "ops_time_by_store", "ops_time_product_mix"],
        "description": "Daily quality trends, store-level trends, product mix quality",
    },
    "product_mix": {
        "label": "Product Mix",
        "zip_pattern": "product_mix_",
        "categories": ["product_mix"],
        "description": "Item-level sales, discounts, and error rates",
    },
    "sales_by_order": {
        "label": "Sales (by Order)",
        "zip_pattern": "sales_",
        "categories": ["sales_by_order"],
        "description": "Individual order-level sales data",
    },
    "sales_by_store": {
        "label": "Sales (by Store)",
        "zip_pattern": "sales_",
        "categories": ["sales_by_store"],
        "description": "Aggregated sales per store",
    },
    "sales_by_time": {
        "label": "Sales (by Time)",
        "zip_pattern": "sales_",
        "categories": ["sales_by_time"],
        "description": "Daily sales time-series",
    },
}


def build_upload_audit(datasets: dict[str, pd.DataFrame], uploaded_filenames: list[str] | None = None) -> dict[str, Any]:
    """Return an audit of which data groups were found vs missing."""
    loaded_keys = {k for k, v in datasets.items() if isinstance(v, pd.DataFrame) and not v.empty}

    uploaded: list[dict[str, Any]] = []
    missing: list[dict[str, Any]] = []

    for group_id, info in EXPECTED_ZIP_GROUPS.items():
        found_cats = [c for c in info["categories"] if c in loaded_keys]
        entry = {
            "group": group_id,
            "label": info["label"],
            "description": info["description"],
            "categories_expected": info["categories"],
            "categories_found": found_cats,
        }
        if found_cats:
            uploaded.append(entry)
        else:
            missing.append(entry)

    return {
        "uploaded": uploaded,
        "missing": missing,
        "uploaded_count": len(uploaded),
        "missing_count": len(missing),
        "total_groups": len(EXPECTED_ZIP_GROUPS),
        "datasets_loaded": sorted(loaded_keys - {"store_id_mapping"}),
    }


_DD_ID_CANDIDATES = [
    "Store ID",
    "Merchant store ID",
    "Merchant Store ID",
]

_NATIONAL_ID_CANDIDATES = [
    "National Store ID",
    "Merchant Supplied ID",
    "Merchant supplied ID",
    "Merchant supplied store ID",
    "Merchant Supplied Store ID",
]


def _classify_csv(filename: str) -> str:
    """Return a category key for a CSV filename, or 'unknown'."""
    fn_lower = filename.lower()
    for pattern, key in _CATEGORY_PATTERNS:
        if pattern.lower() in fn_lower:
            return key
    return "unknown"


def expand_nested_export_zips(root: Path, *, max_rounds: int = 35) -> None:
    """
    DoorDash archives are often a zip of zips. Extract every nested ``.zip`` under ``root``
    into its parent directory until only non-zip exports remain (or no progress).
    """
    for _ in range(max_rounds):
        zips = sorted(
            p for p in root.rglob("*.zip") if p.is_file() and "__MACOSX" not in p.parts
        )
        if not zips:
            break
        extracted = 0
        for zp in zips:
            try:
                with zipfile.ZipFile(zp, "r") as zf:
                    zf.extractall(zp.parent)
                zp.unlink(missing_ok=True)
                extracted += 1
            except (zipfile.BadZipFile, OSError):
                continue
        if extracted == 0:
            break


def _merge_category_frame(datasets: dict[str, pd.DataFrame], category: str, df: pd.DataFrame) -> None:
    """Merge another CSV of the same category (multi-export / multi-period uploads)."""
    if category == "unknown":
        return
    prev = datasets.get(category)
    if prev is not None and not prev.empty:
        try:
            common_cols = list(set(prev.columns) & set(df.columns))
            if not common_cols:
                _log.warning("No common columns between frames for %s, keeping original", category)
                return
            for col in common_cols:
                if prev[col].dtype == object or df[col].dtype == object:
                    prev[col] = prev[col].astype(str)
                    df[col] = df[col].astype(str)
            datasets[category] = pd.concat([prev, df], ignore_index=True, sort=False)
        except Exception as exc:
            _log.warning("Failed to merge %s frames: %s — keeping latest", category, exc)
            datasets[category] = df
    else:
        datasets[category] = df


def _unzip_all(zip_paths: list[Path], extract_to: Path) -> list[Path]:
    """Unzip all zips into extract_to directory, return list of CSV paths."""
    csvs: list[Path] = []
    for zp in zip_paths:
        if not zp.exists() or zp.suffix.lower() != ".zip":
            continue
        with zipfile.ZipFile(zp, "r") as zf:
            zf.extractall(extract_to)
    # Collect all CSVs recursively
    csvs = sorted(extract_to.rglob("*.csv"))
    return csvs


def _parse_numeric_cols(df: pd.DataFrame) -> pd.DataFrame:
    """Try to coerce likely-numeric columns to float."""
    for col in df.columns:
        if pd.api.types.is_string_dtype(df[col]):
            try:
                converted = pd.to_numeric(df[col].astype(str).str.replace(",", ""), errors="coerce")
                if converted.notna().sum() > converted.isna().sum():
                    df[col] = converted
            except (AttributeError, TypeError):
                pass
    return df


def _pick_col(df: pd.DataFrame, names: list[str]) -> str | None:
    for n in names:
        if n in df.columns:
            return n
    return None


def _norm_id(v: Any) -> str | None:
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except TypeError:
        pass
    s = str(v).strip()
    if not s:
        return None
    try:
        return str(int(float(s)))
    except (TypeError, ValueError):
        return s


def _build_store_id_map(fin_df: pd.DataFrame) -> tuple[dict[str, str], dict[str, str]]:
    """
    Build DD <-> National store ID mapping from FINANCIAL data.
    Returns (dd_to_national, national_to_dd).
    """
    dd_col = _pick_col(fin_df, _DD_ID_CANDIDATES)
    nat_col = _pick_col(fin_df, _NATIONAL_ID_CANDIDATES)
    if not dd_col or not nat_col:
        return {}, {}

    pairs = fin_df[[dd_col, nat_col]].dropna(how="any")
    dd_to_nat: dict[str, str] = {}
    nat_to_dd: dict[str, str] = {}
    for _, row in pairs.iterrows():
        dd = _norm_id(row.get(dd_col))
        nat = _norm_id(row.get(nat_col))
        if not dd or not nat:
            continue
        dd_to_nat.setdefault(dd, nat)
        nat_to_dd.setdefault(nat, dd)
    return dd_to_nat, nat_to_dd


def _ensure_store_id_columns(
    df: pd.DataFrame,
    dd_to_nat: dict[str, str],
    nat_to_dd: dict[str, str],
) -> pd.DataFrame:
    """
    Ensure both `Store ID` (DoorDash) and `National Store ID` exist where possible.
    """
    if df.empty:
        return df
    out = df.copy()
    dd_col = _pick_col(out, _DD_ID_CANDIDATES)
    nat_col = _pick_col(out, _NATIONAL_ID_CANDIDATES)

    # Canonicalize column names when source columns exist.
    rename: dict[str, str] = {}
    if dd_col and dd_col != "Store ID":
        rename[dd_col] = "Store ID"
        dd_col = "Store ID"
    if nat_col and nat_col != "National Store ID":
        rename[nat_col] = "National Store ID"
        nat_col = "National Store ID"
    if rename:
        out = out.rename(columns=rename)

    if "Store ID" in out.columns:
        out["Store ID"] = out["Store ID"].map(_norm_id)
    if "National Store ID" in out.columns:
        out["National Store ID"] = out["National Store ID"].map(_norm_id)

    # Fill missing National Store ID from DD mapping.
    if "Store ID" in out.columns:
        if "National Store ID" not in out.columns:
            out["National Store ID"] = out["Store ID"].map(dd_to_nat)
        else:
            missing_nat = out["National Store ID"].isna() | out["National Store ID"].astype(str).str.strip().eq("")
            out.loc[missing_nat, "National Store ID"] = out.loc[missing_nat, "Store ID"].map(dd_to_nat)

    # Fill missing DD Store ID from reverse mapping when possible.
    if "National Store ID" in out.columns:
        if "Store ID" not in out.columns:
            out["Store ID"] = out["National Store ID"].map(nat_to_dd)
        else:
            missing_dd = out["Store ID"].isna() | out["Store ID"].astype(str).str.strip().eq("")
            out.loc[missing_dd, "Store ID"] = out.loc[missing_dd, "National Store ID"].map(nat_to_dd)

    return out


def _apply_store_id_mapping(datasets: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
    """
    Build DoorDash<->National mapping from financial datasets and apply to all datasets.
    """
    fin_sources = [datasets.get("financial_detailed"), datasets.get("financial_payouts"), datasets.get("financial_simplified")]
    dd_to_nat: dict[str, str] = {}
    nat_to_dd: dict[str, str] = {}
    for fin_df in fin_sources:
        if fin_df is None or fin_df.empty:
            continue
        d2n, n2d = _build_store_id_map(fin_df)
        dd_to_nat.update({k: v for k, v in d2n.items() if k not in dd_to_nat})
        nat_to_dd.update({k: v for k, v in n2d.items() if k not in nat_to_dd})

    if not dd_to_nat and not nat_to_dd:
        return datasets

    mapped: dict[str, pd.DataFrame] = {}
    for key, df in datasets.items():
        mapped[key] = _ensure_store_id_columns(df, dd_to_nat=dd_to_nat, nat_to_dd=nat_to_dd)

    # Expose mapping for debug/API usage.
    mapping_rows = [{"doordash_store_id": dd, "national_store_id": nat} for dd, nat in sorted(dd_to_nat.items())]
    mapped["store_id_mapping"] = pd.DataFrame(mapping_rows)
    return mapped


def load_ssm_zips(zip_dir: Path) -> dict[str, pd.DataFrame]:
    """
    Given a directory containing `.zip` export files, unzip and load all CSVs.
    Returns dict mapping category key -> DataFrame.
    """
    expand_nested_export_zips(zip_dir)

    zip_paths = sorted(
        p
        for p in zip_dir.rglob("*.zip")
        if p.is_file() and "_extracted" not in p.parts and "__MACOSX" not in p.parts
    )

    extract_to = zip_dir / "_extracted"
    extract_to.mkdir(exist_ok=True)

    if zip_paths:
        csv_paths = _unzip_all(zip_paths, extract_to)
    else:
        csv_paths = sorted(
            p
            for p in zip_dir.rglob("*.csv")
            if p.is_file() and "__MACOSX" not in p.parts and "_extracted" not in p.parts
        )

    datasets: dict[str, pd.DataFrame] = {}
    for csv_path in csv_paths:
        category = _classify_csv(csv_path.name)
        if category == "unknown":
            continue
        try:
            df = pd.read_csv(csv_path, low_memory=False)
            df = _parse_numeric_cols(df)
            _merge_category_frame(datasets, category, df)
        except Exception as exc:
            _log.warning("Skipped file %s: %s", csv_path.name, exc)
            continue

    return _apply_store_id_mapping(datasets)


def load_files(paths: list[Path | str]) -> dict[str, pd.DataFrame]:
    """Backwards-compatible entry: accepts list of paths (zip dir or individual zips)."""
    if not paths:
        return {}
    first = Path(paths[0])
    if first.is_dir():
        return load_ssm_zips(first)
    # If paths are individual zip files, use parent dir
    zip_dir = first.parent
    return load_ssm_zips(zip_dir)
