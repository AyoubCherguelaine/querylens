import type { Metadata } from "next";
import { AuthEntry } from "@/components/auth-entry";
export const metadata: Metadata = { title: "Sign in · Cube Chat" };
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  return <AuthEntry key={mode} signup={mode === "signup"} />;
}
