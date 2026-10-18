"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  LoaderCircle,
} from "lucide-react";
import type { AgentStep } from "@/lib/api";
import { useT } from "@/lib/i18n/client";
import { Badge } from "./ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "./ui/trace";

export function AgentSteps({
  steps,
  live = false,
}: {
  steps: AgentStep[];
  live?: boolean;
}) {
  const { t: dictionary } = useT();
  const t = dictionary.steps;
  const [expanded, setExpanded] = useState(false);
  if (!steps.length) return null;
  return (
    <Collapsible
      className="agent-steps"
      open={live || expanded}
      onOpenChange={setExpanded}
    >
      <CollapsibleTrigger
        className="agent-activity-trigger"
        aria-label={t.label}
      >
        <span>{t.label}</span>
        <Badge variant="secondary">{steps.length}</Badge>
        <ChevronDown size={14} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Trace className="agent-trace">
          {steps.map((step) => (
            <TraceCollapsible key={step.id}>
              <TraceCollapsibleTrigger>
                <TraceLine
                  status={
                    step.status === "failed"
                      ? "error"
                      : step.status === "running"
                        ? "running"
                        : undefined
                  }
                >
                  <TraceIcon>
                    {step.status === "running" ? (
                      <LoaderCircle className="spin" />
                    ) : step.status === "failed" ? (
                      <CircleAlert />
                    ) : (
                      <CheckCircle2 />
                    )}
                  </TraceIcon>
                  <TraceTitle>{step.tool.replaceAll("_", " ")}</TraceTitle>
                  <Badge
                    variant="secondary"
                    className={`agent-status ${step.status}`}
                  >
                    {t.status[step.status]}
                  </Badge>
                  {step.duration_ms !== undefined && (
                    <small>{dictionary.result.ms(step.duration_ms)}</small>
                  )}
                </TraceLine>
              </TraceCollapsibleTrigger>
              {step.purpose && <p dir="auto">{step.purpose}</p>}
              <TraceCollapsibleContent aria-label={t.inspect}>
                {step.arguments && (
                  <pre dir="ltr">{JSON.stringify(step.arguments, null, 2)}</pre>
                )}
                {step.output && (
                  <pre dir="ltr">{JSON.stringify(step.output, null, 2)}</pre>
                )}
              </TraceCollapsibleContent>
            </TraceCollapsible>
          ))}
        </Trace>
      </CollapsibleContent>
    </Collapsible>
  );
}
