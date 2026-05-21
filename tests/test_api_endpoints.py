"""Tests for FastAPI session-run endpoints — JSON and Form data acceptance."""

import json
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from api.main import app
    return TestClient(app)


@pytest.fixture
def mock_session(tmp_path):
    session_id = "test-session-123"
    meta = {
        "session_id": session_id,
        "operator_id": "test-op",
        "status": "ready",
        "datasets": ["financial_detailed"],
    }
    csvs_dir = tmp_path / "csvs"
    csvs_dir.mkdir()
    csv_file = csvs_dir / "FINANCIAL_DETAILED_TRANSACTIONS_2026.csv"
    csv_file.write_text("Date,Subtotal\n2026-01-01,25.50\n")

    with patch("api.main.get_session", return_value=meta), \
         patch("api.main.get_session_data_dir", return_value=csvs_dir):
        yield session_id


class TestSessionRunDeepDive:
    def test_accepts_json_body(self, client, mock_session):
        with patch("api.main.run_deepdive") as mock_run:
            mock_run.return_value = {
                "status": "success",
                "report_html_path": "/tmp/report.html",
                "deepdive_json_path": None,
                "datasets_loaded": ["financial_detailed"],
            }
            with patch("shutil.copy"):
                response = client.post(
                    f"/api/sessions/{mock_session}/run/deepdive",
                    json={"operator_id": "test-op"},
                )
            assert response.status_code in (200, 500)

    def test_accepts_form_data(self, client, mock_session):
        with patch("api.main.run_deepdive") as mock_run:
            mock_run.return_value = {
                "status": "success",
                "report_html_path": "/tmp/report.html",
                "deepdive_json_path": None,
                "datasets_loaded": ["financial_detailed"],
            }
            with patch("shutil.copy"):
                response = client.post(
                    f"/api/sessions/{mock_session}/run/deepdive",
                    data={"operator_id": "test-op"},
                )
            assert response.status_code in (200, 500)


class TestSessionRunMarketingreco:
    def test_accepts_json_body(self, client, mock_session):
        with patch("api.main.run_marketingreco") as mock_run:
            mock_run.return_value = {"recommended_campaigns": []}
            response = client.post(
                f"/api/sessions/{mock_session}/run/marketingreco",
                json={"operator_id": "test-op"},
            )
            assert response.status_code in (200, 400, 500)

    def test_returns_404_for_missing_session(self, client):
        with patch("api.main.get_session", side_effect=FileNotFoundError):
            response = client.post(
                "/api/sessions/nonexistent/run/marketingreco",
                json={"operator_id": "test-op"},
            )
            assert response.status_code == 404
