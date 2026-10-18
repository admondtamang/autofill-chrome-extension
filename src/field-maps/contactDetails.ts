import type { FieldMap } from "@/shared/contracts/fieldMap";

export const contactDetailsMap: FieldMap = {
  id: "contactDetails",
  pageMatcher: /contact/i,
  verified: false,
  fields: [
    {
      profilePath: "contact.email",
      locator: { type: "label", value: "Email address" },
      control: "text",
      verified: false,
    },
    {
      profilePath: "contact.mobile",
      locator: { type: "label", value: "Mobile/cell phone" },
      control: "text",
      transform: "phone",
      verified: false,
    },
  ],
};
