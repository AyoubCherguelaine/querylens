import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  Check,
  Database,
  FileSpreadsheet,
  GitBranch,
  Layers3,
  MessageSquare,
  Play,
  SearchCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { ProductDemo } from "./product-demo";

export function LandingPage() {
  return (
    <div className="landing-page">
      <a className="landing-skip" href="#main">
        Skip to content
      </a>
      <header className="landing-header">
        <Link className="brand" href="/" aria-label="Cube Chat home">
          <span className="brand-mark">
            <Database size={20} />
          </span>
          cube<span className="muted">/</span>chat
        </Link>
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#features">Features</a>
          <a href="#demo">
            Live demo <ArrowUpRight size={12} />
          </a>
        </nav>
        <div className="landing-account">
          <Link href="/login" className="landing-sign-in">
            Sign in
          </Link>
          <Link href="/login?mode=signup" className="primary">
            Get started <ArrowRight size={15} />
          </Link>
        </div>
      </header>
      <main id="main">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <span className="landing-kicker">
              <span /> A clearer conversation with your data
            </span>
            <h1>
              Your data has
              <br />a story.
              <br />
              <span>Ask it.</span>
            </h1>
            <p>
              Go from tables to understanding. Ask questions in plain language,
              explore your schemas, and see the evidence behind every answer.
            </p>
            <div className="landing-hero-actions">
              <Link className="primary" href="/login?mode=signup">
                Start exploring <ArrowRight size={17} />
              </Link>
              <a className="landing-demo-link" href="#demo">
                <span>
                  <Play size={13} fill="currentColor" />
                </span>
                Try the live demo
              </a>
            </div>
            <div className="landing-hero-note">
              <Check size={14} /> Bring your data. Keep the query in view.
            </div>
            <div className="landing-formats">
              <span>WORKS WITH</span>
              <div>
                <span>
                  <Database size={16} /> PostgreSQL
                </span>
                <span>
                  <FileSpreadsheet size={16} /> CSV
                </span>
                <span>
                  <Layers3 size={16} /> SQLite
                </span>
              </div>
            </div>
          </div>
          <div className="landing-preview">
            <div className="landing-preview-label">
              <span>
                <Sparkles size={13} /> FROM QUESTION TO CLARITY
              </span>
              <span>Try it yourself ↓</span>
            </div>
            <ProductDemo />
            <div className="landing-preview-caption">
              <span>
                <MessageSquare size={14} /> Questions on the left.
              </span>
              <span>
                <Database size={14} /> Context on the right.
              </span>
            </div>
          </div>
        </section>
        <section className="landing-workflow" id="how-it-works">
          <div className="landing-section-heading">
            <span className="eyebrow">LESS SETUP. MORE UNDERSTANDING.</span>
            <h2>From a dataset to a better question.</h2>
            <p>
              One workspace for your sources, conversations, and the details
              that matter.
            </p>
          </div>
          <div className="landing-steps">
            {[
              {
                number: "01",
                icon: Upload,
                title: "Bring your data",
                text: "Upload a CSV or SQLite file, or connect an available PostgreSQL schema. Keep related tables together.",
              },
              {
                number: "02",
                icon: MessageSquare,
                title: "Start a conversation",
                text: "Choose a table and ask what you want to understand. Follow up, compare dimensions, or request a written analysis.",
              },
              {
                number: "03",
                icon: SearchCheck,
                title: "Follow the evidence",
                text: "Inspect the executed SQL, query results, and source context. Understand where the answer comes from.",
              },
            ].map((step) => (
              <article key={step.number}>
                <div className="landing-step-top">
                  <span>
                    <step.icon size={21} />
                  </span>
                  <small>{step.number}</small>
                </div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="landing-features" id="features">
          <div className="landing-feature-intro">
            <span className="eyebrow">THE FULL PICTURE, WITHIN REACH</span>
            <h2>
              Curiosity in the center.
              <br />
              Context all around.
            </h2>
            <p>
              Keep your questions, schemas, and answers together so you can stay
              focused on what your data means.
            </p>
            <Link href="/login?mode=signup">
              Find your next insight <ArrowRight size={16} />
            </Link>
          </div>
          <div className="landing-feature-grid">
            {[
              {
                icon: MessageSquare,
                title: "Pick up the conversation",
                text: "Reopen saved chats and keep exploring from the questions you already asked.",
              },
              {
                icon: GitBranch,
                title: "Know your source",
                text: "Browse tables, field types, dimensions, and declared relationships beside your analysis.",
              },
              {
                icon: ChartNoAxesCombined,
                title: "Go beyond a single number",
                text: "Compare groups, inspect candidate measures, and turn findings into readable analysis.",
              },
              {
                icon: SearchCheck,
                title: "Make the answer inspectable",
                text: "Review SQL and results alongside the response, with warnings and limitations where available.",
              },
            ].map((feature) => (
              <article key={feature.title}>
                <feature.icon size={20} />
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="landing-cta">
          <div>
            <span className="eyebrow">
              YOUR NEXT INSIGHT STARTS WITH A QUESTION
            </span>
            <h2>Meet your data where it lives.</h2>
            <p>A workspace for the questions you haven’t asked yet.</p>
          </div>
          <Link className="primary" href="/login?mode=signup">
            Create your workspace <ArrowRight size={17} />
          </Link>
        </section>
      </main>
      <footer className="landing-footer">
        <Link className="brand" href="/">
          <Database size={19} /> cube / chat
        </Link>
        <p>Good questions. Grounded answers.</p>
        <div>
          <a href="#demo">Explore the demo</a>
          <Link href="/workspace">
            Open workspace <ArrowUpRight size={13} />
          </Link>
        </div>
      </footer>
    </div>
  );
}
