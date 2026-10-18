// ASSUMPTION A3: same schema as visaApplicant until samples/student.json and samples/lead.json exist
import type { RecordDefinition } from "@/shared/contracts/recordType";
import { baseRowSchema, type VisaApplicantRow, visaApplicantDefinition } from "./visaApplicant";

export const studentDefinition: RecordDefinition<VisaApplicantRow> = {
  id: "student",
  label: "Student",
  path: "/student",
  rowSchema: baseRowSchema,
  toApplicantProfile: visaApplicantDefinition.toApplicantProfile,
};
