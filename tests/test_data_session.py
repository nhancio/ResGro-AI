"""Tests for shared/data_session.py — session lifecycle and zip ingestion."""

import zipfile
from pathlib import Path
from unittest.mock import patch

import pytest

from shared.data_session import (
    SESSIONS_BASE,
    create_session,
    delete_session,
    get_session,
    ingest_csv_files,
    ingest_zip_files,
)


@pytest.fixture(autouse=True)
def isolate_sessions(tmp_path, monkeypatch):
    monkeypatch.setattr("shared.data_session.SESSIONS_BASE", tmp_path / "sessions")
    (tmp_path / "sessions").mkdir()
    yield


class TestCreateSession:
    def test_creates_session_with_metadata(self):
        meta = create_session("op-1", operator_name="Test Op", mode="manual")
        assert meta["operator_id"] == "op-1"
        assert meta["status"] == "empty"
        assert meta["session_id"]

    def test_creates_csvs_directory(self, tmp_path):
        meta = create_session("op-1")
        sdir = tmp_path / "sessions" / meta["session_id"]
        assert (sdir / "csvs").is_dir()


class TestIngestZipFiles:
    def test_valid_zip_extracts_csvs(self, tmp_path, sample_zip):
        meta = create_session("op-1")
        result = ingest_zip_files(meta["session_id"], [sample_zip])
        assert result["status"] == "ready"
        assert len(result["datasets"]) >= 1

    def test_nested_zip(self, tmp_path, nested_zip):
        meta = create_session("op-1")
        result = ingest_zip_files(meta["session_id"], [nested_zip])
        assert result["status"] == "ready"

    def test_invalid_zip_handled_gracefully(self, tmp_path):
        bad_zip = tmp_path / "bad.zip"
        bad_zip.write_text("not a zip file")
        meta = create_session("op-1")
        result = ingest_zip_files(meta["session_id"], [bad_zip])
        assert result["status"] == "no_data"

    def test_empty_zip(self, tmp_path):
        empty = tmp_path / "empty.zip"
        with zipfile.ZipFile(empty, "w"):
            pass
        meta = create_session("op-1")
        result = ingest_zip_files(meta["session_id"], [empty])
        assert result["status"] == "no_data"

    def test_nonexistent_path_skipped(self):
        meta = create_session("op-1")
        result = ingest_zip_files(meta["session_id"], [Path("/does/not/exist.zip")])
        assert result["status"] == "no_data"


class TestIngestCsvFiles:
    def test_stores_and_classifies_csv(self, sample_financial_csv):
        meta = create_session("op-1")
        raw = sample_financial_csv.read_bytes()
        result = ingest_csv_files(meta["session_id"], [(sample_financial_csv.name, raw)])
        assert result["status"] == "ready"
        assert "financial_detailed" in result["datasets"]


class TestGetSession:
    def test_returns_metadata(self):
        meta = create_session("op-1")
        loaded = get_session(meta["session_id"])
        assert loaded["operator_id"] == "op-1"

    def test_raises_for_missing_session(self):
        with pytest.raises(FileNotFoundError):
            get_session("nonexistent-session-id")


class TestDeleteSession:
    def test_deletes_session(self):
        meta = create_session("op-1")
        assert delete_session(meta["session_id"]) is True
        with pytest.raises(FileNotFoundError):
            get_session(meta["session_id"])

    def test_returns_false_for_missing(self):
        assert delete_session("nonexistent") is False
