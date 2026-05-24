"""
Data Agent — upload data once, create a session, all downstream agents reuse it.

Supports:
  - Manual: user uploads ZIP/CSV files
  - Autopilot: provide DoorDash/UberEats credentials to auto-download
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from shared.data_session import (
    create_session,
    get_session,
    ingest_csv_files,
    ingest_zip_files,
    load_datasets,
    store_agent_artifact,
    record_agent_run,
)


def run_manual(
    *,
    operator_id: str,
    operator_name: str = "",
    zip_paths: list[Path] | None = None,
    csv_pairs: list[tuple[str, bytes]] | None = None,
    date_range: str = "",
    session_id: str | None = None,
) -> dict[str, Any]:
    """
    Manual mode: user provides ZIP or CSV files.
    Creates a session and ingests the data.
    """
    if session_id:
        meta = get_session(session_id)
    else:
        meta = create_session(
            operator_id,
            operator_name=operator_name,
            date_range=date_range,
            mode="manual",
        )
        session_id = meta["session_id"]

    if zip_paths:
        meta = ingest_zip_files(session_id, zip_paths)

    if csv_pairs:
        meta = ingest_csv_files(session_id, csv_pairs)

    if meta["status"] == "no_data":
        return {
            "session_id": session_id,
            "status": "no_data",
            "message": "No recognized datasets found in uploaded files.",
        }

    datasets = load_datasets(session_id)
    dataset_summary = {}
    for key, df in datasets.items():
        if key == "store_id_mapping":
            continue
        dataset_summary[key] = {"rows": len(df), "columns": list(df.columns[:10])}

    record_agent_run(session_id, "data_agent", session_id, {
        "status": "success",
        "datasets_loaded": list(datasets.keys()),
    })

    return {
        "session_id": session_id,
        "operator_id": operator_id,
        "status": "ready",
        "datasets": meta["datasets"],
        "dataset_summary": dataset_summary,
        "message": f"Data session created with {len(meta['datasets'])} dataset(s). Use session_id to run any agent.",
    }


def _parse_date_range(date_range: str) -> tuple[str, str]:
    """
    Parse 'MM/DD/YYYY - MM/DD/YYYY' into (start, end).
    Falls back to last 3 full months if empty or unparseable.
    """
    if date_range and " - " in date_range:
        parts = [p.strip() for p in date_range.split(" - ", 1)]
        if len(parts) == 2 and parts[0] and parts[1]:
            return parts[0], parts[1]
    today = datetime.now().date()
    first_this_month = today.replace(day=1)
    last_prev_month = first_this_month - timedelta(days=1)
    y, m = first_this_month.year, first_this_month.month - 3
    if m <= 0:
        m += 12
        y -= 1
    start = datetime(y, m, 1).date()
    return start.strftime("%m/%d/%Y"), last_prev_month.strftime("%m/%d/%Y")


def run_autopilot(
    *,
    operator_id: str,
    operator_name: str = "",
    doordash_email: str,
    doordash_password: str,
    date_range: str = "",
    start_date: str = "",
    end_date: str = "",
) -> dict[str, Any]:
    """
    Autopilot mode: download data from DoorDash portal using browser-use.
    Accepts explicit start_date/end_date or a combined date_range string.
    """
    if start_date and end_date:
        sd, ed = start_date.strip(), end_date.strip()
        if not date_range:
            date_range = f"{sd} - {ed}"
    else:
        sd, ed = _parse_date_range(date_range)
        if not date_range:
            date_range = f"{sd} - {ed}"

    meta = create_session(
        operator_id,
        operator_name=operator_name,
        date_range=date_range,
        mode="autopilot",
    )
    session_id = meta["session_id"]

    _ROOT = Path(__file__).resolve().parents[2]
    reporting_root = _ROOT / "agents" / "resgro-browser-automation"
    from shared.data_session import get_session_data_dir

    data_dir = get_session_data_dir(session_id)

    env = os.environ.copy()
    env["DOORDASH_EMAIL"] = doordash_email
    env["DOORDASH_PASSWORD"] = doordash_password
    env["DOWNLOAD_DIR"] = str(data_dir)

    script = f"""
import asyncio, os
from pathlib import Path
from dotenv import load_dotenv
load_dotenv()
from agents.doordash_agent import run_reports_only

async def _main():
    download_dir = Path(os.environ["DOWNLOAD_DIR"])
    download_dir.mkdir(parents=True, exist_ok=True)
    marketing_path, financial_path = await run_reports_only(
        download_dir=download_dir,
        email=os.environ["DOORDASH_EMAIL"],
        password=os.environ["DOORDASH_PASSWORD"],
        start_date="{sd}",
        end_date="{ed}",
    )
    if financial_path:
        print(f"FINANCIAL_PATH={{financial_path}}")
    if marketing_path:
        print(f"MARKETING_PATH={{marketing_path}}")

asyncio.run(_main())
"""
    proc = subprocess.run(
        [sys.executable, "-c", script],
        cwd=str(reporting_root),
        env=env,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        detail = (proc.stderr or "").strip() or (proc.stdout or "").strip()
        return {
            "session_id": session_id,
            "status": "download_failed",
            "message": f"Auto-download failed: {detail}",
        }

    zip_files = sorted(data_dir.glob("*.zip"))
    if zip_files:
        meta = ingest_zip_files(session_id, zip_files)

    csv_files = sorted(data_dir.glob("*.csv"))
    if csv_files:
        pairs = [(f.name, f.read_bytes()) for f in csv_files]
        meta = ingest_csv_files(session_id, pairs)

    datasets = load_datasets(session_id)

    record_agent_run(session_id, "data_agent", session_id, {
        "status": "success",
        "mode": "autopilot",
        "datasets_loaded": list(datasets.keys()),
    })

    return {
        "session_id": session_id,
        "operator_id": operator_id,
        "status": "ready" if datasets else "no_data",
        "datasets": meta.get("datasets", []),
        "message": f"Auto-download complete. {len(meta.get('datasets', []))} dataset(s) loaded.",
    }
