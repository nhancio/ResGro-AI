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
    "campaign_setup",
]

FULL_PIPELINE: list[PipelineStep] = [
    "data",
    "deepdive",
    "marketingreco",
    "campaign_setup",
]


def run(
    *,
    session_id: str | None = None,
    steps: list[PipelineStep] | None = None,
    skip_steps: list[PipelineStep] | None = None,
    doordash_email: str = "",
    doordash_password: str = "",
    date_range: str = "",
    pre_range: str = "",
    post_range: str = "",
) -> dict[str, Any]:
    """
    Run the full (or partial) pipeline.

    If no session_id is provided, the data agent runs first in autopilot mode
    to download data from DoorDash and create a session.

    Pipeline: Data Agent → DeepDive → Marketing Reco → Campaign Setup
    """
    pipeline = steps or list(FULL_PIPELINE)
    skip = set(skip_steps or [])
    pipeline = [s for s in pipeline if s not in skip]

    results: dict[str, Any] = {
        "session_id": session_id,
        "operator_id": None,
        "status": "running",
        "steps_completed": [],
        "steps_failed": [],
        "step_results": {},
    }

    # Step 1: Data Agent — download data if no session exists
    if "data" in pipeline:
        pipeline.remove("data")
        if not session_id:
            try:
                data_result = _run_data_agent(
                    doordash_email=doordash_email,
                    doordash_password=doordash_password,
                    date_range=date_range,
                )
                if data_result.get("status") not in ("ready",):
                    results["steps_failed"].append("data")
                    results["step_results"]["data"] = {
                        "status": "failed",
                        "error": data_result.get("message", "Data download failed"),
                    }
                    results["status"] = "partial"
                    return results

                session_id = data_result["session_id"]
                results["session_id"] = session_id
                results["steps_completed"].append("data")
                results["step_results"]["data"] = {
                    "status": "success",
                    "summary": f"Data downloaded: {len(data_result.get('datasets', []))} dataset(s)",
                }
            except Exception as e:
                results["steps_failed"].append("data")
                results["step_results"]["data"] = {
                    "status": "failed",
                    "error": str(e),
                }
                results["status"] = "partial"
                return results

    if not session_id:
        return {
            **results,
            "status": "error",
            "message": "No session_id and data step was skipped.",
        }

    meta = get_session(session_id)
    operator_id = meta["operator_id"]
    results["operator_id"] = operator_id

    if meta["status"] != "ready":
        return {
            "session_id": session_id,
            "status": "error",
            "message": f"Session is not ready (status: {meta['status']}). Data download may have failed.",
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


def _run_data_agent(
    *,
    doordash_email: str,
    doordash_password: str,
    date_range: str = "",
) -> dict[str, Any]:
    from agents.data_agent.agent import run_autopilot

    return run_autopilot(
        operator_id="chat-upload",
        operator_name="Boss Pipeline",
        doordash_email=doordash_email,
        doordash_password=doordash_password,
        date_range=date_range,
    )


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
    elif step == "campaign_setup":
        return _run_campaign_setup(session_id, operator_id, doordash_email, doordash_password)
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

    if result.get("deepdive_analysis_path"):
        da_path = Path(result["deepdive_analysis_path"])
        if da_path.is_file():
            store_agent_artifact(session_id, "deepdive", "deepdive_analysis.json", da_path.read_text())

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

    # Prefer full analysis (has slot_tables) over legacy deepdive.json
    deepdive_report = None
    for fname in ("deepdive_analysis.json", "deepdive.json"):
        artifact = get_agent_artifact(session_id, "deepdive", fname)
        if artifact:
            deepdive_report = json.loads(artifact.read_text(encoding="utf-8"))
            if deepdive_report.get("slot_tables"):
                break

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

    if deepdive_report:
        result = run_marketingreco(
            operator_id,
            mode="deepdive",
            deepdive_report=deepdive_report,
        )
    elif fin_csv:
        result = run_marketingreco(
            operator_id,
            financial_report_path=fin_csv,
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


def _run_campaign_setup(session_id: str, operator_id: str, email: str, password: str) -> dict[str, Any]:
    """
    Create promotions via browser automation.

    Boss pipeline path: reads campaign_plan from marketingreco artifact.
    Self-serve path: reads uploaded campaign plan file from data dir.
    """
    if not email or not password:
        return {"status": "skipped", "message": "DoorDash credentials required for campaign setup."}

    combos: list[dict] = []

    # Path 1: read from marketingreco artifact (boss pipeline handoff)
    mrk_artifact = get_agent_artifact(session_id, "marketingreco", "result.json")
    if mrk_artifact:
        mrk_result = json.loads(mrk_artifact.read_text(encoding="utf-8"))
        for cp in mrk_result.get("campaign_plan", []):
            store_id = str(cp.get("store_id", "")).strip()
            if not store_id:
                continue
            combos.append({
                "store_id": store_id,
                "min_subtotal": cp.get("min_subtotal", 10),
                "slot_tags": cp.get("slots", []),
                "campaign_name": cp.get("campaign_name", f"Resgro-{store_id}"),
            })

    # Path 2: fall back to uploaded campaign plan file (self-serve)
    if not combos:
        data_dir = get_session_data_dir(session_id)
        campaign_file = _find_campaign_plan_file(data_dir)
        if campaign_file:
            result = _run_offers_from_file(campaign_file, email, password)
            run_id = str(uuid.uuid4())
            record_agent_run(session_id, "campaign_setup", run_id, {
                "status": result.get("status", "unknown"),
            })
            return {**result, "run_id": run_id}

    if not combos:
        return {"status": "skipped", "message": "No promotion combos to create."}

    import subprocess
    import sys
    import os
    import tempfile

    _ROOT = Path(__file__).resolve().parents[2]
    reporting_root = _ROOT / "agents" / "resgro-browser-automation"

    combos_path = Path(tempfile.mktemp(suffix=".json", prefix="offers_combos_"))
    combos_path.write_text(json.dumps(combos, indent=2), encoding="utf-8")

    env = os.environ.copy()
    env["DOORDASH_EMAIL"] = email
    env["DOORDASH_PASSWORD"] = password

    script = f"""
import asyncio, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent if '__file__' in dir() else Path('.')))
from agents.doordash_agent import get_task_description_campaign_for_subtotal_combo, _get_llm, _get_browser, _kill_browser

AGENT_LOGIN_TIMEOUT = 180
AGENT_CAMPAIGN_TIMEOUT = 360
AGENT_RESET_TIMEOUT = 90

async def _main():
    from browser_use import Agent
    combos = json.loads(Path("{combos_path}").read_text())
    email = os.environ["DOORDASH_EMAIL"]
    password = os.environ["DOORDASH_PASSWORD"]
    download_dir = Path("downloads/campaign_setup")
    download_dir.mkdir(parents=True, exist_ok=True)

    llm = _get_llm()
    browser = _get_browser(download_dir, keep_alive=True)

    login_task = (
        f"Go to https://merchant-portal.doordash.com/merchant/login\\n"
        f"Enter email: {{email}}, click 'Continue to Log In'.\\n"
        f"On the next screen, enter password: {{password}}, click 'Log In'.\\n"
        f"Wait for the dashboard to load. Use done action to finish."
    )
    print("Logging in to DoorDash Merchant Portal...")
    try:
        login_agent = Agent(task=login_task, llm=llm, browser=browser)
        await asyncio.wait_for(login_agent.run(), timeout=AGENT_LOGIN_TIMEOUT)
        print("Login successful")
    except Exception as e:
        print(f"Login failed: {{e}}")
        await _kill_browser(browser)
        raise SystemExit(f"Login failed: {{e}}")

    for i, combo in enumerate(combos):
        cname = combo.get('campaign_name', '')
        print(f"Creating promotion {{i+1}}/{{len(combos)}}: {{cname}}")

        nav_task = (
            "Go to https://merchant-portal.doordash.com/merchant/marketing "
            "WAIT UNTIL the page has fully loaded. "
            "If any modal or popup is visible, close it. "
            "Confirm you see the Marketing page. Use done action to finish."
        )
        try:
            nav_agent = Agent(task=nav_task, llm=llm, browser=browser)
            await asyncio.wait_for(nav_agent.run(), timeout=AGENT_RESET_TIMEOUT)
        except Exception:
            pass

        task = get_task_description_campaign_for_subtotal_combo(combo)
        try:
            campaign_agent = Agent(task=task, llm=llm, browser=browser)
            await asyncio.wait_for(campaign_agent.run(), timeout=AGENT_CAMPAIGN_TIMEOUT)
            print(f"{{cname}} — done")
        except Exception as e:
            print(f"{{cname}} — failed: {{e}}")

    await _kill_browser(browser)

asyncio.run(_main())
"""
    try:
        subprocess.run(
            [sys.executable, "-c", script],
            cwd=str(reporting_root),
            env=env,
            check=True,
        )
        run_id = str(uuid.uuid4())
        record_agent_run(session_id, "campaign_setup", run_id, {
            "status": "success",
            "promotions_created": len(combos),
        })
        return {"status": "success", "run_id": run_id, "promotions_created": len(combos)}
    except subprocess.CalledProcessError as e:
        return {"status": "failed", "message": f"Campaign browser run failed (exit {e.returncode})."}
    finally:
        combos_path.unlink(missing_ok=True)


def _find_campaign_plan_file(data_dir: Path) -> Path | None:
    """Find an uploaded campaign plan file (Excel or CSV) in the session data dir."""
    for ext in ("*.xlsx", "*.xls", "*.csv"):
        for p in sorted(data_dir.rglob(ext), key=lambda f: f.stat().st_mtime, reverse=True):
            name = p.name.lower()
            if any(kw in name for kw in ("campaign", "plan", "marketingreco", "offers", "ads")):
                return p
    for ext in ("*.xlsx", "*.xls"):
        for p in sorted(data_dir.rglob(ext), key=lambda f: f.stat().st_mtime, reverse=True):
            return p
    for p in sorted(data_dir.rglob("*.csv"), key=lambda f: f.stat().st_mtime, reverse=True):
        return p
    return None


def _run_offers_from_file(campaign_file: Path, email: str, password: str) -> dict[str, Any]:
    """Parse offers from the campaign plan file and run browser automation for each."""
    import pandas as pd

    combos: list[dict] = []
    suffix = campaign_file.suffix.lower()

    if suffix in (".xlsx", ".xls"):
        try:
            xl = pd.ExcelFile(campaign_file)
            offers_sheet = next((s for s in xl.sheet_names if s.strip().lower() == "offers"), None)
            if offers_sheet:
                df = pd.read_excel(xl, sheet_name=offers_sheet)
                df.columns = df.columns.astype(str).str.strip()
                store_col = next((c for c in df.columns if "store" in c.lower() and "doordash" in c.lower()), None)
                if not store_col:
                    store_col = next((c for c in df.columns if "store" in c.lower() and "id" in c.lower()), None)
                subtotal_col = next((c for c in df.columns if "subtotal" in c.lower()), None)
                tags_col = next((c for c in df.columns if "tag" in c.lower() or "slot" in c.lower()), None)
                name_col = next((c for c in df.columns if "campaign" in c.lower() and "name" in c.lower()), None)

                if store_col and subtotal_col:
                    for _, row in df.iterrows():
                        sid = str(row.get(store_col, "")).strip()
                        if not sid or sid.lower() == "nan":
                            continue
                        sub = row.get(subtotal_col, 10)
                        try:
                            sub = int(round(float(sub)))
                        except (TypeError, ValueError):
                            sub = 10
                        tags = []
                        if tags_col:
                            raw = str(row.get(tags_col, ""))
                            tags = [int(t.strip()) for t in raw.split(",") if t.strip().isdigit()]
                        cname = str(row.get(name_col, "")) if name_col else f"Resgro-{sid}-${sub}"
                        if cname.lower() == "nan":
                            cname = f"Resgro-{sid}-${sub}"
                        combos.append({
                            "store_id": sid,
                            "min_subtotal": sub,
                            "slot_tags": tags,
                            "campaign_name": cname,
                        })
        except Exception as e:
            return {"status": "failed", "message": f"Failed to read Offers sheet: {e}"}
    elif suffix == ".csv":
        try:
            df = pd.read_csv(campaign_file)
            df.columns = df.columns.astype(str).str.strip()
            store_col = next((c for c in df.columns if "store" in c.lower() and "id" in c.lower()), None)
            subtotal_col = next((c for c in df.columns if "subtotal" in c.lower()), None)
            tags_col = next((c for c in df.columns if "tag" in c.lower() or "slot" in c.lower()), None)
            name_col = next((c for c in df.columns if "campaign" in c.lower() and "name" in c.lower()), None)

            if store_col and subtotal_col:
                for _, row in df.iterrows():
                    sid = str(row.get(store_col, "")).strip()
                    if not sid or sid.lower() == "nan":
                        continue
                    sub = row.get(subtotal_col, 10)
                    try:
                        sub = int(round(float(sub)))
                    except (TypeError, ValueError):
                        sub = 10
                    tags = []
                    if tags_col:
                        raw = str(row.get(tags_col, ""))
                        tags = [int(t.strip()) for t in raw.split(",") if t.strip().isdigit()]
                    cname = str(row.get(name_col, "")) if name_col else f"Resgro-{sid}-${sub}"
                    if cname.lower() == "nan":
                        cname = f"Resgro-{sid}-${sub}"
                    combos.append({
                        "store_id": sid,
                        "min_subtotal": sub,
                        "slot_tags": tags,
                        "campaign_name": cname,
                    })
        except Exception as e:
            return {"status": "failed", "message": f"Failed to read CSV: {e}"}

    if not combos:
        return {"status": "skipped", "message": "No offer campaigns found in the uploaded file."}

    import asyncio
    import subprocess
    import sys
    import os
    import tempfile

    _ROOT = Path(__file__).resolve().parents[2]
    reporting_root = _ROOT / "agents" / "resgro-browser-automation"

    combos_path = Path(tempfile.mktemp(suffix=".json", prefix="offers_combos_"))
    combos_path.write_text(json.dumps(combos, indent=2), encoding="utf-8")

    env = os.environ.copy()
    env["DOORDASH_EMAIL"] = email
    env["DOORDASH_PASSWORD"] = password

    script = f"""
import asyncio, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent if '__file__' in dir() else Path('.')))
from agents.doordash_agent import get_task_description_campaign_for_subtotal_combo, _get_llm, _get_browser, _kill_browser

AGENT_LOGIN_TIMEOUT = 180
AGENT_CAMPAIGN_TIMEOUT = 360
AGENT_RESET_TIMEOUT = 90

async def _main():
    from browser_use import Agent
    combos = json.loads(Path("{combos_path}").read_text())
    email = os.environ["DOORDASH_EMAIL"]
    password = os.environ["DOORDASH_PASSWORD"]
    download_dir = Path("downloads/campaign_setup")
    download_dir.mkdir(parents=True, exist_ok=True)

    llm = _get_llm()
    browser = _get_browser(download_dir, keep_alive=True)

    # Step 1: Login first
    login_task = (
        f"Go to https://merchant-portal.doordash.com/merchant/login\\n"
        f"Enter email: {{email}}, click 'Continue to Log In'.\\n"
        f"On the next screen, enter password: {{password}}, click 'Log In'.\\n"
        f"Wait for the dashboard to load. Use done action to finish."
    )
    print("Logging in to DoorDash Merchant Portal...")
    try:
        login_agent = Agent(task=login_task, llm=llm, browser=browser)
        await asyncio.wait_for(login_agent.run(), timeout=AGENT_LOGIN_TIMEOUT)
        print("Login successful")
    except Exception as e:
        print(f"Login failed: {{e}}")
        await _kill_browser(browser)
        raise SystemExit(f"Login failed: {{e}}")

    # Step 2: Run each campaign
    for i, combo in enumerate(combos):
        cname = combo.get('campaign_name', '')
        print(f"Creating offer {{i+1}}/{{len(combos)}}: {{cname}}")

        # Navigate to marketing page before each campaign
        nav_task = (
            "Go to https://merchant-portal.doordash.com/merchant/marketing "
            "WAIT UNTIL the page has fully loaded. "
            "If any modal or popup is visible, close it. "
            "Confirm you see the Marketing page. Use done action to finish."
        )
        try:
            nav_agent = Agent(task=nav_task, llm=llm, browser=browser)
            await asyncio.wait_for(nav_agent.run(), timeout=AGENT_RESET_TIMEOUT)
        except Exception:
            pass

        task = get_task_description_campaign_for_subtotal_combo(combo)
        try:
            campaign_agent = Agent(task=task, llm=llm, browser=browser)
            await asyncio.wait_for(campaign_agent.run(), timeout=AGENT_CAMPAIGN_TIMEOUT)
            print(f"{{cname}} — done")
        except Exception as e:
            print(f"{{cname}} — failed: {{e}}")

    await _kill_browser(browser)

asyncio.run(_main())
"""
    try:
        subprocess.run(
            [sys.executable, "-c", script],
            cwd=str(reporting_root),
            env=env,
            check=True,
        )
        return {"status": "success", "campaigns_created": len(combos)}
    except subprocess.CalledProcessError as e:
        return {"status": "failed", "message": f"Offers browser run failed (exit {e.returncode})."}
    finally:
        combos_path.unlink(missing_ok=True)


def _run_ads_from_file(campaign_file: Path, email: str, password: str) -> dict[str, Any]:
    """Parse ads rows from the campaign plan file and run sponsored listing automation."""
    import pandas as pd

    suffix = campaign_file.suffix.lower()
    ads_df = None

    if suffix in (".xlsx", ".xls"):
        try:
            xl = pd.ExcelFile(campaign_file)
            ads_sheet = next((s for s in xl.sheet_names if s.strip().lower() == "ads"), None)
            if ads_sheet:
                ads_df = pd.read_excel(xl, sheet_name=ads_sheet)
        except Exception:
            pass
    elif suffix == ".csv":
        try:
            df = pd.read_csv(campaign_file)
            df.columns = df.columns.astype(str).str.strip()
            if any("bid" in c.lower() or "budget" in c.lower() for c in df.columns):
                ads_df = df
        except Exception:
            pass

    if ads_df is None or ads_df.empty:
        return {"status": "skipped", "message": "No Ads sheet found in the uploaded file."}

    import tempfile
    ads_csv = Path(tempfile.mktemp(suffix=".csv", prefix="ads_"))
    ads_df.to_csv(ads_csv, index=False)

    import subprocess
    import sys
    import os

    _ROOT = Path(__file__).resolve().parents[2]
    reporting_root = _ROOT / "agents" / "resgro-browser-automation"
    env = os.environ.copy()
    env["DOORDASH_EMAIL"] = email
    env["DOORDASH_PASSWORD"] = password
    env["ADS_SHEET_PATH"] = str(ads_csv)

    script = """
import asyncio, os, csv
from pathlib import Path
from agents.doordash_agent import _get_llm, _get_browser, _kill_browser

AGENT_LOGIN_TIMEOUT = 180
AGENT_CAMPAIGN_TIMEOUT = 360

def _get_sponsored_listing_task(store_id, slots, bid_strategy, budget, campaign_name):
    return f\"\"\"
You are automating the DoorDash Merchant Portal to create a Sponsored Listing campaign. You are already logged in.

HARD RULES:
- Do NOT go to the login page.

STEP 1 — Navigate to Sponsored Listings:
- In the LEFT SIDEBAR, click "Marketing".
- Click "Sponsored Listings" or "Create sponsored listing".

STEP 2 — Configure the campaign:
- Store: search and select store {store_id}
- Slots: {slots}
- Bid strategy: {bid_strategy}
- Budget: ${budget}
- Campaign name: {campaign_name}

STEP 3 — Create the campaign:
- Click "Create" or "Launch". Wait for confirmation.

DONE: Use the done action. Summarize what was created.
\"\"\"

async def _main():
    from browser_use import Agent
    sheet = Path(os.environ["ADS_SHEET_PATH"])
    email = os.environ["DOORDASH_EMAIL"]
    password = os.environ["DOORDASH_PASSWORD"]
    download_dir = Path("downloads/campaign_setup")
    download_dir.mkdir(parents=True, exist_ok=True)

    rows = []
    with open(sheet, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)

    if not rows:
        print("No ads rows found")
        return

    llm = _get_llm()
    browser = _get_browser(download_dir, keep_alive=True)

    # Login first
    login_task = (
        f"Go to https://merchant-portal.doordash.com/merchant/login\\n"
        f"Enter email: {email}, click 'Continue to Log In'.\\n"
        f"On the next screen, enter password: {password}, click 'Log In'.\\n"
        f"Wait for the dashboard to load. Use done action to finish."
    )
    print("Logging in to DoorDash Merchant Portal...")
    try:
        login_agent = Agent(task=login_task, llm=llm, browser=browser)
        await asyncio.wait_for(login_agent.run(), timeout=AGENT_LOGIN_TIMEOUT)
        print("Login successful")
    except Exception as e:
        print(f"Login failed: {e}")
        await _kill_browser(browser)
        raise SystemExit(f"Login failed: {e}")

    for i, row in enumerate(rows):
        store_id = row.get("Merchant store ID") or row.get("Store ID") or ""
        slots = row.get("Slots") or ""
        bid = row.get("Bid strategy") or "Automatic"
        budget = row.get("Budget") or "10"
        name = row.get("Campaign Name") or row.get("Campaign name") or f"Ads-{store_id}"
        print(f"Creating ad {i+1}/{len(rows)}: {name}")

        task = _get_sponsored_listing_task(store_id, slots, bid, budget, name)
        try:
            ad_agent = Agent(task=task, llm=llm, browser=browser)
            await asyncio.wait_for(ad_agent.run(), timeout=AGENT_CAMPAIGN_TIMEOUT)
            print(f"Ad {name} — done")
        except Exception as e:
            print(f"Ad {name} — failed: {e}")

    await _kill_browser(browser)

asyncio.run(_main())
"""
    try:
        subprocess.run(
            [sys.executable, "-c", script],
            cwd=str(reporting_root),
            env=env,
            check=True,
        )
        return {"status": "success", "rows": len(ads_df)}
    except subprocess.CalledProcessError as e:
        return {"status": "failed", "message": f"Ads browser run failed (exit {e.returncode})."}
    finally:
        ads_csv.unlink(missing_ok=True)


def _run_offers(session_id: str, operator_id: str, email: str, password: str) -> dict[str, Any]:
    if not email or not password:
        return {"status": "skipped", "message": "DoorDash credentials required for offers automation."}

    mrk_artifact = get_agent_artifact(session_id, "marketingreco", "result.json")
    if not mrk_artifact:
        return {"status": "skipped", "message": "No marketing reco result available for offers."}

    mrk_result = json.loads(mrk_artifact.read_text(encoding="utf-8"))
    campaign_plan = mrk_result.get("campaign_plan", [])
    if not campaign_plan:
        return {"status": "skipped", "message": "No campaign plan in marketing reco result."}

    combos = []
    for cp in campaign_plan:
        store_id = str(cp.get("store_id", "")).strip()
        if not store_id:
            continue
        combos.append({
            "store_id": store_id,
            "min_subtotal": cp.get("min_subtotal", 10),
            "slot_tags": cp.get("slots", []),
            "campaign_name": cp.get("campaign_name", f"Resgro-{store_id}"),
        })

    if not combos:
        return {"status": "skipped", "message": "No offer combos generated from campaign plan."}

    import subprocess
    import sys
    import os
    import tempfile

    _ROOT = Path(__file__).resolve().parents[2]
    reporting_root = _ROOT / "agents" / "resgro-browser-automation"

    combos_path = Path(tempfile.mktemp(suffix=".json", prefix="offers_combos_"))
    combos_path.write_text(json.dumps(combos, indent=2), encoding="utf-8")

    env = os.environ.copy()
    env["DOORDASH_EMAIL"] = email
    env["DOORDASH_PASSWORD"] = password

    script = f"""
import asyncio, json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent if '__file__' in dir() else Path('.')))
from agents.doordash_agent import get_task_description_campaign_for_subtotal_combo, _get_llm, _get_browser, _kill_browser

AGENT_LOGIN_TIMEOUT = 180
AGENT_CAMPAIGN_TIMEOUT = 360
AGENT_RESET_TIMEOUT = 90

async def _main():
    from browser_use import Agent
    combos = json.loads(Path("{combos_path}").read_text())
    email = os.environ["DOORDASH_EMAIL"]
    password = os.environ["DOORDASH_PASSWORD"]
    download_dir = Path("downloads/campaign_setup")
    download_dir.mkdir(parents=True, exist_ok=True)

    llm = _get_llm()
    browser = _get_browser(download_dir, keep_alive=True)

    login_task = (
        f"Go to https://merchant-portal.doordash.com/merchant/login\\n"
        f"Enter email: {{email}}, click 'Continue to Log In'.\\n"
        f"On the next screen, enter password: {{password}}, click 'Log In'.\\n"
        f"Wait for the dashboard to load. Use done action to finish."
    )
    print("Logging in to DoorDash Merchant Portal...")
    try:
        login_agent = Agent(task=login_task, llm=llm, browser=browser)
        await asyncio.wait_for(login_agent.run(), timeout=AGENT_LOGIN_TIMEOUT)
        print("Login successful")
    except Exception as e:
        print(f"Login failed: {{e}}")
        await _kill_browser(browser)
        raise SystemExit(f"Login failed: {{e}}")

    for i, combo in enumerate(combos):
        cname = combo.get('campaign_name', '')
        print(f"Creating offer {{i+1}}/{{len(combos)}}: {{cname}}")

        nav_task = (
            "Go to https://merchant-portal.doordash.com/merchant/marketing "
            "WAIT UNTIL the page has fully loaded. "
            "If any modal or popup is visible, close it. "
            "Confirm you see the Marketing page. Use done action to finish."
        )
        try:
            nav_agent = Agent(task=nav_task, llm=llm, browser=browser)
            await asyncio.wait_for(nav_agent.run(), timeout=AGENT_RESET_TIMEOUT)
        except Exception:
            pass

        task = get_task_description_campaign_for_subtotal_combo(combo)
        try:
            campaign_agent = Agent(task=task, llm=llm, browser=browser)
            await asyncio.wait_for(campaign_agent.run(), timeout=AGENT_CAMPAIGN_TIMEOUT)
            print(f"{{cname}} — done")
        except Exception as e:
            print(f"{{cname}} — failed: {{e}}")

    await _kill_browser(browser)

asyncio.run(_main())
"""
    try:
        subprocess.run(
            [sys.executable, "-c", script],
            cwd=str(reporting_root),
            env=env,
            check=True,
        )
        run_id = str(uuid.uuid4())
        record_agent_run(session_id, "offers", run_id, {"status": "success"})
        return {"status": "success", "run_id": run_id, "campaigns_created": len(combos)}
    except subprocess.CalledProcessError as e:
        return {"status": "failed", "message": f"Offers browser run failed (exit {e.returncode})."}
    finally:
        combos_path.unlink(missing_ok=True)


def _run_ads(session_id: str, operator_id: str, email: str, password: str) -> dict[str, Any]:
    if not email or not password:
        return {"status": "skipped", "message": "DoorDash credentials required for ads automation."}

    mrk_artifact = get_agent_artifact(session_id, "marketingreco", "result.json")
    if not mrk_artifact:
        return {"status": "skipped", "message": "No marketing reco result available for ads."}

    mrk_result = json.loads(mrk_artifact.read_text(encoding="utf-8"))
    ads_table = mrk_result.get("ads_table") or mrk_result.get("ads_plan")
    if not ads_table:
        return {"status": "skipped", "message": "No ads table in marketing reco result."}

    upload_rows = []
    if isinstance(ads_table, list):
        for row in ads_table:
            slots = row.get("slots", [])
            if isinstance(slots, list):
                slots = ",".join(str(s) for s in slots)
            upload_rows.append({
                "store_id": str(row.get("store_id", "")),
                "slots": slots,
                "bid_strategy": row.get("bid_strategy", 3),
                "budget": row.get("budget", 10),
                "campaign_name": row.get("campaign_name", f"Resgro-Ads-{row.get('store_id', '')}"),
            })
    elif isinstance(ads_table, dict):
        from agents.marketingreco.resgro_ads_excel import resgro_ads_upload_rows
        upload_rows = resgro_ads_upload_rows(ads_table)

    if not upload_rows:
        return {"status": "skipped", "message": "No sponsored listing rows generated from ads table."}

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
    elif step == "campaign_setup":
        n = result.get("promotions_created", 0)
        return f"{status}: {n} promotions created"
    return status
