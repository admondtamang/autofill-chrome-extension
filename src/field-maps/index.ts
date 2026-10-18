import type { FieldMap } from "@/shared/contracts/fieldMap";
import { applicantDetailsMap } from "./applicantDetails";
import { passportDetailsMap } from "./passportDetails";
import { contactDetailsMap } from "./contactDetails";
import { visaHistoryMap } from "./visaHistory";

export { applicantDetailsMap } from "./applicantDetails";
export { passportDetailsMap } from "./passportDetails";
export { contactDetailsMap } from "./contactDetails";
export { visaHistoryMap } from "./visaHistory";

export const ALL_FIELD_MAPS: FieldMap[] = [
  applicantDetailsMap,
  passportDetailsMap,
  contactDetailsMap,
  visaHistoryMap,
];

/**
 * Find the first FieldMap whose pageMatcher matches the given href.
 */
export function getMapForPage(href: string): FieldMap | undefined {
  for (const map of ALL_FIELD_MAPS) {
    const matcher = map.pageMatcher;
    if (typeof matcher === "string") {
      if (href.includes(matcher)) return map;
    } else {
      if (matcher.test(href)) return map;
    }
  }
  return undefined;
}
