export interface TraceEvent { type: "trace"; step: string; data?: unknown }

const ACTION_COLOR: Record<string, string> = {
  correct: "action-correct",
  incorrect: "action-incorrect",
  ambiguous: "action-ambiguous",
};

const STEP_ICON: Record<string, string> = {
  retrieve: "🔍",
  evaluate: "⚖️",
  action: "🎯",
  refine_internal: "✂️",
  query_rewrite: "✏️",
  web_search: "🌐",
  refine_web: "✂️",
  context_ready: "📦",
};

export function Inspector({ events, action }: { events: TraceEvent[]; action: string | null }) {
  return (
    <aside className="inspector-panel">
      <h2 className="inspector-title">Under the Hood</h2>

      {action && (
        <div className={`action-badge ${ACTION_COLOR[action] ?? ""}`}>
          <span className="action-icon">
            {action === "correct" ? "✅" : action === "incorrect" ? "❌" : "⚠️"}
          </span>
          <span className="action-label">{action.toUpperCase()}</span>
        </div>
      )}

      {events.length === 0 && (
        <p className="inspector-empty">Run a query to see the CRAG pipeline trace here.</p>
      )}

      <ol className="trace-list">
        {events.map((e, i) => (
          <li key={i} className="trace-item">
            <div className="trace-header">
              <span className="trace-icon">{STEP_ICON[e.step] ?? "◾"}</span>
              <span className="trace-step">{e.step}</span>
            </div>
            {e.data && (
              <pre className="trace-data">{JSON.stringify(e.data, null, 2)}</pre>
            )}
          </li>
        ))}
      </ol>
    </aside>
  );
}
