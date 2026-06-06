"""
Generic fallback analysis for unrecognized data files.

When a user uploads files that are not recognized DoorDash/UberEats exports,
we still read them, infer context from the column names, and return a basic
summary plus 2-3 preview tables so the upload is never a dead end.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd

from agents.deepdive.data_loader import _classify_csv

_MAX_FILES = 3
_MAX_READ_ROWS = 50_000
_SAMPLE_ROWS = 10

# Column-name keywords → human-readable context guesses
_CONTEXT_HINTS: list[tuple[tuple[str, ...], str]] = [
    (("order", "transaction", "sale"), "sales / order transactions"),
    (("revenue", "payout", "amount", "price", "total", "subtotal", "cost"), "financial figures"),
    (("customer", "client", "user", "name", "email", "phone"), "customer records"),
    (("item", "product", "menu", "sku", "dish"), "menu / product catalog data"),
    (("date", "time", "day", "month", "week", "timestamp"), "time-series records"),
    (("store", "location", "branch", "restaurant", "outlet"), "per-store / location data"),
    (("rating", "review", "feedback", "score"), "ratings or feedback data"),
    (("campaign", "promo", "ad", "marketing", "discount"), "marketing / promotion data"),
    (("employee", "staff", "shift", "labor", "wage"), "staffing / labor data"),
    (("inventory", "stock", "supply", "ingredient"), "inventory / supply data"),
]


def _infer_context(columns: list[str]) -> str:
    lower = " ".join(str(c).lower() for c in columns)
    matches = [label for keywords, label in _CONTEXT_HINTS if any(k in lower for k in keywords)]
    if not matches:
        return "tabular data (context could not be determined from column names)"
    return ", ".join(dict.fromkeys(matches))


def _read_table(path: Path) -> pd.DataFrame | None:
    try:
        if path.suffix.lower() in (".xlsx", ".xls"):
            return pd.read_excel(path, nrows=_MAX_READ_ROWS)
        return pd.read_csv(path, low_memory=False, nrows=_MAX_READ_ROWS, encoding_errors="replace")
    except Exception:
        return None


def _clean_cell(v: Any) -> Any:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    if isinstance(v, float):
        return round(v, 2)
    return str(v)[:120] if isinstance(v, str) else v


def _df_to_table(df: pd.DataFrame, max_cols: int = 12, max_rows: int = _SAMPLE_ROWS) -> dict[str, Any]:
    cols = [str(c) for c in df.columns[:max_cols]]
    rows = [
        {str(c): _clean_cell(rec.get(c)) for c in cols}
        for rec in df.head(max_rows).to_dict("records")
    ]
    return {"columns": cols, "rows": rows}


def find_unrecognized_files(csvs_dir: Path) -> list[Path]:
    """All CSV/Excel files in the session that did not match a known export type."""
    if not csvs_dir.is_dir():
        return []
    files: list[Path] = []
    for pattern in ("*.csv", "*.xlsx", "*.xls"):
        files.extend(csvs_dir.rglob(pattern))
    return sorted(p for p in files if _classify_csv(p.name) == "unknown")


def analyze_unrecognized_files(csvs_dir: Path) -> dict[str, Any] | None:
    """
    Basic analysis of unrecognized data files: read column names, infer context,
    return a markdown summary plus 2-3 preview tables.
    Returns None when there is nothing readable to analyze.
    """
    candidates = find_unrecognized_files(csvs_dir)
    if not candidates:
        return None

    tables: dict[str, dict[str, Any]] = {}
    summary_lines: list[str] = []
    analyzed = 0

    for path in candidates:
        if analyzed >= _MAX_FILES:
            summary_lines.append(f"\n_(+{len(candidates) - _MAX_FILES} more file(s) not shown)_")
            break
        df = _read_table(path)
        if df is None or df.empty:
            continue
        analyzed += 1

        context = _infer_context([str(c) for c in df.columns])
        numeric_cols = df.select_dtypes(include="number").columns.tolist()

        summary_lines.append(
            f"**{path.name}** — {len(df):,} rows × {len(df.columns)} columns. "
            f"Looks like {context}. "
            f"Columns: {', '.join(str(c) for c in df.columns[:12])}"
            + ("…" if len(df.columns) > 12 else "")
        )

        # Table 1: sample rows
        tables[f"Sample — {path.name}"] = _df_to_table(df)

        # Table 2: numeric summary (only once, for the first file with numbers)
        if numeric_cols and not any(k.startswith("Numeric summary") for k in tables):
            desc = df[numeric_cols[:10]].describe().round(2).reset_index()
            desc = desc.rename(columns={"index": "stat"})
            tables[f"Numeric summary — {path.name}"] = _df_to_table(desc, max_rows=10)

        # Table 3: column overview (first file only)
        if not any(k.startswith("Column overview") for k in tables):
            overview = pd.DataFrame(
                {
                    "column": [str(c) for c in df.columns],
                    "dtype": [str(t) for t in df.dtypes],
                    "non_null": [int(df[c].notna().sum()) for c in df.columns],
                    "sample_value": [_clean_cell(df[c].dropna().iloc[0]) if df[c].notna().any() else "" for c in df.columns],
                }
            )
            tables[f"Column overview — {path.name}"] = _df_to_table(overview, max_rows=20)

        if len(tables) >= 3 and analyzed >= 1:
            # Keep it to 2-3 tables overall; stop adding extra per-file samples
            break

    if not tables:
        return None

    summary = (
        "The uploaded file(s) are not standard DoorDash/UberEats exports, "
        "so I ran a basic analysis instead.\n\n" + "\n\n".join(summary_lines) +
        "\n\nFor the full ResGro analysis (DeepDive, Marketing Recommendations), "
        "upload DoorDash Merchant Portal exports (financial, marketing, operations or sales reports)."
    )

    return {
        "status": "generic_analysis",
        "summary": summary,
        "tables": tables,
        "files_analyzed": analyzed,
    }
