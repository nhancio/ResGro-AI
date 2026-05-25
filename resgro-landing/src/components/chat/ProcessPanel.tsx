import { useState, useEffect } from "react";
import {
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
  MinusCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { ProcessState, ProcessStepStatus } from "./processTypes";

function StepStatusIcon({ status }: { status: ProcessStepStatus }) {
  switch (status) {
    case "pending":
      return <Circle size={16} className="text-gray-600" />;
    case "running":
      return <Loader2 size={16} className="text-[#FF6B35] animate-spin" />;
    case "success":
      return <CheckCircle2 size={16} className="text-emerald-500" />;
    case "failed":
      return <XCircle size={16} className="text-red-500" />;
    case "skipped":
      return <MinusCircle size={16} className="text-gray-500" />;
  }
}

export function ProcessPanel({ state }: { state: ProcessState }) {
  const isComplete =
    state.overallStatus === "completed" || state.overallStatus === "failed";
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (isComplete) {
      const timer = setTimeout(() => setCollapsed(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [isComplete]);

  const doneCount = state.steps.filter((s) => s.status === "success").length;

  return (
    <div className="rounded-xl border border-[#333338] bg-[#1e1e22] overflow-hidden mt-3 mb-3">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left bg-[#242428] border-b border-[#333338] cursor-pointer"
      >
        {state.overallStatus === "running" && (
          <Loader2
            size={14}
            className="text-[#FF6B35] animate-spin shrink-0"
          />
        )}
        {state.overallStatus === "completed" && (
          <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
        )}
        {state.overallStatus === "failed" && (
          <XCircle size={14} className="text-red-500 shrink-0" />
        )}
        <span className="text-xs font-semibold text-gray-200 uppercase tracking-wider flex-1">
          {state.overallStatus === "running"
            ? "Processing..."
            : state.overallStatus === "completed"
              ? "Completed"
              : "Failed"}
        </span>
        <span className="text-[10px] text-gray-500">
          {doneCount}/{state.steps.length} steps
        </span>
        {collapsed ? (
          <ChevronDown size={12} className="text-gray-500 ml-1" />
        ) : (
          <ChevronUp size={12} className="text-gray-500 ml-1" />
        )}
      </button>

      {!collapsed && (
        <div className="px-4 py-3 space-y-0">
          {state.steps.map((step, i) => (
            <div key={step.id} className="flex items-start gap-3 relative">
              {i < state.steps.length - 1 && (
                <div
                  className={`absolute left-[7px] top-[20px] w-0.5 h-[calc(100%-4px)] ${
                    step.status === "success"
                      ? "bg-emerald-500/30"
                      : step.status === "running"
                        ? "bg-[#FF6B35]/20"
                        : "bg-[#333338]"
                  }`}
                />
              )}
              <div className="shrink-0 z-10 bg-[#1e1e22] py-1">
                <StepStatusIcon status={step.status} />
              </div>
              <div className="flex-1 min-w-0 pb-3">
                <p
                  className={`text-xs font-medium ${
                    step.status === "running"
                      ? "text-white"
                      : step.status === "success"
                        ? "text-gray-300"
                        : step.status === "failed"
                          ? "text-red-400"
                          : "text-gray-500"
                  }`}
                >
                  {step.label}
                </p>
                {step.description && step.status !== "pending" && (
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {step.description}
                  </p>
                )}
                {step.error && (
                  <p className="text-[11px] text-red-400/80 mt-0.5">
                    {step.error}
                  </p>
                )}
                {step.status === "success" &&
                  step.startedAt &&
                  step.completedAt && (
                    <p className="text-[10px] text-gray-600 mt-0.5">
                      {((step.completedAt - step.startedAt) / 1000).toFixed(1)}s
                    </p>
                  )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
