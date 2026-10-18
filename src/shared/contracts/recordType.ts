import { z, type ZodSchema } from "zod";
import type { ApplicantProfile } from "../types/applicantProfile";

export const recordTypeSchema = z.enum(["visaApplicant", "student", "lead"]);
export type RecordType = z.infer<typeof recordTypeSchema>;

export type RecordDefinition<R> = {
  id: RecordType;
  label: string;
  path: string;
  rowSchema: ZodSchema<R>;
  toApplicantProfile: (row: R) => ApplicantProfile;
};
