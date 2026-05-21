"""Monthly reporter — real implementation lives in cloud_app/resgro_runner.py.

This stub is kept for backwards compatibility with any orchestration code
that may import ``agents.monthly_reporter.agent.run``.
"""

from __future__ import annotations

from typing import Any


def run(*, operator_id: str, report_month: tuple[int, int] | None = None, **kwargs: Any) -> dict[str, Any]:
    """Delegate to the cloud_app runner. Falls back to a stub if runner is unavailable."""
    try:
        from agents.monthly_reporter.cloud_app.resgro_runner import (
            ReportInputs,
            generate_monthly_report_bundle,
        )
    except ImportError:
        return {
            "operator_id": operator_id,
            "status": "stub",
            "note": "cloud_app runner not available — install dependencies.",
        }

    return {
        "operator_id": operator_id,
        "status": "redirect",
        "note": "Use generate_monthly_report_bundle() from cloud_app directly via api/main.py.",
    }
