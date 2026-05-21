"""Tests for agents/deepdive/data_loader.py — merge handling and classification."""

import pandas as pd
import pytest

from agents.deepdive.data_loader import (
    _classify_csv,
    _merge_category_frame,
    _parse_numeric_cols,
)


class TestClassifyCsv:
    def test_financial_detailed(self):
        assert _classify_csv("FINANCIAL_DETAILED_TRANSACTIONS_2026.csv") == "financial_detailed"

    def test_sales_by_order(self):
        assert _classify_csv("SALES_viewByOrder_2026.csv") == "sales_by_order"

    def test_marketing_promotion(self):
        assert _classify_csv("MARKETING_PROMOTION_2026.csv") == "marketing_promotions"

    def test_unknown_file(self):
        assert _classify_csv("random_report.csv") == "unknown"

    def test_support(self):
        assert _classify_csv("SUPPORT_2026.csv") == "support"


class TestMergeCategoryFrame:
    def test_merge_identical_columns(self):
        datasets = {}
        df1 = pd.DataFrame({"A": [1, 2], "B": ["x", "y"]})
        df2 = pd.DataFrame({"A": [3, 4], "B": ["z", "w"]})
        _merge_category_frame(datasets, "financial_detailed", df1)
        _merge_category_frame(datasets, "financial_detailed", df2)
        assert len(datasets["financial_detailed"]) == 4

    def test_merge_different_columns_no_overlap(self):
        datasets = {}
        df1 = pd.DataFrame({"A": [1, 2]})
        _merge_category_frame(datasets, "sales_by_order", df1)
        df2 = pd.DataFrame({"X": [3, 4]})
        _merge_category_frame(datasets, "sales_by_order", df2)
        assert len(datasets["sales_by_order"]) == 2

    def test_merge_mixed_dtypes(self):
        datasets = {}
        df1 = pd.DataFrame({"A": [1, 2], "B": ["x", "y"]})
        df2 = pd.DataFrame({"A": ["three", "four"], "B": [10, 20]})
        _merge_category_frame(datasets, "financial_detailed", df1)
        _merge_category_frame(datasets, "financial_detailed", df2)
        assert len(datasets["financial_detailed"]) == 4

    def test_skip_unknown_category(self):
        datasets = {}
        df = pd.DataFrame({"A": [1]})
        _merge_category_frame(datasets, "unknown", df)
        assert "unknown" not in datasets

    def test_empty_dataframe(self):
        datasets = {}
        df1 = pd.DataFrame({"A": [1]})
        df2 = pd.DataFrame()
        _merge_category_frame(datasets, "financial_detailed", df1)
        _merge_category_frame(datasets, "financial_detailed", df2)
        assert len(datasets["financial_detailed"]) == 1


class TestParseNumericCols:
    def test_converts_numeric_strings(self):
        df = pd.DataFrame({"amount": ["1,000.50", "2,500.00", "300.00"]})
        result = _parse_numeric_cols(df)
        assert pd.api.types.is_float_dtype(result["amount"])

    def test_leaves_non_numeric_strings(self):
        df = pd.DataFrame({"name": ["Store A", "Store B", "Store C"]})
        result = _parse_numeric_cols(df)
        assert pd.api.types.is_string_dtype(result["name"])
