import type { Metadata } from "next";
import { Workspace } from "@/components/workspace";
import { getDictionary } from "@/lib/i18n/server";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).meta.workspace };
}
export default function WorkspacePage() {
  return <Workspace />;
}
