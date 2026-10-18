"use client";
import { Button } from "@/components/ui/button";
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
import { useT } from "@/lib/i18n/client";

export function ProductDemo() {
  const { t: dictionary, intl } = useT();
  const t = dictionary.demo;
  const [selected, setSelected] = useState(0);
  const question = demoQuestions[selected];
  const result = demoResult(question);
  const metric = t.metrics[question.metric];
  const summary =
    question.id === "trend"
      ? t.trendSummary(result.percent)
      : t.shareSummary(
          result.leader,
          result.percent,
          question.id === "channels",
        );
  const max = Math.max(...result.rows.map((row) => row.value));
  const format = (value: number) =>
    question.id === "channels"
      ? value.toLocaleString(intl)
      : new Intl.NumberFormat(intl, {
          style: "currency",
          currency: "USD",
          currencyDisplay: "narrowSymbol",
          maximumFractionDigits: 0,
        }).format(value);
  return (
    <section className="product-demo" id="demo" aria-label={t.label}>
      <div className="demo-toolbar">
        <div className="demo-window-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <span>
          <Database size={13} /> QueryLens
        </span>
        <span className="demo-sample">
          <span />
          {t.sample}
        </span>
      </div>
      <div className="demo-body">
        <aside className="demo-chats" aria-label={t.questionsLabel}>
          <span className="demo-sidebar-label">{t.tryQuestion}</span>
          {demoQuestions.map((item, index) => (
            <Button
              variant="ghost"
              size="plain"
              key={item.id}
              onClick={() => setSelected(index)}
              className={selected === index ? "active" : ""}
              aria-pressed={selected === index}
            >
              <MessageSquare size={13} />
              <span>{t.questions[item.id]}</span>
            </Button>
          ))}
          <div className="demo-sidebar-note">
            <Play size={14} />
            <span>
              {t.interactive}
              <small>{t.noSignIn}</small>
            </span>
          </div>
        </aside>
        <div className="demo-conversation">
          <div className="demo-context">
            <span>
              <Sparkles size={13} /> {t.context}
            </span>
            <span>{t.period}</span>
          </div>
          <div className="demo-question">
            <span className="demo-avatar">{t.avatar}</span>
            <p>{t.questions[question.id]}</p>
          </div>
          <div className="demo-answer" aria-live="polite" aria-atomic="true">
            <span className="demo-answer-label">
              <Sparkles size={13} /> {t.answerLabel}
            </span>
            <p>{summary}</p>
            <div className="demo-total">
              <span>{t.total(metric)}</span>
              <strong>{format(result.total)}</strong>
              <small>{t.across(demoSales.length)}</small>
            </div>
            <figure
              className={`demo-chart ${question.id === "trend" ? "monthly" : ""}`}
            >
              <figcaption>{t.chartCaption(metric, question.field)}</figcaption>
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
                <Check size={12} /> {t.calculated}
              </span>
              <span>{t.groups(result.rows.length)}</span>
            </div>
          </div>
          <details className="demo-evidence" key={question.id}>
            <summary>
              {t.inspect} <ChevronDown size={13} />
            </summary>
            <pre>{question.sql}</pre>
            <div className="table-scroll">
              <table>
                <caption className="sr-only">{t.tableCaption}</caption>
                <thead>
                  <tr>
                    <th>{question.field}</th>
                    <th>{metric}</th>
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
            <ArrowUpRight size={13} /> {t.another}
          </div>
        </div>
        <aside className="demo-schema" aria-label={t.schemaLabel}>
          <span className="demo-sidebar-label">{t.schema}</span>
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
          <small>{t.rows(demoSales.length)}</small>
        </aside>
      </div>
      <div className="demo-disclaimer">
        <span className="demo-live-dot" /> {t.disclaimer}
      </div>
    </section>
  );
}
