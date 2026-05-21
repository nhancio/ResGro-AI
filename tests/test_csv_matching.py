"""Tests for financial CSV pattern matching — verifies broadened search logic."""

from pathlib import Path

import pytest


def find_financial_csv(data_dir: Path) -> str | None:
    """Replicate the broadened CSV matching logic from api/main.py session_run_marketingreco."""
    fin_csv = None
    for p in sorted(data_dir.rglob("*FINANCIAL*DETAILED*.csv")):
        fin_csv = str(p)
        break
    if not fin_csv:
        for p in sorted(data_dir.rglob("*.csv")):
            if "financial" in p.name.lower():
                fin_csv = str(p)
                break
    if not fin_csv:
        import pandas as pd
        financial_indicators = {
            "revenue", "sales", "cost", "profit", "amount",
            "transaction", "payment", "payout", "subtotal", "commission",
        }
        for p in sorted(data_dir.rglob("*.csv")):
            try:
                cols = {c.lower() for c in pd.read_csv(p, nrows=0).columns}
                if cols & financial_indicators:
                    fin_csv = str(p)
                    break
            except Exception:
                continue
    return fin_csv


class TestFinancialCsvMatching:
    def test_standard_doordash_filename(self, tmp_path):
        csv = tmp_path / "FINANCIAL_DETAILED_TRANSACTIONS_2026-01-01_2026-03-31.csv"
        csv.write_text("Date,Subtotal\n2026-01-01,25.50\n")
        assert find_financial_csv(tmp_path) is not None

    def test_simplified_financial_filename(self, tmp_path):
        csv = tmp_path / "financial_data.csv"
        csv.write_text("Date,Revenue\n2026-01-01,1000\n")
        assert find_financial_csv(tmp_path) is not None

    def test_uppercase_financial(self, tmp_path):
        csv = tmp_path / "FINANCIAL_REPORT.csv"
        csv.write_text("Date,Amount\n2026-01-01,500\n")
        assert find_financial_csv(tmp_path) is not None

    def test_unrelated_filename_but_financial_columns(self, tmp_path):
        csv = tmp_path / "data_export_q1.csv"
        csv.write_text("Date,Revenue,Commission,Subtotal\n2026-01-01,1000,200,800\n")
        result = find_financial_csv(tmp_path)
        assert result is not None

    def test_non_financial_file_not_matched(self, tmp_path):
        csv = tmp_path / "employee_roster.csv"
        csv.write_text("Name,Department,Start Date\nJohn,Ops,2024-01-01\n")
        assert find_financial_csv(tmp_path) is None

    def test_nested_directory(self, tmp_path):
        subdir = tmp_path / "exports" / "2026"
        subdir.mkdir(parents=True)
        csv = subdir / "financial_summary.csv"
        csv.write_text("Date,Payout\n2026-01-01,500\n")
        assert find_financial_csv(tmp_path) is not None

    def test_empty_directory(self, tmp_path):
        assert find_financial_csv(tmp_path) is None
