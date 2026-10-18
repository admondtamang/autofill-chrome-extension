// ASSUMPTION A3: same schema as visaApplicant until samples/student.json and samples/lead.json exist
import type { RecordDefinition } from "@/shared/contracts/recordType";
import { baseRowSchema, type VisaApplicantRow, visaApplicantDefinition } from "./visaApplicant";

export const leadDefinition: RecordDefinition<VisaApplicantRow> = {
  id: "lead",
  label: "Lead",
  path: "/lead",
  rowSchema: baseRowSchema,
  toApplicantProfile: visaApplicantDefinition.toApplicantProfile,
};
