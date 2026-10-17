import type { Metadata } from "next";
import { AuthEntry } from "@/components/auth-entry";
import { getDictionary } from "@/lib/i18n/server";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).meta.signIn };
}
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  return <AuthEntry key={mode} signup={mode === "signup"} />;
}
