"use client";
import { useState } from "react";
import { ArrowRight, Database } from "lucide-react";
import { api } from "@/lib/api";

export function AuthForm({
  onSuccess,
  initialSignup = false,
}: {
  onSuccess: () => void;
  initialSignup?: boolean;
}) {
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
      setError(error instanceof Error ? error.message : "Unable to sign in.");
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
          cube<span className="muted">/</span>chat
        </span>
        <span className="eyebrow">YOUR DATA. A CLEARER PICTURE.</span>
        <h1>
          Good questions.
          <br />
          <span>Grounded answers.</span>
        </h1>
        <p>
          Turn your PostgreSQL data into an analytical workspace. Explore
          dimensions, ask questions, and inspect every result.
        </p>
        <div className="auth-proof">
          <Database size={18} /> PostgreSQL at the core <span>·</span> Evidence
          with every answer
        </div>
      </div>
      <section className="auth-card">
        <span className="eyebrow">ANALYTICS WORKSPACE</span>
        <h2>{signup ? "Create your account" : "Welcome back"}</h2>
        <p className="muted">
          {signup
            ? "Set up your workspace to start exploring."
            : "Sign in to continue your analysis."}
        </p>
        <form onSubmit={submit}>
          {signup && (
            <label>
              Full name
              <input name="name" autoComplete="name" maxLength={100} />
            </label>
          )}
          <label>
            Email address
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={signup ? 8 : 1}
              maxLength={128}
              autoComplete={signup ? "new-password" : "current-password"}
              placeholder={signup ? "At least 8 characters" : "Your password"}
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy
              ? "Connecting…"
              : signup
                ? "Create account"
                : "Enter workspace"}
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
          {signup
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </button>
      </section>
    </main>
  );
}
