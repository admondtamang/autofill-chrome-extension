import type { RecordType, RecordDefinition } from "@/shared/contracts/recordType";
import { visaApplicantDefinition } from "./visaApplicant";
import { studentDefinition } from "./student";
import { leadDefinition } from "./lead";

export const RECORD_REGISTRY: Map<RecordType, RecordDefinition<unknown>> = new Map([
  ["visaApplicant", visaApplicantDefinition as RecordDefinition<unknown>],
  ["student", studentDefinition as RecordDefinition<unknown>],
  ["lead", leadDefinition as RecordDefinition<unknown>],
]);
