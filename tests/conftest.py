import os
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")


@pytest.fixture
def tmp_dir(tmp_path):
    return tmp_path


@pytest.fixture
def sample_financial_csv(tmp_path):
    csv = tmp_path / "FINANCIAL_DETAILED_TRANSACTIONS_2026.csv"
    csv.write_text(
        "Date,Store Name,Order ID,Subtotal,Commission,Net Payout\n"
        "2026-01-01,Test Store,ORD-001,25.50,5.10,20.40\n"
        "2026-01-02,Test Store,ORD-002,18.00,3.60,14.40\n"
        "2026-01-03,Test Store,ORD-003,32.75,6.55,26.20\n"
    )
    return csv


@pytest.fixture
def sample_sales_csv(tmp_path):
    csv = tmp_path / "SALES_viewByOrder_2026.csv"
    csv.write_text(
        "Date,Store Name,Order ID,Subtotal,Items Sold\n"
        "2026-01-01,Test Store,ORD-001,25.50,3\n"
        "2026-01-02,Test Store,ORD-002,18.00,2\n"
    )
    return csv


@pytest.fixture
def sample_marketing_csv(tmp_path):
    csv = tmp_path / "MARKETING_PROMOTION_2026.csv"
    csv.write_text(
        "Campaign Name,Spend,Orders,Revenue\n"
        "Summer Sale,100.00,20,500.00\n"
        "Free Delivery,50.00,15,300.00\n"
    )
    return csv


@pytest.fixture
def sample_zip(tmp_path, sample_financial_csv, sample_sales_csv):
    import zipfile
    zip_path = tmp_path / "export.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.write(sample_financial_csv, sample_financial_csv.name)
        zf.write(sample_sales_csv, sample_sales_csv.name)
    return zip_path


@pytest.fixture
def nested_zip(tmp_path, sample_financial_csv):
    import zipfile
    inner = tmp_path / "inner.zip"
    with zipfile.ZipFile(inner, "w") as zf:
        zf.write(sample_financial_csv, sample_financial_csv.name)
    outer = tmp_path / "outer.zip"
    with zipfile.ZipFile(outer, "w") as zf:
        zf.write(inner, "inner.zip")
    return outer
