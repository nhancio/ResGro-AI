"""
Boss Agent — orchestrates all agents in sequence using a shared data session.

Pipeline: Data Agent → DeepDive → Marketing Reco → (Offers + Ads) → Campaign Review → Monthly Reporter

Each step reads from the session and stores its output back into the session.
The boss can run the full pipeline or specific steps.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from shared.data_session import (
    get_session,
    get_session_data_dir,
    load_datasets,
    record_agent_run,
    store_agent_artifact,
    get_agent_artifact,
)

PipelineStep = Literal[
    "data",
    "deepdive",
    "marketingreco",
    "offers",
    "ads",
    "campaign_review",
    "monthly_reporter",
]

FULL_PIPELINE: list[PipelineStep] = [
    "data",
    "deepdive",
    "marketingreco",
    "offers",
    "ads",
    "campaign_review",
    "monthly_reporter",
]


def run(
    *,
    session_id: str,
    steps: list[PipelineStep] | None = None,
    skip_steps: list[PipelineStep] | None = None,
    doordash_email: str = "",
    doordash_password: str = "",
    pre_range: str = "",
    post_range: str = "",
) -> dict[str, Any]:
    """
    Run the full (or partial) pipeline against a data session.

    Args:
        session_id: The data session to use (must exist with status=ready).
        steps: If provided, only run these steps. Otherwise run all.
        skip_steps: Steps to skip from the full pipeline.
        doordash_email/password: Required for offers/ads browser automation.
        pre_range/post_range: Required for monthly_reporter (MM/DD/YYYY-MM/DD/YYYY).
    """
    meta = get_session(session_id)
    operator_id = meta["operator_id"]

    if meta["status"] != "ready":
        return {
            "session_id": session_id,
            "status": "error",
            "message": f"Session is not ready (status: {meta['status']}). Upload data first.",
        }

    pipeline = steps or FULL_PIPELINE
    skip = set(skip_steps or [])
    pipeline = [s for s in pipeline if s not in skip]

    if "data" in pipeline:
        pipeline.remove("data")

    results: dict[str, Any] = {
        "session_id": session_id,
        "operator_id": operator_id,
        "status": "running",
        "steps_completed": [],
        "steps_failed": [],
        "step_results": {},
    }

    for step in pipeline:
        try:
            step_result = _run_step(
                step,
                session_id=session_id,
                operator_id=operator_id,
                doordash_email=doordash_email,
                doordash_password=doordash_password,
                pre_range=pre_range,
                post_range=post_range,
            )
            results["steps_completed"].append(step)
            results["step_results"][step] = {
                "status": step_result.get("status", "success"),
                "run_id": step_result.get("run_id"),
                "summary": _summarize_step(step, step_result),
            }
        except Exception as e:
            results["steps_failed"].append(step)
            results["step_results"][step] = {
                "status": "failed",
                "error": str(e),
            }
            break

    results["status"] = "completed" if not results["steps_failed"] else "partial"
    record_agent_run(session_id, "boss_agent", str(uuid.uuid4()), {
        "status": results["status"],
        "steps_completed": results["steps_completed"],
        "steps_failed": results["steps_failed"],
    })

    return results


def _run_step(
    step: PipelineStep,
    *,
    session_id: str,
    operator_id: str,
    doordash_email: str,
    doordash_password: str,
    pre_range: str,
    post_range: str,
) -> dict[str, Any]:
    if step == "deepdive":
        return _run_deepdive(session_id, operator_id)
    elif step == "marketingreco":
        return _run_marketingreco(session_id, operator_id)
    elif step == "offers":
        return _run_offers(session_id, operator_id, doordash_email, doordash_password)
    elif step == "ads":
        return _run_ads(session_id, operator_id, doordash_email, doordash_password)
    elif step == "campaign_review":
        return _run_campaign_review(session_id, operator_id)
    elif step == "monthly_reporter":
        return _run_monthly_reporter(session_id, operator_id, pre_range, post_range)
    else:
        raise ValueError(f"Unknown step: {step}")


def _run_deepdive(session_id: str, operator_id: str) -> dict[str, Any]:
    from agents.deepdive.agent import run as run_deepdive

    data_dir = get_session_data_dir(session_id)
    result = run_deepdive(operator_id=operator_id, data_dir=data_dir)

    if result.get("deepdive_json_path"):
        dd_path = Path(result["deepdive_json_path"])
        if dd_path.is_file():
            store_agent_artifact(session_id, "deepdive", "deepdive.json", dd_path.read_text())

    if result.get("report_html_path"):
        rpt_path = Path(result["report_html_path"])
        if rpt_path.is_file():
            store_agent_artifact(session_id, "deepdive", "report.html", rpt_path.read_bytes())

    run_id = str(uuid.uuid4())
    record_agent_run(session_id, "deepdive", run_id, {
        "status": result.get("status", "unknown"),
        "datasets_loaded": result.get("datasets_loaded", []),
    })
    result["run_id"] = run_id
    return result


def _run_marketingreco(session_id: str, operator_id: str) -> dict[str, Any]:
    from agents.marketingreco.agent import run as run_marketingreco

    dd_artifact = get_agent_artifact(session_id, "deepdive", "deepdive.json")
    deepdive_report = None
    if dd_artifact:
        deepdive_report = json.loads(dd_artifact.read_text(encoding="utf-8"))

    data_dir = get_session_data_dir(session_id)
    fin_csv = None
    for p in sorted(data_dir.rglob("*FINANCIAL*DETAILED*.csv")):
        fin_csv = str(p)
        break
    if not fin_csv:
        for p in sorted(data_dir.rglob("*.csv")):
            if "financial" in p.name.lower():
                fin_csv = str(p)
                break

    _ROOT = Path(__file__).resolve().parents[2]

    if deepdive_report:
        result = run_marketingreco(
            operator_id,
            mode="deepdive",
            deepdive_report=deepdive_report,
        )
    elif fin_csv:
        result = run_marketingreco(
            operator_id,
            mode="manual",
            financial_report_path=fin_csv,
            reporting_root=str(_ROOT / "agents/resgro-browser-automation"),
        )
    else:
        return {"status": "skipped", "message": "No deepdive report or financial CSV available."}

    if result:
        store_agent_artifact(session_id, "marketingreco", "result.json", json.dumps(result, indent=2))

    run_id = str(uuid.uuid4())
    record_agent_run(session_id, "marketingreco", run_id, {
        "status": "success",
        "campaigns": len(result.get("recommended_campaigns", [])),
    })
    result["run_id"] = run_id
    return result


def _run_offers(session_id: str, operator_id: str, email: str, password: str) -> dict[str, Any]:
    if not email or not password:
        return {"status": "skipped", "message": "DoorDash credentials required for offers automation."}

    import subprocess
    import sys

    _ROOT = Path(__file__).resolve().parents[2]
    reporting_root = _ROOT / "agents" / "resgro-browser-automation"
    import os
    env = os.environ.copy()
    env["DOORDASH_EMAIL"] = email
    env["DOORDASH_PASSWORD"] = password

    subprocess.run(
        [sys.executable, "main.py"],
        cwd=str(reporting_root),
        env=env,
        check=True,
    )

    run_id = str(uuid.uuid4())
    record_agent_run(session_id, "offers", run_id, {"status": "success"})
    return {"status": "success", "run_id": run_id}


def _run_ads(session_id: str, operator_id: str, email: str, password: str) -> dict[str, Any]:
    if not email or not password:
        return {"status": "skipped", "message": "DoorDash credentials required for ads automation."}

    mrk_artifact = get_agent_artifact(session_id, "marketingreco", "result.json")
    if not mrk_artifact:
        return {"status": "skipped", "message": "No marketing reco result available for ads."}

    mrk_result = json.loads(mrk_artifact.read_text(encoding="utf-8"))
    ads_plan = mrk_result.get("ads_plan")
    if not ads_plan:
        return {"status": "skipped", "message": "No ads plan in marketing reco result."}

    from agents.marketingreco.resgro_ads_excel import resgro_ads_upload_rows
    upload_rows = resgro_ads_upload_rows(ads_plan)
    if not upload_rows:
        return {"status": "skipped", "message": "No sponsored listing rows generated from ads plan."}

    import pandas as pd
    import tempfile
    ads_csv = Path(tempfile.mktemp(suffix=".csv", prefix="ads_"))
    pd.DataFrame(upload_rows).to_csv(ads_csv, index=False)

    import subprocess
    import sys
    import os

    _ROOT = Path(__file__).resolve().parents[2]
    reporting_root = _ROOT / "agents" / "resgro-browser-automation"
    env = os.environ.copy()
    env["DOORDASH_EMAIL"] = email
    env["DOORDASH_PASSWORD"] = password

    script = f"""
