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
import { LanguageSwitch } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/server";

export async function LandingPage() {
  const t = (await getDictionary()).landing;
  const stepIcons = [Upload, MessageSquare, SearchCheck];
  const featureIcons = [
    MessageSquare,
    GitBranch,
    ChartNoAxesCombined,
    SearchCheck,
  ];
  return (
    <div className="landing-page">
      <a className="landing-skip" href="#main">
        {t.skip}
      </a>
      <header className="landing-header">
        <Link className="brand" href="/" aria-label={t.home}>
          <span className="brand-mark">
            <Database size={20} />
          </span>
          <bdi className="brand-name" dir="ltr">
            cube<span className="muted">/</span>chat
          </bdi>
        </Link>
        <nav aria-label={t.mainNav}>
          <a href="#how-it-works">{t.howItWorks}</a>
          <a href="#features">{t.features}</a>
          <a href="#demo">
            {t.liveDemo} <ArrowUpRight size={12} />
          </a>
        </nav>
        <div className="landing-account">
          <LanguageSwitch />
          <Link href="/login" className="landing-sign-in">
            {t.signIn}
          </Link>
          <Link href="/login?mode=signup" className="primary">
            {t.getStarted} <ArrowRight size={15} />
          </Link>
        </div>
      </header>
      <main id="main">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <span className="landing-kicker">
              <span /> {t.kicker}
            </span>
            <h1>
              {t.heroLine1}
              <br />
              {t.heroLine2}
              <br />
              <span>{t.heroAccent}</span>
            </h1>
            <p>{t.heroText}</p>
            <div className="landing-hero-actions">
              <Link className="primary" href="/login?mode=signup">
                {t.startExploring} <ArrowRight size={17} />
              </Link>
              <a className="landing-demo-link" href="#demo">
                <span>
                  <Play size={13} fill="currentColor" />
                </span>
                {t.tryDemo}
              </a>
            </div>
            <div className="landing-hero-note">
              <Check size={14} /> {t.heroNote}
            </div>
            <div className="landing-formats">
              <span>{t.worksWith}</span>
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
                <Sparkles size={13} /> {t.previewLabel}
              </span>
              <span>{t.tryIt}</span>
            </div>
            <ProductDemo />
            <div className="landing-preview-caption">
              <span>
                <MessageSquare size={14} /> {t.captionLeft}
              </span>
              <span>
                <Database size={14} /> {t.captionRight}
              </span>
            </div>
          </div>
        </section>
        <section className="landing-workflow" id="how-it-works">
          <div className="landing-section-heading">
            <span className="eyebrow">{t.workflowEyebrow}</span>
            <h2>{t.workflowTitle}</h2>
            <p>{t.workflowText}</p>
          </div>
          <div className="landing-steps">
            {t.steps
              .map((text, index) => ({
                ...text,
                number: `0${index + 1}`,
                icon: stepIcons[index],
              }))
              .map((step) => (
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
            <span className="eyebrow">{t.featuresEyebrow}</span>
            <h2>
              {t.featuresTitle1}
              <br />
              {t.featuresTitle2}
            </h2>
            <p>{t.featuresText}</p>
            <Link href="/login?mode=signup">
              {t.nextInsight} <ArrowRight size={16} />
            </Link>
          </div>
          <div className="landing-feature-grid">
            {t.featureList
              .map((text, index) => ({
                ...text,
                icon: featureIcons[index],
              }))
              .map((feature) => (
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
            <span className="eyebrow">{t.ctaEyebrow}</span>
            <h2>{t.ctaTitle}</h2>
            <p>{t.ctaText}</p>
          </div>
          <Link className="primary" href="/login?mode=signup">
            {t.ctaButton} <ArrowRight size={17} />
          </Link>
        </section>
      </main>
      <footer className="landing-footer">
        <Link className="brand" href="/">
          <Database size={19} /> cube / chat
        </Link>
        <p>{t.footerTagline}</p>
        <div>
          <a href="#demo">{t.exploreDemo}</a>
          <Link href="/workspace">
            {t.openWorkspace} <ArrowUpRight size={13} />
          </Link>
        </div>
      </footer>
    </div>
  );
}
