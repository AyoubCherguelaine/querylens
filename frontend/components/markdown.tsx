"use client";

import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";

/** Shared Markdown renderer for model answers and written reports. */
export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <Streamdown
      className={cn("markdown-response", className)}
      mode="static"
      dir="auto"
      skipHtml
      controls={false}
      linkSafety={{ enabled: false }}
      components={{ strong: "strong" }}
    >
      {children}
    </Streamdown>
  );
}
