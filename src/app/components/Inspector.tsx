"use client";

import { 
  Search, 
  Activity, 
  Cpu, 
  Scissors, 
  RefreshCw, 
  Globe, 
  Layers, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileJson
} from "lucide-react";
import { useState } from "react";

export interface TraceEvent { 
  type: "trace"; 
  step: string; 
  data?: unknown; 
}

const STEP_METADATA: Record<string, { icon: React.ComponentType<any>; color: string; border: string; bg: string; label: string; desc: string }> = {
  retrieve: { 
    icon: Search, 
    color: "text-indigo-400", 
    border: "border-indigo-500/20",
    bg: "bg-indigo-950/20",
    label: "retrieve",
    desc: "Similarity query over pgvector corpus" 
  },
  evaluate: { 
    icon: Activity, 
    color: "text-cyan-400", 
    border: "border-cyan-500/20",
    bg: "bg-cyan-950/20",
    label: "evaluate",
    desc: "Grade retrieved chunks using Reranker" 
  },
  action: { 
    icon: Cpu, 
    color: "text-amber-400", 
    border: "border-amber-500/20",
    bg: "bg-amber-950/20",
    label: "action decision",
    desc: "Assess retrieval confidence thresholds" 
  },
  refine_internal: { 
    icon: Scissors, 
    color: "text-rose-400", 
    border: "border-rose-500/20",
    bg: "bg-rose-950/20",
    label: "refine internal",
    desc: "Extract sentence strips on relevance" 
  },
  query_rewrite: { 
    icon: RefreshCw, 
    color: "text-emerald-400", 
    border: "border-emerald-500/20",
    bg: "bg-emerald-950/20",
    label: "query rewrite",
    desc: "Transform prompt to keywords for search" 
  },
  web_search: { 
    icon: Globe, 
    color: "text-sky-400", 
    border: "border-sky-500/20",
    bg: "bg-sky-950/20",
    label: "web search",
    desc: "Query Tavily API for external knowledge" 
  },
  refine_web: { 
    icon: Scissors, 
    color: "text-rose-400", 
    border: "border-rose-500/20",
    bg: "bg-rose-950/20",
    label: "refine web",
    desc: "Filter and trim web results into strips" 
  },
  context_ready: { 
    icon: Layers, 
    color: "text-violet-400", 
    border: "border-violet-500/20",
    bg: "bg-violet-950/20",
    label: "context assembled",
    desc: "Merge and package context for generation" 
  },
};

const DECISION_META: Record<string, { icon: React.ComponentType<any>; color: string; bg: string; border: string; text: string }> = {
  correct: { 
    icon: CheckCircle2, 
    color: "text-emerald-400", 
    bg: "bg-emerald-950/30", 
    border: "border-emerald-500/30",
    text: "Correct — High similarity score. Using internal knowledge base only."
  },
  incorrect: { 
    icon: XCircle, 
    color: "text-rose-400", 
    bg: "bg-rose-950/30", 
    border: "border-rose-500/30",
    text: "Incorrect — Low similarity scores. Fallback to Tavily Web Search."
  },
  ambiguous: { 
    icon: AlertTriangle, 
    color: "text-amber-400", 
    bg: "bg-amber-950/30", 
    border: "border-amber-500/30",
    text: "Ambiguous — Mixed scoring. Merging internal & Tavily search results."
  },
};

export function Inspector({ events, action }: { events: TraceEvent[]; action: string | null }) {
  const [expandedIndices, setExpandedIndices] = useState<Record<number, boolean>>({});

  const toggleExpand = (idx: number) => {
    setExpandedIndices(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  const decision = action ? DECISION_META[action] : null;
  const DecisionIcon = decision ? decision.icon : null;

  return (
    <aside className="border border-zinc-800/80 rounded-2xl bg-zinc-900/60 backdrop-blur-md p-6 shadow-xl sticky top-24 max-h-[calc(100vh-120px)] overflow-y-auto w-full transition-all duration-300">
      <div className="flex items-center justify-between border-b border-zinc-800/60 pb-4 mb-6">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-indigo-400 animate-pulse" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Under the Hood</h2>
        </div>
        {action && (
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">
            {events.length} steps logged
          </span>
        )}
      </div>

      {action && decision && DecisionIcon && (
        <div className={`border ${decision.border} ${decision.bg} rounded-xl p-4 mb-6 flex gap-3 items-start animate-fadeIn`}>
          <DecisionIcon className={`w-5 h-5 ${decision.color} shrink-0 mt-0.5`} />
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-200">
              Pipeline Action: <span className={decision.color}>{action}</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{decision.text}</p>
          </div>
        </div>
      )}

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-12 px-4 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/20">
          <FileJson className="w-10 h-10 text-zinc-700 mb-3" />
          <p className="text-sm font-medium text-zinc-500">Pipeline Inactive</p>
          <p className="text-xs text-zinc-600 mt-1 max-w-[240px]">
            Run an analyst query on the left to visualize the self-correcting agent execution graph in real time.
          </p>
        </div>
      ) : (
        <div className="relative pl-6 border-l border-zinc-800/80 space-y-6 ml-3">
          {events.map((e, idx) => {
            const meta = STEP_METADATA[e.step] || {
              icon: FileJson,
              color: "text-zinc-400",
              border: "border-zinc-800",
              bg: "bg-zinc-900",
              label: e.step,
              desc: "Execution pipeline operation"
            };
            const StepIcon = meta.icon;
            const isExpanded = !!expandedIndices[idx];

            return (
              <div key={idx} className="relative group animate-fadeIn">
                {/* Visual node locator */}
                <div className={`absolute -left-[35px] top-1.5 w-6 h-6 rounded-full border ${meta.border} ${meta.bg} flex items-center justify-center shadow-lg transition-transform duration-300 group-hover:scale-110`}>
                  <StepIcon className={`w-3.5 h-3.5 ${meta.color}`} />
                </div>

                <div className="border border-zinc-800/60 rounded-xl bg-zinc-950/30 p-4 transition-all duration-300 hover:border-zinc-700/60 hover:bg-zinc-950/50">
                  <div className="flex items-start justify-between gap-4">
                    <div onClick={() => toggleExpand(idx)} className="cursor-pointer flex-1">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-200 group-hover:text-indigo-400 transition-colors">
                        {meta.label}
                      </h4>
                      <p className="text-xs text-zinc-500 mt-0.5">{meta.desc}</p>
                    </div>
                    {!!e.data && (
                      <button 
                        onClick={() => toggleExpand(idx)}
                        className="text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 p-1 rounded transition-colors"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    )}
                  </div>

                  {!!e.data && isExpanded && (
                    <div className="mt-3 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 p-3 shadow-inner animate-fadeIn">
                      <pre className="font-mono text-[10px] leading-relaxed text-zinc-400 overflow-x-auto max-h-[300px]">
                        {JSON.stringify(e.data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