import asyncio
from pathlib import Path
from agents.doordash_agent import run_ads_campaigns_from_sheet

async def _main():
    import os
    await run_ads_campaigns_from_sheet(
        download_dir=Path("."),
        email=os.environ["DOORDASH_EMAIL"],
        password=os.environ["DOORDASH_PASSWORD"],
        sheet_path=Path("{ads_csv}"),
    )

asyncio.run(_main())
"""
    subprocess.run(
        [sys.executable, "-c", script],
        cwd=str(reporting_root),
        env=env,
        check=True,
    )

    run_id = str(uuid.uuid4())
    record_agent_run(session_id, "ads", run_id, {"status": "success"})
    return {"status": "success", "run_id": run_id}


def _run_campaign_review(session_id: str, operator_id: str) -> dict[str, Any]:
    from agents.campaign_review.agent import run as run_review, to_json_safe

    data_dir = get_session_data_dir(session_id)

    marketing_csvs = sorted(data_dir.rglob("MARKETING_*.csv"))
    data_files = [str(p) for p in marketing_csvs] if marketing_csvs else None

    result = to_json_safe(run_review(
        operator_id=operator_id,
        mode="manual" if data_files else "auto",
        data_files=data_files,
    ))

    store_agent_artifact(session_id, "campaign_review", "result.json", json.dumps(result, indent=2))

    run_id = str(uuid.uuid4())
    record_agent_run(session_id, "campaign_review", run_id, {
        "status": "success",
        "reviews": len(result.get("campaign_reviews", [])),
    })
    result["run_id"] = run_id
    return result


def _run_monthly_reporter(session_id: str, operator_id: str, pre_range: str, post_range: str) -> dict[str, Any]:
    if not pre_range or not post_range:
        return {"status": "skipped", "message": "pre_range and post_range required for monthly reporter."}

    from agents.monthly_reporter.cloud_app.resgro_runner import ReportInputs, generate_monthly_report_bundle

    data_dir = get_session_data_dir(session_id)
    meta = get_session(session_id)

    inputs = ReportInputs(
        pre_range=pre_range,
        post_range=post_range,
        excluded_dates_text="",
        operator_name=meta.get("operator_name", ""),
        dd_store_ids_text="",
        ue_store_ids_text="",
    )

    bundle = generate_monthly_report_bundle(inputs, data_root=data_dir)

    if bundle.get("excel_bytes"):
        store_agent_artifact(
            session_id, "monthly_reporter",
            bundle.get("filename", "report.xlsx"),
            bundle["excel_bytes"],
        )

    run_id = str(uuid.uuid4())
    record_agent_run(session_id, "monthly_reporter", run_id, {
        "status": "success",
        "summary": bundle.get("summary_text", ""),
    })

    return {
        "status": "success",
        "run_id": run_id,
        "summary_text": bundle.get("summary_text"),
    }


def _summarize_step(step: str, result: dict[str, Any]) -> str:
    status = result.get("status", "unknown")
    if step == "deepdive":
        n = len(result.get("datasets_loaded", []))
        return f"{status}: {n} datasets analyzed"
    elif step == "marketingreco":
        n = len(result.get("recommended_campaigns", []))
        return f"{status}: {n} campaigns recommended"
    elif step in ("offers", "ads"):
        return f"{status}"
    elif step == "campaign_review":
        n = len(result.get("campaign_reviews", []))
        return f"{status}: {n} campaigns reviewed"
    elif step == "monthly_reporter":
        return f"{status}: {result.get('summary_text', '')[:100]}"
    return status
