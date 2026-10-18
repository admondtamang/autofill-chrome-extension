import type { FieldMap } from "@/shared/contracts/fieldMap";

export const applicantDetailsMap: FieldMap = {
  id: "applicantDetails",
  pageMatcher: /applicantDetails|personal/i,
  verified: false,
  fields: [
    {
      profilePath: "personal.familyName",
      locator: { type: "label", value: "Family name" },
      control: "text",
      verified: false,
    },
    {
      profilePath: "personal.givenNames",
      locator: { type: "label", value: "Given names" },
      control: "text",
      verified: false,
    },
    {
      profilePath: "personal.dateOfBirth",
      locator: { type: "label", value: "Date of birth" },
      control: "date",
      transform: "date",
      verified: false,
    },
  ],
};
