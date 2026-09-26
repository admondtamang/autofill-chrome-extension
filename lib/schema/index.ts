import { z } from 'zod';

export const EntityType = z.enum([
  'lead',
  'student',
  'education',
  'visa',
  'skill-assessment',
  'tribunal',
  'insurance',
]);
export type EntityType = z.infer<typeof EntityType>;

export const ApplicantPayload = z.object({
  personRef: z.object({ type: EntityType, id: z.number().int() }),
  name: z.object({
    given: z.string(),
    middle: z.string().nullable(),
    family: z.string(),
  }),
  dob: z.string().nullable(), // ISO yyyy-MM-dd
  contact: z.object({ email: z.string().nullable(), phone: z.string().nullable() }),
  passport: z.object({
    number: z.string().nullable(),
    issued: z.string().nullable(),
    expires: z.string().nullable(),
  }),
  citizenship: z.object({ code: z.string().nullable(), label: z.string().nullable() }),
  currentVisa: z.object({ type: z.string().nullable(), expires: z.string().nullable() }),
  address: z.object({ residential: z.string().nullable() }),
  location: z.string().nullable(), // 'Onshore' | 'Offshore' (free text)
  employment: z.object({ occupation: z.string().nullable() }),
  education: z.object({ highest: z.string().nullable() }),
  serviceTypes: z.array(z.string()),
  addressHistory: z
    .array(
      z.object({
        street: z.string().nullable(),
        city: z.string().nullable(),
        country: z.string().nullable(),
        from: z.string().nullable(),
        to: z.string().nullable(),
      }),
    )
    .default([]), // drives repeatGroup
});
export type ApplicantPayload = z.infer<typeof ApplicantPayload>;

export const PersonSummary = z.object({
  personRef: z.object({ type: EntityType, id: z.number().int() }),
  displayName: z.string(),
  email: z.string().nullable(),
  subtitle: z.string().nullable(), // shown under the name in the list
});
export type PersonSummary = z.infer<typeof PersonSummary>;

export const FieldMapping = z.object({
  path: z.string(),
  selector: z.string(), // '{value}' token substituted for radios
  fallbackLabel: z.string().optional(),
  type: z.enum(['text', 'select', 'radio', 'checkbox', 'date', 'textarea']),
  format: z.string().optional(), // date-fns pattern
  waitAfterMs: z.number().int().max(5000).optional(),
  required: z.boolean().default(false),
  repeatGroup: z.string().optional(), // payload array path, e.g. 'addressHistory'
  addButtonSelector: z.string().optional(), // required when repeatGroup is set
  rowSelector: z.string().optional(), // required when repeatGroup is set
});
export type FieldMapping = z.infer<typeof FieldMapping>;

export const FormMapping = z.object({
  formKey: z.string(),
  version: z.number().int(),
  pageMatch: z.object({
    host: z.string(),
    urlIncludes: z.string(),
    headingText: z.string(),
  }),
  fields: z.array(FieldMapping),
});
export type FormMapping = z.infer<typeof FormMapping>;

export const MappingIndexEntry = FormMapping.pick({
  formKey: true,
  version: true,
  pageMatch: true,
});
export type MappingIndexEntry = z.infer<typeof MappingIndexEntry>;

export const FieldStatus = z.enum(['filled', 'missing', 'not_found', 'rejected']);
export type FieldStatus = z.infer<typeof FieldStatus>;

export const FieldResult = z.object({
  path: z.string(),
  status: FieldStatus,
  detail: z.string().optional(), // never contains person data
});
export type FieldResult = z.infer<typeof FieldResult>;

export const FillReport = z.object({
  formKey: z.string(),
  mappingVersion: z.number().int(),
  results: z.array(FieldResult),
  snapshot: z.array(
    z.object({
      selector: z.string(),
      kind: z.enum(['value', 'checked']),
      value: z.string(),
    }),
  ),
});
export type FillReport = z.infer<typeof FillReport>;

export const FillAudit = z.object({
  formKey: z.string(),
  mappingVersion: z.number().int(),
  personType: EntityType,
  personId: z.number().int(),
  // COUNTS ONLY — never values. Zod v4's z.record() with an enum key demands
  // every key be present; partialRecord keeps each status optional.
  counts: z.partialRecord(FieldStatus, z.number().int()),
  at: z.string(), // ISO timestamp
});
export type FillAudit = z.infer<typeof FillAudit>;
