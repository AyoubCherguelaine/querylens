"use client";
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
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
  Globe,
  LogOut,
} from "lucide-react";
import {
  api,
  type ModelSettings,
  type CreditSummary,
  type UserInfo,
  type ModelItem,
  type ModelsConfig,
  DEFAULT_OPENAI_MODELS,
  getModelCreditCost,
} from "@/lib/api";
import { LanguageSwitch, useT } from "@/lib/i18n/client";

export function SettingsView({
  user,
  onUserUpdate,
  onSignOut,
}: {
  user?: UserInfo;
  onUserUpdate: (updated: Partial<UserInfo>) => void;
  onSignOut?: () => void;
}) {
  const { t: dictionary, intl, locale } = useT();
  const t = dictionary.settings;
  const isAr = locale === "ar";

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

  useEffect(() => {
    api<ModelsConfig>("users/models")
      .then((cfg) => {
        if (cfg?.models && cfg.models.length > 0) {
          setModels(cfg.models);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === "credits") {
      fetchCredits();
    }
  }, [activeTab]);

  useEffect(() => {
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

  return (
    <div className="settings-view-container">
      {/* Settings Top Header */}
      <header className="settings-view-hero">
        <div className="hero-text">
          <div className="hero-badge">
            <Sliders size={15} />
            <span>{isAr ? "إعدادات المنصة والذكاء" : "Platform Configuration"}</span>
          </div>
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>

        <div className="settings-user-pill">
          <div className="user-avatar-circle">
            <User size={18} />
          </div>
          <div className="user-details">
            <strong>{user?.full_name || "Analyst"}</strong>
            <small>{user?.email || "user@querylens.local"}</small>
          </div>
        </div>
      </header>

      {/* Tab Switcher */}
      <nav className="settings-nav-tabs" aria-label="Settings categories">
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

      {/* Main Settings Card Content */}
      <div className="settings-view-body">
        {error && (
          <p className="settings-error" role="alert">
            {error}
          </p>
        )}

        {/* TAB 1: MODEL CONFIGURATION */}
        {activeTab === "model" && (
          <form onSubmit={handleSaveModelSettings} className="settings-view-form">
            <div className="provider-badge-row">
              <div className="provider-badge">
                <Sparkles size={15} className="provider-icon" />
                <span>{t.providerOnly}</span>
              </div>
              <span className="provider-sub">{t.providerNotice}</span>
            </div>

            {/* Model Selection Grid */}
            <div className="form-group">
              <label className="group-label">
                <span className="label-text">{t.modelLabel}</span>
                <span className="label-sub">{t.modelHelp}</span>
              </label>

              <div className="models-cards-grid">
                {models.map((m) => {
                  const isSelected = modelSettings.model === m.id;
                  const cost = m.credit_cost || getModelCreditCost(m.id);
                  return (
                    <div
                      key={m.id}
                      className={`model-card-item ${isSelected ? "selected-model-card" : ""}`}
                      onClick={() =>
                        setModelSettings((prev) => ({ ...prev, model: m.id }))
                      }
                      role="button"
                      tabIndex={0}
                    >
                      <div className="card-top">
                        <div className="model-radio">
                          <span className={`radio-dot ${isSelected ? "checked" : ""}`} />
                        </div>
                        <strong className="model-name">{m.name}</strong>
                        <span className="model-credit-tag">{cost}c</span>
                      </div>
                      <p className="model-desc">{m.description}</p>
                      {m.pricing && (
                        <div className="model-pricing-info">
                          <span>In: ${m.pricing.input_per_million}/M</span>
                          <span>Out: ${m.pricing.output_per_million}/M</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Process Mode Selection */}
            <div className="form-group">
              <label className="group-label">
                <span className="label-text">{t.processModeLabel}</span>
                <span className="label-sub">{t.processModeHelp}</span>
              </label>
              <div className="process-modes-grid">
                <div
                  className={`mode-card ${modelSettings.process_mode === "fast" ? "selected" : ""}`}
                  onClick={() =>
                    setModelSettings((prev) => ({ ...prev, process_mode: "fast" }))
                  }
                  role="button"
                  tabIndex={0}
                >
                  <div className="mode-card-header">
                    <Zap size={18} className="mode-icon fast" />
                    <strong>{t.modeFast}</strong>
                  </div>
                  <p>{isAr ? "أسرع استجابة بتحليل مركز ومباشر" : "Fastest response with focused direct analysis"}</p>
                </div>

                <div
                  className={`mode-card ${modelSettings.process_mode === "standard" ? "selected" : ""}`}
                  onClick={() =>
                    setModelSettings((prev) => ({ ...prev, process_mode: "standard" }))
                  }
                  role="button"
                  tabIndex={0}
                >
                  <div className="mode-card-header">
                    <Layers size={18} className="mode-icon standard" />
                    <strong>{t.modeStandard}</strong>
                  </div>
                  <p>{isAr ? "تحليل متوازن ودقيق للبيانات والعلاقات" : "Balanced accuracy and thorough analytical reasoning"}</p>
                </div>

                <div
                  className={`mode-card ${modelSettings.process_mode === "deep_analytical" ? "selected" : ""}`}
                  onClick={() =>
                    setModelSettings((prev) => ({ ...prev, process_mode: "deep_analytical" }))
                  }
                  role="button"
                  tabIndex={0}
                >
                  <div className="mode-card-header">
                    <Sparkles size={18} className="mode-icon deep" />
                    <strong>{t.modeDeep}</strong>
                  </div>
                  <p>{isAr ? "تحليل معمق وشامل عبر خطوات متعددة" : "Multi-step deep exploration and iterative validation"}</p>
                </div>
              </div>
            </div>

            {/* Slider Controls */}
            <div className="sliders-row">
              <div className="form-group slider-group">
                <label htmlFor="temperature-range" className="group-label">
                  <span className="label-text">{t.temperatureLabel}</span>
                  <span className="slider-val-badge">{modelSettings.temperature}</span>
                </label>
                <input
                  id="temperature-range"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={modelSettings.temperature}
                  onChange={(e) =>
                    setModelSettings((prev) => ({
                      ...prev,
                      temperature: parseFloat(e.target.value),
                    }))
                  }
                  className="settings-slider"
                />
                <span className="slider-hint">{t.temperatureHelp}</span>
              </div>

              <div className="form-group slider-group">
                <label htmlFor="max-steps-range" className="group-label">
                  <span className="label-text">{t.maxStepsLabel}</span>
                  <span className="slider-val-badge">{modelSettings.max_steps}</span>
                </label>
                <input
                  id="max-steps-range"
                  type="range"
                  min="4"
                  max="20"
                  step="1"
                  value={modelSettings.max_steps}
                  onChange={(e) =>
                    setModelSettings((prev) => ({
                      ...prev,
                      max_steps: parseInt(e.target.value, 10),
                    }))
                  }
                  className="settings-slider"
                />
                <span className="slider-hint">{t.maxStepsHelp}</span>
              </div>
            </div>

            {/* Custom Instructions */}
            <div className="form-group">
              <label htmlFor="custom-instructions" className="group-label">
                <span className="label-text">{t.customInstructionsLabel}</span>
                <span className="label-sub">{t.customInstructionsHelp}</span>
              </label>
              <textarea
                id="custom-instructions"
                rows={3}
                className="settings-textarea"
                placeholder={t.customInstructionsPlaceholder}
                value={modelSettings.custom_instructions}
                onChange={(e) =>
                  setModelSettings((prev) => ({
                    ...prev,
                    custom_instructions: e.target.value,
                  }))
                }
              />
            </div>

            {/* Action Bar */}
            <div className="settings-form-actions">
              {savedSuccess && (
                <span className="success-msg">
                  <CheckCircle2 size={16} />
                  <span>{t.savedSuccess}</span>
                </span>
              )}
              <Button
                variant="ghost"
                size="plain"
                type="submit"
                className="primary save-btn"
                disabled={saving}
              >
                {saving ? (
                  <>
                    <RefreshCw size={15} className="spin" />
                    <span>{t.saving}</span>
                  </>
                ) : (
                  <>
                    <span>{t.saveButton}</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </Button>
            </div>
          </form>
        )}

        {/* TAB 2: CREDITS & USAGE */}
        {activeTab === "credits" && (
          <div className="settings-credits-view">
            <div className="credits-summary-hero">
              <div className="credits-balance-block">
                <div className="balance-icon-wrap">
                  <Coins size={28} />
                </div>
                <div>
                  <span className="balance-sub">{t.creditsHeading}</span>
                  <strong className="balance-num">
                    {(user?.credits ?? 100).toLocaleString(intl)}
                  </strong>
                  <span className="balance-unit">{isAr ? "نقطة" : "Credits"}</span>
                </div>
              </div>

              <Button
                variant="ghost"
                size="plain"
                className="secondary refresh-btn"
                onClick={fetchCredits}
                disabled={loadingCredits}
              >
                <RefreshCw size={15} className={loadingCredits ? "spin" : ""} />
                <span>{isAr ? "تحديث الرصيد" : "Refresh Balance"}</span>
              </Button>
            </div>

            {/* Rates Table */}
            <div className="rates-table-section">
              <h3>{t.modelCostScheduleHeading}</h3>
              <div className="table-responsive">
                <table className="settings-rates-table">
                  <thead>
                    <tr>
                      <th>{isAr ? "النموذج" : "Model"}</th>
                      <th>{isAr ? "تكلفة السؤال" : "Cost per query"}</th>
                      <th>{isAr ? "الوصف والمواصفات" : "Description & Specs"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {models.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <strong>{m.name}</strong>
                          <small className="model-id-tag">{m.id}</small>
                        </td>
                        <td>
                          <span className="cost-badge">{m.credit_cost}c / query</span>
                        </td>
                        <td className="desc-cell">{m.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top-up Options */}
            <div className="topup-packages-section">
              <h3>{isAr ? "باقات شحن الرصيد الإضافي" : "Recharge Credit Packages"}</h3>
              <div className="topup-cards-grid">
                {[
                  { credits: 50, price: "$5", label: "Starter" },
                  { credits: 200, price: "$15", label: "Pro" },
                  { credits: 500, price: "$30", label: "Business" },
                  { credits: 1500, price: "$75", label: "Enterprise" },
                ].map((pkg) => (
                  <div key={pkg.credits} className="topup-card">
                    <span className="pkg-label">{pkg.label}</span>
                    <strong className="pkg-credits">{pkg.credits} Credits</strong>
                    <span className="pkg-price">{pkg.price}</span>
                    <Button
                      variant="ghost"
                      size="plain"
                      className="secondary topup-action-btn"
                      onClick={() => {
                        alert(
                          isAr
                            ? `تم استلام طلب التعبئة لحزمة ${pkg.label}. سيتم تطبيق الرصيد على حسابك.`
                            : `Selected package ${pkg.label} (${pkg.credits} credits). Contact admin to complete recharge.`
                        );
                      }}
                    >
                      {isAr ? "اختيار الباقة" : "Select Plan"}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ACCOUNT & LOCALIZATION */}
        {activeTab === "account" && (
          <div className="settings-account-view">
            <div className="account-details-card">
              <div className="account-row">
                <span className="account-label">{isAr ? "الاسم الكامل:" : "Full Name:"}</span>
                <strong className="account-val">{user?.full_name || "Analyst"}</strong>
              </div>
              <div className="account-row">
                <span className="account-label">{isAr ? "البريد الإلكتروني:" : "Email Address:"}</span>
                <strong className="account-val">{user?.email || "analyst@querylens.local"}</strong>
              </div>
              <div className="account-row">
                <span className="account-label">{isAr ? "الصلاحية:" : "Role:"}</span>
                <span className="role-badge">{isAr ? "محلل بيانات" : "Data Analyst"}</span>
              </div>
            </div>

            {/* Language Switch */}
            <div className="account-section">
              <div className="section-title-line">
                <Globe size={18} />
                <h3>{isAr ? "لغة الواجهة وتجربة المستخدم" : "Language & Regional Preferences"}</h3>
              </div>
              <p className="section-sub">
                {isAr
                  ? "يدعم QueryLens اللغة العربية بشكل كامل مع الاتجاه من اليمين إلى اليسار (RTL) بالإضافة للغة الإنجليزية."
                  : "QueryLens provides full bilingual support with native RTL typography for Arabic and English."}
              </p>
              <div className="language-switch-box">
                <LanguageSwitch />
              </div>
            </div>

            {/* Sign Out Action */}
            {onSignOut && (
              <div className="account-signout-section">
                <Button
                  variant="ghost"
                  size="plain"
                  className="secondary signout-btn"
                  onClick={onSignOut}
                >
                  <LogOut size={16} />
                  <span>{dictionary.chats.signOut}</span>
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
