import type { ApplicantProfile } from "@/shared/types/applicantProfile";
import type { FieldMap, FieldEntry } from "@/shared/contracts/fieldMap";
import type { FillReport } from "@/shared/contracts/fillReport";
import { emptyFillReport } from "@/shared/contracts/fillReport";
import { isEmptyValue } from "@/transforms/empty";
import { transformDate } from "@/transforms/date";
import { transformCountry, getCountryFailReason } from "@/transforms/country";
import { transformPhone } from "@/transforms/phone";
import { transformState } from "@/transforms/state";
import { resolveElement } from "./locators";
import { setValue, hasValue } from "./controls";
import { waitForSettle } from "./settle";
import { highlightFilled, clearHighlights } from "./highlights";

/** Safely get a nested value from the profile via dot-path */
function getProfileValue(profile: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = profile;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Apply a named transform, returning [transformedValue, failReason] */
function applyTransform(
  transformName: string,
  rawValue: string
): [string | null, string | null] {
  switch (transformName) {
    case "date": {
      const result = transformDate(rawValue);
      if (result === undefined) return [null, "date transform returned undefined"];
      if (typeof result === "string") return [result, null];
      // DateField with verify flag — use the value
      return [result.value, null];
    }
    case "country": {
      const result = transformCountry(rawValue);
      if (result === null) return [null, getCountryFailReason(rawValue)];
      return [result, null];
    }
    case "phone": {
      const result = transformPhone(rawValue);
      if (result === null) return [null, "phone transform failed"];
      if ("international" in result) return [result.international, null];
      // PhoneSplit — join as best-effort
      return [`${result.countryCode} ${result.areaCode} ${result.number}`, null];
    }
    case "state": {
      const result = transformState(rawValue);
      if (result === null) return [null, "unrecognized state value"];
      return [result, null];
    }
    case "notes":
      // notes are display-only, never filled
      return [null, "notes are display-only"];
    default:
      return [rawValue, null];
  }
}

/**
 * fillAll: fills every field in the fieldMap using data from the profile.
 */
export async function fillAll(
  profile: ApplicantProfile,
  overwrite: boolean,
  fieldMap: FieldMap,
  doc: Document = document
): Promise<FillReport> {
  const report = emptyFillReport();
  clearHighlights(doc);

  // Guard against completely invalid profile input
  if (profile === null || profile === undefined || typeof profile !== "object") {
    return report;
  }

  for (const field of fieldMap.fields) {
    const raw = getProfileValue(profile, field.profilePath);

    // Skip if value is empty
    if (isEmptyValue(raw)) continue;

    const rawStr = String(raw);

    // Resolve the element
    const el = resolveElement(field.locator, doc);
    if (!el) {
      report.notFound.push(field.profilePath);
      continue;
    }

    // Skip if already has value and overwrite is false
    if (hasValue(el) && !overwrite) {
      report.skipped.push(field.profilePath);
      continue;
    }

    // Notes fields are display-only — skip silently
    if (field.transform === "notes") continue;

    // Apply transform if specified
    let valueToSet = rawStr;
    if (field.transform) {
      const [transformed, reason] = applyTransform(field.transform, rawStr);
      if (transformed === null) {
        report.failed.push({
          field: field.profilePath,
          reason: reason ?? "transform failed",
        });
        continue;
      }
      valueToSet = transformed;
    }

    // Set the value
    const success = setValue(el, valueToSet, field.control);
    if (!success) {
      report.failed.push({
        field: field.profilePath,
        reason: `setValue returned false for control type: ${field.control}`,
      });
      continue;
    }

    report.filled.push(field.profilePath);
    highlightFilled(el);

    // Wait for DOM to settle after each fill (conditional fields may appear)
    await waitForSettle(doc);
  }

  return report;
}

/**
 * clickToFill: fills a single field into a focused element or enters pick mode.
 */
export async function clickToFill(
  _profilePath: string,
  value: string,
  focusedEl: HTMLElement | null,
  control: import("@/shared/contracts/fieldMap").ControlType = "text"
): Promise<FillReport> {
  const report = emptyFillReport();

  if (!focusedEl) {
    // Caller should enter pick mode
    report.failed.push({ field: _profilePath, reason: "no focused element — enter pick mode" });
    return report;
  }

  const success = setValue(focusedEl, value, control);
  if (success) {
    report.filled.push(_profilePath);
    highlightFilled(focusedEl);
  } else {
    report.failed.push({ field: _profilePath, reason: "setValue returned false" });
  }

  return report;
}

/**
 * dropFill: fills a single field into a drop target element.
 */
export async function dropFill(
  profilePath: string,
  value: string,
  targetEl: HTMLElement,
  control: import("@/shared/contracts/fieldMap").ControlType = "text"
): Promise<FillReport> {
  const report = emptyFillReport();

  const success = setValue(targetEl, value, control);
  if (success) {
    report.filled.push(profilePath);
    highlightFilled(targetEl);
  } else {
    report.failed.push({ field: profilePath, reason: "setValue returned false" });
  }

  return report;
}

/** Re-export for use in content script */
export { resolveElement } from "./locators";
export { clearHighlights, highlightFilled } from "./highlights";
export { waitForSettle } from "./settle";

/** Helper: find a field entry by profilePath */
export function findFieldByPath(
  fieldMap: FieldMap,
  profilePath: string
): FieldEntry | undefined {
  return fieldMap.fields.find((f) => f.profilePath === profilePath);
}
