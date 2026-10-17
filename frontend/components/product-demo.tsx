"use client";
import { useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Database,
  MessageSquare,
  Play,
  Sparkles,
  Table2,
} from "lucide-react";
import { demoQuestions, demoResult, demoSales } from "@/lib/demo-data";

export function ProductDemo() {
  const [selected, setSelected] = useState(0);
  const question = demoQuestions[selected];
  const result = demoResult(question);
  const max = Math.max(...result.rows.map((row) => row.value));
  const format = (value: number) =>
    question.id === "channels"
      ? value.toLocaleString("en-US")
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(value);
  return (
    <section
      className="product-demo"
      id="demo"
      aria-label="Interactive product demo"
    >
      <div className="demo-toolbar">
        <div className="demo-window-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <span>
          <Database size={13} /> cube / chat
        </span>
        <span className="demo-sample">
          <span />
          Sample workspace
        </span>
      </div>
      <div className="demo-body">
        <aside className="demo-chats" aria-label="Demo questions">
          <span className="demo-sidebar-label">TRY A QUESTION</span>
          {demoQuestions.map((item, index) => (
            <button
              key={item.id}
              onClick={() => setSelected(index)}
              className={selected === index ? "active" : ""}
              aria-pressed={selected === index}
            >
              <MessageSquare size={13} />
              <span>{item.label}</span>
            </button>
          ))}
          <div className="demo-sidebar-note">
            <Play size={14} />
            <span>
              Interactive demo<small>No sign-in needed</small>
            </span>
          </div>
        </aside>
        <div className="demo-conversation">
          <div className="demo-context">
            <span>
              <Sparkles size={13} /> Sales analysis
            </span>
            <span>Jan–Jun 2026</span>
          </div>
          <div className="demo-question">
            <span className="demo-avatar">Y</span>
            <p>{question.label}</p>
          </div>
          <div className="demo-answer" aria-live="polite" aria-atomic="true">
            <span className="demo-answer-label">
              <Sparkles size={13} /> An answer you can inspect
            </span>
            <p>{result.summary}</p>
            <div className="demo-total">
              <span>Total {question.metric.toLowerCase()}</span>
              <strong>{format(result.total)}</strong>
              <small>Across {demoSales.length} sample records</small>
            </div>
            <figure
              className={`demo-chart ${question.id === "trend" ? "monthly" : ""}`}
            >
              <figcaption>
                {question.metric} by {question.field}
              </figcaption>
              <ul>
                {result.rows.map((row, index) => (
                  <li key={row.label}>
                    <span>{row.label}</span>
                    <div className="demo-bar-track">
                      <div
                        style={{
                          width: `${(row.value / max) * 100}%`,
                          opacity: 1 - index * 0.08,
                        }}
                      />
                    </div>
                    <strong>{format(row.value)}</strong>
                  </li>
                ))}
              </ul>
            </figure>
            <div className="demo-result-footer">
              <span>
                <Check size={12} /> Calculated from sample data
              </span>
              <span>{result.rows.length} groups</span>
            </div>
          </div>
          <details className="demo-evidence" key={question.id}>
            <summary>
              Inspect query & results <ChevronDown size={13} />
            </summary>
            <pre>{question.sql}</pre>
            <div className="table-scroll">
              <table>
                <caption className="sr-only">Aggregated sample results</caption>
                <thead>
                  <tr>
                    <th>{question.field}</th>
                    <th>{question.metric}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td>{format(row.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <div className="demo-prompt-note">
            <ArrowUpRight size={13} /> Choose another sample question to explore.
          </div>
        </div>
        <aside className="demo-schema" aria-label="Demo schema">
          <span className="demo-sidebar-label">SCHEMA</span>
          <span className="demo-schema-name">
            <Database size={12} /> demo
          </span>
          <span className="demo-table-name">
            <Table2 size={12} /> sales
          </span>
          {["month", "region", "channel", "revenue", "orders"].map((field) => (
            <span
              className={`demo-field ${field === question.field ? "active" : ""}`}
              key={field}
            >
              <span>#</span>
              {field}
            </span>
          ))}
          <small>{demoSales.length} sample rows</small>
        </aside>
      </div>
      <div className="demo-disclaimer">
        <span className="demo-live-dot" /> A guided preview with preset
        questions and sample data. Your workspace analyzes your own sources.
      </div>
    </section>
  );
}
