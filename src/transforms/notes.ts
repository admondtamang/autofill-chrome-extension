import { isEmptyValue } from "./empty";

/**
 * Strips HTML tags from a CRM notes field and collapses whitespace.
 * Uses DOMParser (available in browser and jsdom test environment).
 * Returns undefined for null/empty/whitespace-only input.
 */
export function transformNotes(raw: string | null | undefined): string | undefined {
  if (isEmptyValue(raw)) return undefined;
  const str = (raw as string).trim();
  if (str === "") return undefined;

  const doc = new DOMParser().parseFromString(str, "text/html");
  const text = doc.body.textContent ?? "";
  const collapsed = text.trim().replace(/\s+/g, " ");
  return collapsed === "" ? undefined : collapsed;
}
