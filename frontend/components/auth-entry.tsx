"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AuthForm } from "./auth-form";

export function AuthEntry({ signup }: { signup: boolean }) {
  const router = useRouter();
  return (
    <div className="auth-entry">
      <Link className="auth-back" href="/">
        <ArrowLeft size={15} /> Back to home
      </Link>
      <AuthForm
        initialSignup={signup}
        onSuccess={() => router.replace("/workspace")}
      />
    </div>
  );
}
