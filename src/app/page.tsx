"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { 
  Send, 
  Search, 
  HelpCircle, 
  MessageSquare, 
  Cpu, 
  Sparkles, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  X
} from "lucide-react";
import { Inspector, type TraceEvent } from "./components/Inspector";

const ANALYST_QUESTIONS = [
  {
    label: "Nvidia Data Center YoY",
    query: "Compare Nvidia's Data Center revenue between FY2023 and FY2024 and outline the growth percentage."
  },
  {
    label: "Microsoft Intelligent Cloud Growth",
    query: "Compare Microsoft's Intelligent Cloud revenue and Azure growth drivers between FY2022 and FY2023."
  },
  {
    label: "Apple Revenue Segmentation",
    query: "Analyze the product segment breakdown (Services, iPhone, Mac, iPad) of Apple's net sales for FY2023."
  },
  {
    label: "Apple Risk Comparison",
    query: "What were the primary legal, regulatory, and supply chain risk factors disclosed by Apple in its 2023 10-K?"
  },
  {
    label: "Real-time Stock Market Fallback",
    query: "What is Nvidia's current stock price and recent market capital trends today?"
  }
];

export default function Home() {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [action, setAction] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask(customQuery?: string) {
    const activeQuery = customQuery ?? query;
    if (!activeQuery.trim() || loading) return;
    
    setAnswer("");
    setEvents([]);
    setAction(null);
    setLoading(true);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: activeQuery, evaluator: "jina" }),
      });
      
      if (!res.ok) {
        throw new Error(`API query failed with status ${res.status}`);
      }

      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() ?? "";
        
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const msg = JSON.parse(line.slice(6));
          if (msg.type === "token") {
            setAnswer((a) => a + msg.delta);
          } else if (msg.type === "result_meta") {
            setAction(msg.action);
          } else if (msg.type === "trace") {
            setEvents((e) => [...e, msg]);
          } else if (msg.type === "error") {
            setAnswer((a) => a + `\n\n**Error during generation:** ${msg.message}`);
          }
        }
      }
    } catch (err) {
      setAnswer(`**Failed to execute RAG pipeline:** ${err instanceof Error ? err.message : "Unknown connection error"}`);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") ask();
  }

  function handleSuggestionClick(q: string) {
    setQuery(q);
    ask(q);
  }

  return (
    <main className="min-height-100vh flex flex-col bg-zinc-950 text-zinc-100 selection:bg-indigo-500/30 selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 shadow-md shadow-indigo-500/5">
              <Cpu className="w-5 h-5 text-indigo-400" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                Corrective RAG (CRAG)
              </h1>
              <p className="text-xs text-zinc-500 font-medium">Self-correcting AI agent over SEC filings</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-800 bg-zinc-900/40 text-xs font-semibold text-zinc-400 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-sm shadow-emerald-500" />
            Vercel AI SDK • pgvector • Tavily
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Input + Output */}
        <section className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6">
          
          {/* Query input card */}
          <div className="border border-zinc-900 rounded-2xl bg-zinc-900/30 p-5 shadow-lg flex flex-col gap-4">
            <div className="relative flex items-center border border-zinc-800 bg-zinc-950 rounded-xl p-1.5 transition-all duration-300 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:shadow-md">
              <Search className="w-4 h-4 text-zinc-500 ml-3 shrink-0" />
              <input
                id="query-input"
                className="flex-1 bg-transparent border-0 outline-none text-zinc-100 text-sm py-2 px-3 placeholder:text-zinc-600 disabled:opacity-50 font-medium"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Submit an financial analyst question (e.g. Nvidia data center growth)..."
                disabled={loading}
              />
              {query && !loading && (
                <button 
                  onClick={() => setQuery("")}
                  className="text-zinc-500 hover:text-zinc-300 p-1.5 rounded-lg hover:bg-zinc-900 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                id="ask-button"
                className="shrink-0 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all shadow-md shadow-indigo-600/10 cursor-pointer"
                onClick={() => ask()}
                disabled={loading || !query.trim()}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Run Query</span>
                  </>
                )}
              </button>
            </div>

            {/* Suggestions */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-zinc-500 text-xs font-semibold">
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Sample Analyst Queries</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {ANALYST_QUESTIONS.map((q) => (
                  <button
                    key={q.label}
                    className="px-3 py-1.5 rounded-full border border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-white hover:border-indigo-500/50 hover:bg-indigo-950/10 text-xs font-medium cursor-pointer transition-all duration-300"
                    onClick={() => handleSuggestionClick(q.query)}
                    disabled={loading}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Decision Card */}
          {action && (
            <div className={`border rounded-xl p-4 flex gap-3 items-center animate-fadeIn ${
              action === "correct" 
                ? "bg-emerald-950/10 border-emerald-500/20 text-emerald-400" 
                : action === "incorrect"
                ? "bg-rose-950/10 border-rose-500/20 text-rose-400"
                : "bg-amber-950/10 border-amber-500/20 text-amber-400"
            }`}>
              {action === "correct" ? (
                <CheckCircle2 className="w-5 h-5 shrink-0" />
              ) : action === "incorrect" ? (
                <XCircle className="w-5 h-5 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 shrink-0" />
              )}
              <div className="text-xs font-semibold">
                Agent Decision: <strong className="uppercase">{action}</strong> —{" "}
                {action === "correct" 
                  ? "Retrieved context exceeds similarity thresholds. Generating directly from filings."
                  : action === "incorrect"
                  ? "Retrieved context lacks sufficient similarity. Falling back to Tavily Web Search."
                  : "Retrieval similarity ambiguous. Fusing internal chunks with web search results."
                }
              </div>
            </div>
          )}

          {/* Answer Box */}
          <div className="border border-zinc-900 rounded-2xl bg-zinc-900/25 p-6 shadow-lg min-h-[400px] flex flex-col relative transition-all duration-300">
            {!answer && !loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-zinc-950/20 rounded-2xl">
                <div className="relative flex items-center justify-center w-14 h-14 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-600 mb-4 shadow-inner">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-zinc-400">Executive Report Console</h3>
                <p className="text-xs text-zinc-600 mt-2 max-w-[280px] leading-relaxed">
                  Select a sample query above or input a custom prompt. The agent will run evaluation metrics and output a cited executive answer here.
                </p>
              </div>
            )}

            {loading && !answer && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-zinc-950/20 rounded-2xl">
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-zinc-900/60 border border-zinc-800 text-indigo-400 mb-4 animate-spin">
                  <RefreshCw className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-zinc-300">Executing Agent State Graph</h3>
                <p className="text-xs text-zinc-500 mt-1 max-w-[240px] leading-relaxed">
                  Evaluating vector search cosine relevance metrics…
                </p>
              </div>
            )}

            {answer && (
              <div className="flex-1 flex flex-col gap-4">
                <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-3 mb-1">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Executive Synthesis</span>
                </div>
                <article className="text-sm leading-relaxed text-zinc-200">
                  <ReactMarkdown
                    components={{
                      h1: ({node, ...props}) => <h1 className="text-lg font-bold mt-5 mb-2 text-white border-b border-zinc-800 pb-1" {...props} />,
                      h2: ({node, ...props}) => <h2 className="text-md font-bold mt-4 mb-2 text-white" {...props} />,
                      h3: ({node, ...props}) => <h3 className="text-sm font-bold mt-3 mb-1 text-zinc-200" {...props} />,
                      p: ({node, ...props}) => <p className="mb-3 text-zinc-300 leading-relaxed font-normal" {...props} />,
                      ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-4 text-zinc-300 space-y-1.5 font-normal" {...props} />,
                      ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-4 text-zinc-300 space-y-1.5 font-normal" {...props} />,
                      li: ({node, ...props}) => <li className="text-zinc-300" {...props} />,
                      a: ({node, ...props}) => <a className="text-indigo-400 hover:text-indigo-300 underline font-medium transition-colors" target="_blank" rel="noopener noreferrer" {...props} />,
                      code: ({node, ...props}) => <code className="bg-zinc-800/80 px-1.5 py-0.5 rounded font-mono text-xs text-indigo-300 border border-zinc-700/50" {...props} />,
                      pre: ({node, ...props}) => <pre className="bg-zinc-950 border border-zinc-900 p-4 rounded-xl font-mono text-xs text-zinc-400 overflow-x-auto my-4 shadow-inner leading-relaxed" {...props} />,
                      strong: ({node, ...props}) => <strong className="font-bold text-white bg-indigo-500/5 px-1 py-0.5 rounded border border-indigo-500/10" {...props} />,
                      blockquote: ({node, ...props}) => <blockquote className="border-l-2 border-indigo-500 bg-indigo-950/10 pl-4 py-1.5 my-3 text-zinc-400 italic rounded-r-lg" {...props} />,
                    }}
                  >
                    {answer}
                  </ReactMarkdown>
                </article>
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Inspector */}
        <div className="lg:col-span-5 xl:col-span-4">
          <Inspector events={events} action={action} />
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950 py-6 px-6 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-zinc-600 font-medium">
          <div>
            Built with <strong>Next.js 16 App Router</strong> & <strong>Bun</strong>.
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-zinc-700" />
            <span>Interactive State Machine Visualization for Portfolio Resume</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
