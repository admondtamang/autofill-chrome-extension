import * as countries from "i18n-iso-countries";
import { isEmptyValue } from "./empty";

/**
 * Alias table: maps non-standard country strings to ISO alpha-2 codes.
 * Extend as needed when new CRM values are discovered.
 */
export const COUNTRY_ALIASES: Record<string, string> = {
  "Korea, South": "KR",
  "Viet Nam": "VN",
  "Hong Kong (SAR of China)": "HK",
  "Taiwan": "TW",
  "Russia": "RU",
  "Syria": "SY",
  "Iran": "IR",
  "Bolivia": "BO",
  "Venezuela": "VE",
  "Tanzania": "TZ",
  "Moldova": "MD",
  "Laos": "LA",
};

const LANG = "en";

/**
 * Resolves a raw CRM country value to an English country name.
 * Resolve order: ISO alpha-3 → ISO alpha-2 → exact name → alias match.
 * Returns null if the value cannot be resolved.
 */
export function transformCountry(raw: string | null | undefined): string | null {
  if (isEmptyValue(raw)) return null;
  const str = (raw as string).trim();
  if (str === "") return null;

  // 1. Try as ISO alpha-3 (3-letter code)
  if (/^[A-Za-z]{3}$/.test(str)) {
    const alpha2 = countries.alpha3ToAlpha2(str.toUpperCase());
    if (alpha2) {
      const name = countries.getName(alpha2, LANG);
      if (name) return name;
    }
  }

  // 2. Try as ISO alpha-2 (2-letter code)
  if (/^[A-Za-z]{2}$/.test(str)) {
    const name = countries.getName(str.toUpperCase(), LANG);
    if (name) return name;
  }

  // 3. Try exact name match via getAlpha2Code
  const alpha2ByName = countries.getAlpha2Code(str, LANG);
  if (alpha2ByName) {
    const name = countries.getName(alpha2ByName, LANG);
    if (name) return name;
  }

  // 4. Try alias table
  for (const [alias, alpha2] of Object.entries(COUNTRY_ALIASES)) {
    if (alias.toLowerCase() === str.toLowerCase()) {
      const name = countries.getName(alpha2, LANG);
      if (name) return name;
    }
  }

  return null;
}

/**
 * Returns a human-readable fail reason for FillReport when the country value
 * cannot be resolved.
 */
export function getCountryFailReason(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _raw: string
): "unrecognized country value" {
  return "unrecognized country value";
}
