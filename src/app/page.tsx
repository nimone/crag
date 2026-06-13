"use client";
import { useState } from "react";
import { Inspector, type TraceEvent } from "./components/Inspector";

const DEMO_QUESTIONS = [
  "What was Apple's FY2023 net revenue?",
  "What is Apple's current stock price?",
  "What were Apple's main risk factors in 2023?",
];

export default function Home() {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [action, setAction] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask() {
    if (!query.trim() || loading) return;
    setAnswer("");
    setEvents([]);
    setAction(null);
    setLoading(true);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
      });
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
          if (msg.type === "token") setAnswer((a) => a + msg.delta);
          else if (msg.type === "result_meta") setAction(msg.action);
          else if (msg.type === "trace") setEvents((e) => [...e, msg]);
        }
      }
    } catch (err) {
      setAnswer(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") ask();
  }

  return (
    <main className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <div className="logo-area">
            <span className="logo-icon">⚡</span>
            <div>
              <h1 className="app-title">Corrective RAG</h1>
              <p className="app-subtitle">Self-correcting AI over SEC filings</p>
            </div>
          </div>
          <div className="header-badge">
            <span className="badge-dot" />
            Production-grade CRAG
          </div>
        </div>
      </header>

      {/* Two-column layout */}
      <div className="main-grid">
        {/* Left: Chat */}
        <section className="chat-section">
          <div className="search-container">
            <div className="search-bar">
              <span className="search-icon">🔎</span>
              <input
                id="query-input"
                className="search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about SEC filings, revenues, risks..."
                disabled={loading}
              />
              <button
                id="ask-button"
                className={`ask-btn ${loading ? "loading" : ""}`}
                onClick={ask}
                disabled={loading}
              >
                {loading ? <span className="spinner" /> : "Ask"}
              </button>
            </div>

            {/* Demo chips */}
            <div className="demo-chips">
              {DEMO_QUESTIONS.map((q) => (
                <button
                  key={q}
                  className="chip"
                  onClick={() => setQuery(q)}
                  disabled={loading}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Action badge */}
          {action && (
            <div className={`result-action-badge action-${action}`}>
              <span>{action === "correct" ? "✅" : action === "incorrect" ? "❌" : "⚠️"}</span>
              <span>CRAG decision: <strong>{action}</strong></span>
            </div>
          )}

          {/* Answer */}
          <div className="answer-box">
            {!answer && !loading && (
              <div className="answer-placeholder">
                <div className="placeholder-icon">💬</div>
                <p>Your answer will appear here</p>
              </div>
            )}
            {loading && !answer && (
              <div className="answer-placeholder">
                <div className="loading-dots">
                  <span /><span /><span />
                </div>
                <p>Running CRAG pipeline…</p>
              </div>
            )}
            {answer && (
              <article className="answer-text">{answer}</article>
            )}
          </div>
        </section>

        {/* Right: Inspector */}
        <Inspector events={events} action={action} />
      </div>
    </main>
  );
}
