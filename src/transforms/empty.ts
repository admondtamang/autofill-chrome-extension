/**
 * Returns true for null, undefined, empty string, and whitespace-only string.
 * All other values (including 0, false, [], {}) are considered non-empty.
 */
export function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}
