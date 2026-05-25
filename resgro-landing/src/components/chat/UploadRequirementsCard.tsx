import React from "react";
import { Upload, FileType, X, CheckCircle2, Info } from "lucide-react";
import type { AgentConfig } from "./agentRegistry";

interface UploadRequirementsCardProps {
  agent: AgentConfig;
  onDismiss: () => void;
  onUploadClick: () => void;
  filesAttached: number;
}

export function UploadRequirementsCard({
  agent,
  onDismiss,
  onUploadClick,
  filesAttached,
}: UploadRequirementsCardProps) {
  const Icon = agent.icon;

  return (
    <div className="rounded-2xl border border-[#2a2a2e] bg-[#1e1e22] overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2a2a2e] bg-[#242428]">
        <div
          className={`w-9 h-9 rounded-xl bg-gradient-to-br ${agent.color} flex items-center justify-center shrink-0`}
        >
          <Icon size={16} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-white">{agent.name}</h3>
          <p className="text-xs text-gray-400 line-clamp-1">{agent.description}</p>
        </div>
        <button
          onClick={onDismiss}
          className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-[#333338] transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Upload Requirements */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Upload size={12} className="text-[#FF6B35]" />
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
              Please upload
            </span>
          </div>
          <div className="space-y-1.5">
            {agent.uploadRequirements.map((req, i) => (
              <div key={i} className="flex items-start gap-2 pl-1">
                <CheckCircle2 size={13} className="text-[#FF6B35]/60 mt-0.5 shrink-0" />
                <span className="text-sm text-gray-300">{req}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Accepted Files */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <FileType size={12} className="text-gray-500" />
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
              Accepted formats
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {agent.acceptedFiles.map((ext) => (
              <span
                key={ext}
                className="px-2 py-0.5 rounded-md bg-[#333338] text-[11px] font-mono text-gray-300"
              >
                {ext}
              </span>
            ))}
          </div>
        </div>

        {/* Example Inputs */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Info size={12} className="text-gray-500" />
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
              Example inputs
            </span>
          </div>
          <div className="space-y-1">
            {agent.exampleInputs.map((ex, i) => (
              <div key={i} className="flex items-center gap-2 pl-1">
                <span className="w-1 h-1 rounded-full bg-gray-600 shrink-0" />
                <span className="text-xs text-gray-500">{ex}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Upload action */}
        <button
          onClick={onUploadClick}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-[#333338] hover:border-[#FF6B35]/40 bg-[#242428] hover:bg-[#2a2a2e] text-gray-400 hover:text-[#FF6B35] transition-all group"
        >
          <Upload size={16} className="group-hover:text-[#FF6B35] transition-colors" />
          <span className="text-sm font-medium">
            {filesAttached > 0
              ? `${filesAttached} file${filesAttached > 1 ? "s" : ""} attached — add more or send`
              : "Click to upload or drag & drop files"}
          </span>
        </button>

        {/* Output types */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-gray-600">Outputs:</span>
          {agent.outputType.map((out) => (
            <span
              key={out}
              className="px-2 py-0.5 rounded-full bg-[#FF6B35]/10 text-[10px] text-[#FF6B35]/80"
            >
              {out}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
