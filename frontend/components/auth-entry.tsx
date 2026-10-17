"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AuthForm } from "./auth-form";
import { LanguageSwitch, useT } from "@/lib/i18n/client";

export function AuthEntry({ signup }: { signup: boolean }) {
  const router = useRouter();
  const { t } = useT();
  return (
    <div className="auth-entry">
      <Link className="auth-back" href="/">
        <ArrowLeft size={15} /> {t.auth.back}
      </Link>
      <LanguageSwitch />
      <AuthForm
        initialSignup={signup}
        onSuccess={() => router.replace("/workspace")}
      />
    </div>
  );
}
