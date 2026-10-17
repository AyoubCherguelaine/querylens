"use client";
import type { AgentStep } from "@/lib/api";
import { useT } from "@/lib/i18n/client";

export function AgentSteps({ steps }: { steps: AgentStep[] }) {
  const { t: dictionary } = useT();
  const t = dictionary.steps;
  if (!steps.length) return null;
  return (
    <section className="agent-steps" aria-label={t.label} aria-live="polite">
      <h3>{t.label}</h3>
      <ol>
        {steps.map((step) => (
          <li key={step.id}>
            <div className="agent-step-heading">
              <span className={`agent-status ${step.status}`}>{t.status[step.status] ?? step.status}</span>
              <strong>{step.tool.replaceAll("_", " ")}</strong>
              {step.duration_ms !== undefined && <small>{dictionary.result.ms(step.duration_ms)}</small>}
            </div>
            <p dir="auto">{step.purpose}</p>
            {(step.arguments || step.output) && (
              <details>
                <summary>{t.inspect}</summary>
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
