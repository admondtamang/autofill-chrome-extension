import type { FieldMap } from "@/shared/contracts/fieldMap";

export const passportDetailsMap: FieldMap = {
  id: "passportDetails",
  pageMatcher: /passport/i,
  verified: false,
  fields: [
    {
      profilePath: "passport.number",
      locator: { type: "label", value: "Passport number" },
      control: "text",
      verified: false,
    },
    {
      profilePath: "passport.dateOfIssue",
      locator: { type: "label", value: "Date of issue" },
      control: "date",
      transform: "date",
      verified: false,
    },
    {
      profilePath: "passport.dateOfExpiry",
      locator: { type: "label", value: "Date of expiry" },
      control: "date",
      transform: "date",
      verified: false,
    },
    {
      profilePath: "passport.country",
      locator: { type: "label", value: "Country of passport" },
      control: "select",
      transform: "country",
      verified: false,
    },
  ],
};
