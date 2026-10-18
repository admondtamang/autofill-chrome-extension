import type { FieldMap } from "@/shared/contracts/fieldMap";

export const visaHistoryMap: FieldMap = {
  id: "visaHistory",
  pageMatcher: /visa|history/i,
  verified: false,
  fields: [
    {
      profilePath: "visa.inAustralia",
      locator: { type: "label", value: "Is the applicant currently in Australia?" },
      control: "radio",
      verified: false,
    },
    {
      profilePath: "visa.currentVisa",
      locator: { type: "label", value: "Current visa" },
      control: "text",
      verified: false,
    },
    {
      profilePath: "visa.currentVisaExpiry",
      locator: { type: "label", value: "Current visa expiry" },
      control: "date",
      transform: "date",
      verified: false,
    },
  ],
};
