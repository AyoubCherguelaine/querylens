import { cookies, headers } from "next/headers";
import {
  defaultLocale,
  dictionaries,
  isLocale,
  localeCookie,
  type Locale,
} from "./dictionaries";

// An explicit choice (cookie) wins; otherwise follow the browser's preference.
export async function getLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(localeCookie)?.value;
  if (isLocale(chosen)) return chosen;
  const accepted = (await headers()).get("accept-language") || "";
  return /^\s*ar\b/i.test(accepted) ? "ar" : defaultLocale;
}

export async function getDictionary() {
  return dictionaries[await getLocale()];
}
