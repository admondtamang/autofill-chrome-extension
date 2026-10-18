import { isEmptyValue } from "./empty";

/** Official AU state and territory codes */
const AU_STATE_CODES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"] as const;
export type AUStateCode = (typeof AU_STATE_CODES)[number];

/** Full name → code mapping (case-insensitive match via toLowerCase below) */
const FULL_NAME_MAP: Record<string, AUStateCode> = {
  "new south wales": "NSW",
  "victoria": "VIC",
  "queensland": "QLD",
  "western australia": "WA",
  "south australia": "SA",
  "tasmania": "TAS",
  "australian capital territory": "ACT",
  "northern territory": "NT",
};

/**
 * Resolves a raw CRM state value to an AU state code.
 * Accepts both codes (case-insensitive) and full names.
 * Returns null if the value is not a recognised AU state/territory.
 */
export function transformState(raw: string | null | undefined): string | null {
  if (isEmptyValue(raw)) return null;
  const str = (raw as string).trim();
  if (str === "") return null;

  const upper = str.toUpperCase() as AUStateCode;
  if ((AU_STATE_CODES as readonly string[]).includes(upper)) {
    return upper;
  }

  const lower = str.toLowerCase();
  const fromFullName = FULL_NAME_MAP[lower];
  if (fromFullName) return fromFullName;

  return null;
}
