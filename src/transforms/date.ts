import { CRM_TIMEZONE } from "@/shared/config";
import { isEmptyValue } from "./empty";

export type DateField = { value: string; verify: boolean };

/**
 * Transforms a raw date string from the CRM.
 *
 * - null / empty / whitespace → undefined
 * - Date-only "YYYY-MM-DD" → returned as-is (never parsed through Date constructor)
 * - ISO timestamp (contains "T") → converted to YYYY-MM-DD in the given timezone,
 *   returned as { value, verify: true }
 */
export function transformDate(
  raw: string | null | undefined,
  timezone?: string
): string | DateField | undefined {
  if (isEmptyValue(raw)) return undefined;
  // At this point raw is a non-empty string
  const str = (raw as string).trim();
  if (str === "") return undefined;

  // Date-only: YYYY-MM-DD (or YYYY-MM-DD prefix) — return as-is
  if (!str.includes("T")) {
    return str;
  }

  // ISO timestamp — parse in timezone
  const tz = timezone ?? CRM_TIMEZONE;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA locale produces YYYY-MM-DD format
  const parts = formatter.formatToParts(new Date(str));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const value = `${get("year")}-${get("month")}-${get("day")}`;

  return { value, verify: true };
}
