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

/**
 * A real CRM record is partial: most people have no passport on file, no visa
 * expiry, no address history. Every group therefore defaults rather than being
 * required — an absent value must end as `missing` in the fill report, which is
 * a first-class outcome, NOT a reason to reject the whole person.
 *
 * The inferred type is unchanged: after parsing every key is present (null where
 * the CRM had nothing), so the fill engine and `preflight` are unaffected.
 */
const nullableString = z.string().nullable().default(null);

export const ApplicantPayload = z.object({
  personRef: z.object({ type: EntityType, id: z.number().int() }),
  name: z
    .object({
      given: z.string().default(''),
      middle: nullableString,
      family: z.string().default(''),
    })
    .default({ given: '', middle: null, family: '' }),
  dob: nullableString, // ISO yyyy-MM-dd
  contact: z
    .object({ email: nullableString, phone: nullableString })
    .default({ email: null, phone: null }),
  passport: z
    .object({ number: nullableString, issued: nullableString, expires: nullableString })
    .default({ number: null, issued: null, expires: null }),
  citizenship: z
    .object({ code: nullableString, label: nullableString })
    .default({ code: null, label: null }),
  currentVisa: z
    .object({ type: nullableString, expires: nullableString })
    .default({ type: null, expires: null }),
  address: z.object({ residential: nullableString }).default({ residential: null }),
  location: nullableString, // 'Onshore' | 'Offshore' (free text)
  employment: z.object({ occupation: nullableString }).default({ occupation: null }),
  education: z.object({ highest: nullableString }).default({ highest: null }),
  serviceTypes: z.array(z.string()).default([]),
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
