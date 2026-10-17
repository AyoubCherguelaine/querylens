import type { AgentStep } from "@/lib/api";

export function AgentSteps({ steps }: { steps: AgentStep[] }) {
  if (!steps.length) return null;
  return (
    <section className="agent-steps" aria-label="Agent activity" aria-live="polite">
      <h3>Agent activity</h3>
      <ol>
        {steps.map((step) => (
          <li key={step.id}>
            <div className="agent-step-heading">
              <span className={`agent-status ${step.status}`}>{step.status}</span>
              <strong>{step.tool.replaceAll("_", " ")}</strong>
              {step.duration_ms !== undefined && <small>{step.duration_ms} ms</small>}
            </div>
            <p>{step.purpose}</p>
            {(step.arguments || step.output) && (
              <details>
                <summary>Inspect tool input and result</summary>
                {step.arguments && <pre>{JSON.stringify(step.arguments, null, 2)}</pre>}
                {step.output && <pre>{JSON.stringify(step.output, null, 2)}</pre>}
              </details>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
