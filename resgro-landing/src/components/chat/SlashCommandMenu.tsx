import React, { useEffect, useRef, useState } from "react";
import { Command, FileUp } from "lucide-react";
import { searchAgents, type AgentConfig } from "./agentRegistry";

interface SlashCommandMenuProps {
  query: string;
  onSelect: (agent: AgentConfig) => void;
  onClose: () => void;
  visible: boolean;
}

export function SlashCommandMenu({
  query,
  onSelect,
  onClose,
  visible,
}: SlashCommandMenuProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const results = searchAgents(query);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!visible) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % results.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + results.length) % results.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (results[activeIndex]) onSelect(results[activeIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible, activeIndex, results, onSelect, onClose]);

  useEffect(() => {
    const el = menuRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!visible || results.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="absolute bottom-full left-0 right-0 mb-2 max-h-[320px] overflow-y-auto rounded-xl border border-[#333338] bg-[#1e1e22] shadow-2xl shadow-black/40 z-50"
    >
      <div className="px-3 py-2 border-b border-[#2a2a2e]">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-gray-500">
          <Command size={10} />
          Agents
        </div>
      </div>
      <div className="py-1">
        {results.map((agent, i) => {
          const Icon = agent.icon;
          return (
            <button
              key={agent.id}
              data-index={i}
              onClick={() => onSelect(agent)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors ${
                i === activeIndex ? "bg-[#2a2a2e]" : "hover:bg-[#242428]"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-lg bg-gradient-to-br ${agent.color} flex items-center justify-center shrink-0 mt-0.5`}
              >
                <Icon size={14} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">
                    {agent.name}
                  </span>
                  <code className="text-[10px] text-gray-500 bg-[#333338] px-1.5 py-0.5 rounded">
                    {agent.command}
                  </code>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                  {agent.description}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <FileUp size={9} className="text-gray-600" />
                  <span className="text-[10px] text-gray-600">
                    {agent.acceptedFiles.join(", ")}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="px-3 py-1.5 border-t border-[#2a2a2e] flex items-center gap-3 text-[10px] text-gray-600">
        <span>
          <kbd className="px-1 py-0.5 rounded bg-[#333338] text-gray-400">↑↓</kbd> navigate
        </span>
        <span>
          <kbd className="px-1 py-0.5 rounded bg-[#333338] text-gray-400">↵</kbd> select
        </span>
        <span>
          <kbd className="px-1 py-0.5 rounded bg-[#333338] text-gray-400">esc</kbd> close
        </span>
      </div>
    </div>
  );
}
