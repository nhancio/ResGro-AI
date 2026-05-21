"""
Centralized data session manager.

Upload data once → get a session_id → all agents read from that session.
Sessions are stored on disk under ``data/sessions/{session_id}/``.
"""

from __future__ import annotations

import json
import shutil
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

from agents.deepdive.data_loader import (
    load_ssm_zips,
    _classify_csv,
    _parse_numeric_cols,
    _apply_store_id_mapping,
    _merge_category_frame,
    expand_nested_export_zips,
)

_ROOT = Path(__file__).resolve().parents[1]
SESSIONS_BASE = _ROOT / "data" / "sessions"
SESSIONS_BASE.mkdir(parents=True, exist_ok=True)


def _session_dir(session_id: str) -> Path:
    return SESSIONS_BASE / session_id


def create_session(
    operator_id: str,
    *,
    operator_name: str = "",
    date_range: str = "",
    mode: str = "manual",
) -> dict[str, Any]:
    session_id = str(uuid.uuid4())
    sdir = _session_dir(session_id)
    sdir.mkdir(parents=True, exist_ok=True)
    (sdir / "csvs").mkdir(exist_ok=True)

    meta = {
        "session_id": session_id,
        "operator_id": operator_id,
        "operator_name": operator_name,
        "date_range": date_range,
        "mode": mode,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "datasets": [],
        "status": "empty",
        "agent_runs": {},
    }
    _write_meta(session_id, meta)
    return meta


def ingest_zip_files(session_id: str, zip_paths: list[Path]) -> dict[str, Any]:
    """Unzip, classify, and store CSVs into the session. Returns updated metadata."""
    meta = get_session(session_id)
    sdir = _session_dir(session_id)
    csvs_dir = sdir / "csvs"
    csvs_dir.mkdir(exist_ok=True)

    for zp in zip_paths:
        if not zp.exists() or zp.suffix.lower() != ".zip":
            continue
        try:
            with zipfile.ZipFile(zp, "r") as zf:
                zf.extractall(csvs_dir)
        except (zipfile.BadZipFile, OSError):
            continue

    expand_nested_export_zips(csvs_dir)

    csv_files = sorted(csvs_dir.rglob("*.csv"))
    datasets_loaded: list[str] = []

    for csv_path in csv_files:
        category = _classify_csv(csv_path.name)
        if category == "unknown":
            continue
        datasets_loaded.append(category)

    datasets_loaded = sorted(set(datasets_loaded))
    meta["datasets"] = datasets_loaded
    meta["status"] = "ready" if datasets_loaded else "no_data"
    meta["ingested_at"] = datetime.now(timezone.utc).isoformat()
    _write_meta(session_id, meta)
    return meta


def ingest_csv_files(session_id: str, file_pairs: list[tuple[str, bytes]]) -> dict[str, Any]:
    """Store raw CSV files (name, bytes) into the session."""
    meta = get_session(session_id)
    sdir = _session_dir(session_id)
    csvs_dir = sdir / "csvs"
    csvs_dir.mkdir(exist_ok=True)

    for filename, raw in file_pairs:
        (csvs_dir / Path(filename).name).write_bytes(raw)

    csv_files = sorted(csvs_dir.rglob("*.csv"))
    datasets_loaded: list[str] = []
    for csv_path in csv_files:
        category = _classify_csv(csv_path.name)
        if category != "unknown":
            datasets_loaded.append(category)

    existing = set(meta.get("datasets") or [])
    existing.update(datasets_loaded)
    meta["datasets"] = sorted(existing)
    meta["status"] = "ready" if meta["datasets"] else "no_data"
    meta["ingested_at"] = datetime.now(timezone.utc).isoformat()
    _write_meta(session_id, meta)
    return meta


def load_datasets(session_id: str) -> dict[str, pd.DataFrame]:
    """Load all session datasets as DataFrames (same format as data_loader.load_ssm_zips)."""
    sdir = _session_dir(session_id)
    csvs_dir = sdir / "csvs"

    if not csvs_dir.is_dir():
        return {}

    zip_files = sorted(csvs_dir.glob("*.zip"))
    if zip_files:
        return load_ssm_zips(csvs_dir)

    csv_files = sorted(csvs_dir.rglob("*.csv"))
    if not csv_files:
        return {}

    datasets: dict[str, pd.DataFrame] = {}
    for csv_path in csv_files:
        category = _classify_csv(csv_path.name)
        if category == "unknown":
            continue
        try:
            df = pd.read_csv(csv_path, low_memory=False)
            df = _parse_numeric_cols(df)
            _merge_category_frame(datasets, category, df)
        except Exception:
            continue

    return _apply_store_id_mapping(datasets)


def get_session(session_id: str) -> dict[str, Any]:
    meta_path = _session_dir(session_id) / "meta.json"
    if not meta_path.is_file():
        raise FileNotFoundError(f"Session not found: {session_id}")
    return json.loads(meta_path.read_text(encoding="utf-8"))


def get_session_data_dir(session_id: str) -> Path:
    sdir = _session_dir(session_id)
    if not sdir.is_dir():
        raise FileNotFoundError(f"Session not found: {session_id}")
    return sdir / "csvs"


def list_sessions(limit: int = 50) -> list[dict[str, Any]]:
    if not SESSIONS_BASE.is_dir():
        return []
    sessions = []
    for d in sorted(SESSIONS_BASE.iterdir(), reverse=True):
        if not d.is_dir():
            continue
        meta_path = d / "meta.json"
        if meta_path.is_file():
            try:
                sessions.append(json.loads(meta_path.read_text(encoding="utf-8")))
            except json.JSONDecodeError:
                continue
        if len(sessions) >= limit:
            break
    return sessions


def record_agent_run(session_id: str, agent_name: str, run_id: str, result_summary: dict[str, Any]) -> None:
    """Record that an agent ran against this session."""
    meta = get_session(session_id)
    runs = meta.get("agent_runs") or {}
    runs[agent_name] = {
        "run_id": run_id,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        **result_summary,
    }
    meta["agent_runs"] = runs
    _write_meta(session_id, meta)


def store_agent_artifact(session_id: str, agent_name: str, filename: str, data: bytes | str) -> Path:
    """Store an agent output artifact in the session directory."""
    artifacts_dir = _session_dir(session_id) / "artifacts" / agent_name
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    path = artifacts_dir / filename
    if isinstance(data, str):
        path.write_text(data, encoding="utf-8")
    else:
        path.write_bytes(data)
    return path


def get_agent_artifact(session_id: str, agent_name: str, filename: str) -> Path | None:
    path = _session_dir(session_id) / "artifacts" / agent_name / filename
    return path if path.is_file() else None


def delete_session(session_id: str) -> bool:
    sdir = _session_dir(session_id)
    if sdir.is_dir():
        shutil.rmtree(sdir, ignore_errors=True)
        return True
    return False


def _write_meta(session_id: str, meta: dict[str, Any]) -> None:
    path = _session_dir(session_id) / "meta.json"
    path.write_text(json.dumps(meta, indent=2, default=str), encoding="utf-8")
