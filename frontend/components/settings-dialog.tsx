"use client";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  X,
  Cpu,
  Coins,
  User,
  Sliders,
  CheckCircle2,
  Sparkles,
  Zap,
  Layers,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import {
  api,
  type ModelSettings,
  type CreditSummary,
  type UserInfo,
  type ModelItem,
  type ModelsConfig,
  DEFAULT_OPENAI_MODELS,
} from "@/lib/api";
import { LanguageSwitch, useT } from "@/lib/i18n/client";

export function SettingsDialog({
  isOpen,
  onClose,
  user,
  onUserUpdate,
}: {
  isOpen: boolean;
  onClose: () => void;
  user?: UserInfo;
  onUserUpdate: (updated: Partial<UserInfo>) => void;
}) {
  const { t: dictionary, intl } = useT();
  const t = dictionary.settings;
  const [activeTab, setActiveTab] = useState<"model" | "credits" | "account">("model");
  const [models, setModels] = useState<ModelItem[]>(DEFAULT_OPENAI_MODELS);
  const [modelSettings, setModelSettings] = useState<ModelSettings>(
    user?.model_settings || {
      model: "gpt-4o-mini",
      process_mode: "standard",
      temperature: 0.1,
      max_steps: 12,
      custom_instructions: "",
    }
  );
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [creditSummary, setCreditSummary] = useState<CreditSummary | null>(null);
  const [loadingCredits, setLoadingCredits] = useState(false);
  const [error, setError] = useState("");

  React.useEffect(() => {
    if (isOpen) {
      api<ModelsConfig>("users/models")
        .then((cfg) => {
          if (cfg?.models && cfg.models.length > 0) {
            setModels(cfg.models);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (isOpen && activeTab === "credits") {
      fetchCredits();
    }
  }, [isOpen, activeTab]);

  React.useEffect(() => {
    if (user?.model_settings) {
      setModelSettings(user.model_settings);
    }
  }, [user]);

  async function fetchCredits() {
    setLoadingCredits(true);
    try {
      const data = await api<CreditSummary>("users/credits");
      setCreditSummary(data);
      onUserUpdate({ credits: data.credits });
    } catch {
      // Ignored
    } finally {
      setLoadingCredits(false);
    }
  }

  async function handleSaveModelSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSavedSuccess(false);

    try {
      const res = await api<{ message: string; model_settings: ModelSettings }>(
        "users/settings",
        modelSettings,
        "PATCH"
      );
      setModelSettings(res.model_settings);
      onUserUpdate({ model_settings: res.model_settings });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="settings-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="settings-dialog">
        <header className="settings-header">
          <div>
            <h2 id="settings-dialog-title">{t.title}</h2>
            <p className="settings-subtitle">{t.subtitle}</p>
          </div>
          <Button
            variant="ghost"
            size="plain"
            className="icon-button close-button"
            aria-label={t.close}
            onClick={onClose}
          >
            <X size={18} />
          </Button>
        </header>

        <nav className="settings-tabs" aria-label="Settings categories">
          <Button
            variant="ghost"
            size="plain"
            className={`settings-tab-btn ${activeTab === "model" ? "active" : ""}`}
            onClick={() => setActiveTab("model")}
          >
            <Cpu size={16} />
            <span>{t.tabModel}</span>
          </Button>
          <Button
            variant="ghost"
            size="plain"
            className={`settings-tab-btn ${activeTab === "credits" ? "active" : ""}`}
            onClick={() => setActiveTab("credits")}
          >
            <Coins size={16} />
            <span>{t.tabCredits}</span>
            {user?.credits !== undefined && (
              <span className="credits-badge">{user.credits}</span>
            )}
          </Button>
          <Button
            variant="ghost"
            size="plain"
            className={`settings-tab-btn ${activeTab === "account" ? "active" : ""}`}
            onClick={() => setActiveTab("account")}
          >
            <User size={16} />
            <span>{t.tabAccount}</span>
          </Button>
        </nav>

        <div className="settings-body">
          {error && (
            <p className="settings-error" role="alert">
              {error}
            </p>
          )}

          {activeTab === "model" && (
            <form onSubmit={handleSaveModelSettings} className="settings-form">
              <div className="provider-badge-row">
                <div className="provider-badge">
                  <Sparkles size={14} className="provider-icon" />
                  <span>{t.providerOnly}</span>
                </div>
                <span className="provider-sub">{t.providerNotice}</span>
              </div>

              <div className="form-group">
                <label htmlFor="model-select" className="group-label">
                  <span className="label-text">{t.modelLabel}</span>
                  <small className="label-help">{t.modelHelp}</small>
                </label>
                <div className="model-selector-wrap">
                  <select
                    id="model-select"
                    value={modelSettings.model}
                    onChange={(e) => {
                      setModelSettings({ ...modelSettings, model: e.target.value });
                    }}
                    className="styled-select"
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} · {m.credit_cost} credits / question
                      </option>
                    ))}
                  </select>
                </div>
                {(() => {
                  const selectedModel =
                    models.find((m) => m.id === modelSettings.model) || models[0];
                  if (!selectedModel) return null;
                  return (
                    <div className="selected-model-card">
                      <div className="model-card-header">
                        <div className="model-card-title">
                          <Zap size={14} className="text-amber-500" />
                          <span>{selectedModel.name}</span>
                        </div>
                        <span className="model-cost-tag">
                          {t.creditsCostPerQuestion(selectedModel.credit_cost)}
                        </span>
                      </div>
                      <p className="model-card-desc">{selectedModel.description}</p>
                      <small className="model-card-special-hint">
                        {t.modelSpecialNotice}
                      </small>
                    </div>
                  );
                })()}
              </div>

              <div className="form-group">
                <label className="group-label">
                  <span className="label-text">{t.processModeLabel}</span>
                  <small className="label-help">{t.processModeHelp}</small>
                </label>
                <div className="mode-options-grid">
                  <label
                    className={`mode-card ${
                      modelSettings.process_mode === "standard" ? "selected" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="process_mode"
                      value="standard"
                      checked={modelSettings.process_mode === "standard"}
                      onChange={() =>
                        setModelSettings({ ...modelSettings, process_mode: "standard" })
                      }
                    />
                    <div className="mode-card-content">
                      <div className="mode-header">
                        <Sliders size={16} />
                        <strong>Standard</strong>
                      </div>
                      <p>{t.modeStandard}</p>
                    </div>
                  </label>

                  <label
                    className={`mode-card ${
                      modelSettings.process_mode === "fast" ? "selected" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="process_mode"
                      value="fast"
                      checked={modelSettings.process_mode === "fast"}
                      onChange={() =>
                        setModelSettings({ ...modelSettings, process_mode: "fast" })
                      }
                    />
                    <div className="mode-card-content">
                      <div className="mode-header">
                        <Zap size={16} />
                        <strong>Fast</strong>
                      </div>
                      <p>{t.modeFast}</p>
                    </div>
                  </label>

                  <label
                    className={`mode-card ${
                      modelSettings.process_mode === "deep_analytical" ? "selected" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="process_mode"
                      value="deep_analytical"
                      checked={modelSettings.process_mode === "deep_analytical"}
                      onChange={() =>
                        setModelSettings({
                          ...modelSettings,
                          process_mode: "deep_analytical",
                        })
                      }
                    />
                    <div className="mode-card-content">
                      <div className="mode-header">
                        <Sparkles size={16} />
                        <strong>Deep Analytical</strong>
                      </div>
                      <p>{t.modeDeep}</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="form-row-dual">
                <div className="form-group">
                  <label htmlFor="temperature-slider" className="group-label">
                    <span className="label-text">
                      {t.temperatureLabel}:{" "}
                      <code>{modelSettings.temperature.toFixed(2)}</code>
                    </span>
                    <small className="label-help">{t.temperatureHelp}</small>
                  </label>
                  <input
                    id="temperature-slider"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={modelSettings.temperature}
                    onChange={(e) =>
                      setModelSettings({
                        ...modelSettings,
                        temperature: parseFloat(e.target.value),
                      })
                    }
                    className="styled-slider"
                  />
                  <div className="slider-scale">
                    <span>Strict (0.0)</span>
                    <span>Balanced (0.2)</span>
                    <span>Exploratory (1.0)</span>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="max-steps-slider" className="group-label">
                    <span className="label-text">
                      {t.maxStepsLabel}: <code>{modelSettings.max_steps}</code>
                    </span>
                    <small className="label-help">{t.maxStepsHelp}</small>
                  </label>
                  <input
                    id="max-steps-slider"
                    type="range"
                    min="4"
                    max="30"
                    step="1"
                    value={modelSettings.max_steps}
                    onChange={(e) =>
                      setModelSettings({
                        ...modelSettings,
                        max_steps: parseInt(e.target.value, 10),
                      })
                    }
                    className="styled-slider"
                  />
                  <div className="slider-scale">
                    <span>4 steps</span>
                    <span>12 (default)</span>
                    <span>30 steps</span>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="custom-instructions" className="group-label">
                  <span className="label-text">{t.customInstructionsLabel}</span>
                  <small className="label-help">{t.customInstructionsHelp}</small>
                </label>
                <textarea
                  id="custom-instructions"
                  rows={3}
                  className="styled-textarea"
                  placeholder={t.customInstructionsPlaceholder}
                  value={modelSettings.custom_instructions}
                  onChange={(e) =>
                    setModelSettings({
                      ...modelSettings,
                      custom_instructions: e.target.value,
                    })
                  }
                  maxLength={2000}
                />
              </div>

              <div className="settings-footer">
                {savedSuccess && (
                  <span className="success-toast">
                    <CheckCircle2 size={16} /> {t.savedSuccess}
                  </span>
                )}
                <Button
                  type="submit"
                  disabled={saving}
                  className="primary save-btn"
                >
                  {saving ? t.saving : t.saveButton}
                </Button>
              </div>
            </form>
          )}

          {activeTab === "credits" && (
            <div className="credits-panel">
              <div className="credit-hero-card">
                <div className="credit-balance-info">
                  <small>{t.creditsHeading}</small>
                  <div className="balance-amount">
                    <Coins size={32} className="coins-icon" />
                    <strong>{(user?.credits ?? 100).toLocaleString(intl)}</strong>
                    <span className="currency-label">Credits</span>
                  </div>
                  <p className="rates-note">{t.ratesHeading}:</p>
                  <ul className="rates-list">
                    <li>
                      <ArrowRight size={14} /> {t.rateQuestion}
                    </li>
                    <li>
                      <ArrowRight size={14} /> {t.rateNewData}
                    </li>
                  </ul>
                </div>
              </div>

              <div className="model-rates-section">
                <h3>{t.modelCostScheduleHeading}</h3>
                <div className="model-rates-list">
                  {models.map((m) => (
                    <div
                      key={m.id}
                      className={`model-rate-row ${
                        m.id === modelSettings.model ? "active-rate-row" : ""
                      }`}
                    >
                      <div className="model-rate-name">
                        <strong>{m.name}</strong>
                        <small>{m.description}</small>
                      </div>
                      <div className="model-rate-cost">
                        <Coins size={14} />
                        <strong>{m.credit_cost}</strong>
                        <span>credits/qst</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="transactions-section">
                <div className="section-title-row">
                  <h3>{t.transactionHistory}</h3>
                  <Button
                    variant="ghost"
                    size="plain"
                    className="icon-button refresh-btn"
                    onClick={fetchCredits}
                    disabled={loadingCredits}
                    aria-label="Refresh activity"
                  >
                    <RefreshCw size={14} className={loadingCredits ? "spin" : ""} />
                  </Button>
                </div>

                {loadingCredits && !creditSummary ? (
                  <p className="muted-hint">Loading activity…</p>
                ) : !creditSummary?.transactions.length ? (
                  <p className="muted-hint">{t.noTransactions}</p>
                ) : (
                  <div className="transactions-table-wrap">
                    <table className="transactions-table">
                      <thead>
                        <tr>
                          <th>Action</th>
                          <th>Amount</th>
                          <th>Balance</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {creditSummary.transactions.map((tx) => {
                          const actionLabel =
                            tx.action.startsWith("question")
                              ? t.actionQuestion
                              : tx.action.startsWith("import")
                              ? t.actionImport
                              : tx.action.startsWith("connect")
                              ? t.actionConnect
                              : tx.action === "welcome_bonus"
                              ? t.actionWelcome
                              : t.actionRecharge;
                          return (
                            <tr key={tx.id}>
                              <td>
                                <span className="action-tag">{actionLabel}</span>
                              </td>
                              <td
                                className={
                                  tx.amount < 0 ? "amount-neg" : "amount-pos"
                                }
                              >
                                {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                              </td>
                              <td>{tx.balance_after}</td>
                              <td>
                                <time dateTime={tx.created_at}>
                                  {new Date(tx.created_at).toLocaleDateString(intl, {
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </time>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "account" && (
            <div className="account-panel">
              <div className="form-group">
                <label className="group-label">
                  <span className="label-text">{t.nameLabel}</span>
                </label>
                <Input value={user?.full_name || "Analyst"} readOnly />
              </div>
              <div className="form-group">
                <label className="group-label">
                  <span className="label-text">{t.emailLabel}</span>
                </label>
                <Input value={user?.email || ""} readOnly dir="ltr" />
              </div>
              <div className="form-group language-row">
                <label className="group-label">
                  <span className="label-text">{t.languageLabel}</span>
                </label>
                <LanguageSwitch />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

