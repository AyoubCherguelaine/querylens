"use client";
import { useState } from "react";
import { ArrowRight, Database } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n/client";

export function AuthForm({
  onSuccess,
  initialSignup = false,
}: {
  onSuccess: () => void;
  initialSignup?: boolean;
}) {
  const t = useT().t.auth;
  const [signup, setSignup] = useState(initialSignup),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget),
      email = String(form.get("email")),
      password = String(form.get("password"));
    try {
      if (signup)
        await api("users/signup", {
          email,
          password,
          full_name: String(form.get("name") || ""),
        });
      await api("users/login", { email, password });
      onSuccess();
    } catch (error) {
      setError(error instanceof Error ? error.message : t.failed);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-screen">
      <div className="auth-intro">
        <span className="brand">
          <span className="brand-mark">
            <Database size={20} />
          </span>
          <bdi className="brand-name" dir="ltr">
            cube<span className="muted">/</span>chat
          </bdi>
        </span>
        <span className="eyebrow">{t.eyebrow}</span>
        <h1>
          {t.title1}
          <br />
          <span>{t.title2}</span>
        </h1>
        <p>{t.intro}</p>
        <div className="auth-proof">
          <Database size={18} /> {t.proof1} <span>·</span> {t.proof2}
        </div>
      </div>
      <section className="auth-card">
        <span className="eyebrow">{t.cardEyebrow}</span>
        <h2>{signup ? t.createTitle : t.welcomeTitle}</h2>
        <p className="muted">{signup ? t.createText : t.welcomeText}</p>
        <form onSubmit={submit}>
          {signup && (
            <label>
              {t.fullName}
              <input name="name" autoComplete="name" maxLength={100} />
            </label>
          )}
          <label>
            {t.email}
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
            />
          </label>
          <label>
            {t.password}
            <input
              name="password"
              type="password"
              required
              minLength={signup ? 8 : 1}
              maxLength={128}
              autoComplete={signup ? "new-password" : "current-password"}
              placeholder={signup ? t.newPassword : t.currentPassword}
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? t.connecting : signup ? t.createAccount : t.enter}
            <ArrowRight size={17} />
          </button>
        </form>
        <button
          className="text-button"
          onClick={() => {
            setSignup(!signup);
            setError("");
          }}
        >
          {signup ? t.haveAccount : t.newHere}
        </button>
      </section>
    </main>
  );
}
