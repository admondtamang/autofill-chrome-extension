import { parsePhoneNumber, isValidPhoneNumber } from "libphonenumber-js";
import { isEmptyValue } from "./empty";

export type PhoneInternational = { international: string };
export type PhoneSplit = { countryCode: string; areaCode: string; number: string };
export type PhoneResult = PhoneInternational | PhoneSplit;

/**
 * Parses a raw phone number string using libphonenumber-js.
 * - If valid: returns { international: formatInternational() }
 * - If unparseable or invalid: returns null
 */
export function transformPhone(
  raw: string | null | undefined
): PhoneResult | null {
  if (isEmptyValue(raw)) return null;
  const str = (raw as string).trim();
  if (str === "") return null;

  try {
    if (!isValidPhoneNumber(str)) return null;
    const parsed = parsePhoneNumber(str);
    return { international: parsed.formatInternational() };
  } catch {
    return null;
  }
}
