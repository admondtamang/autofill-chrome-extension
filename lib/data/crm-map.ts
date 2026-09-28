import { ApplicantPayload, type EntityType } from '@/lib/schema';
import type { PaletteValue } from '@/lib/messages';

/**
 * Maps a real Success CRM record onto `ApplicantPayload`.
 *
 * The backend PRD's `/immifill/payload` route does not exist, so the extension
 * reads the ordinary entity record (`/lead/{id}`, `/student/{id}`, ...) and
 * shapes it here. The CRM's column names are not documented anywhere we can
 * see, so each field lists candidate spellings (snake_case and camelCase).
 *
 * Adding a spelling is a one-line change to the table below — deliberately
 * data, not logic, so fixing a mismatch never means touching the fill engine.
 */

type Rec = Record<string, unknown>;

/** Express responses commonly nest the record under `data` (or `result`/`row`). */
export function unwrapRecord(body: unknown): Rec {
  if (typeof body !== 'object' || body === null) return {};
  const o = body as Rec;
  for (const key of ['data', 'result', 'row', 'record']) {
    const inner = o[key];
    if (typeof inner === 'object' && inner !== null && !Array.isArray(inner)) {
      return { ...(inner as Rec), ...o }; // outer keys win; inner fills the gaps
    }
  }
  return o;
}

/** Raw value of the first candidate present — used where the shape is not a string. */
function rawOf(rec: Rec, keys: readonly string[]): unknown {
  const lower = new Map(Object.keys(rec).map((k) => [k.toLowerCase(), k]));
  for (const key of keys) {
    const actual = lower.get(key.toLowerCase());
    if (actual !== undefined && rec[actual] != null) return rec[actual];
  }
  return null;
}

/** First candidate present and non-empty, else null. Case-insensitive. */
function pick(rec: Rec, keys: readonly string[]): string | null {
  const lower = new Map(Object.keys(rec).map((k) => [k.toLowerCase(), k]));
  for (const key of keys) {
    const actual = lower.get(key.toLowerCase());
    if (actual === undefined) continue;
    const v = rec[actual];
    if (v === null || v === undefined || v === '') continue;
    if (typeof v === 'object') continue; // nested shapes are handled explicitly
    return String(v);
  }
  return null;
}

/**
 * The engine formats dates from ISO (`formatValue` calls `parseISO`), so any
 * other shape must be normalised here or every date silently reports missing.
 *
 * The CRM stores `dob` MONTH-FIRST: the live data contains "07/13/2026", and 13
 * cannot be a month. Read month-first, but fall back to day-first when the
 * first part cannot be a month — that way "25/12/2026" is still December 25
 * rather than being discarded.
 */
export function toIsoDate(raw: string | null): string | null {
  if (raw === null) return null;
  const value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const iso = /^(\d{4}-\d{2}-\d{2})T/.exec(value);
  if (iso?.[1]) return iso[1];
  const slash = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  if (slash?.[1] && slash[2] && slash[3]) {
    const [a, b, year] = [Number(slash[1]), Number(slash[2]), slash[3]];
    const [month, day] = a > 12 ? [b, a] : [a, b]; // month-first unless impossible
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10);
}

/** `serviceType` arrives as a JSON *string*: "[\"Visa\",\"Education\"]". */
export function parseServiceTypes(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string');
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [raw]; // a plain string is a single service, not a failure
  }
}

/**
 * `country` carries either an ISO-3 code ("NPL", "AUT") or a name ("Nepal").
 * Set whichever it is and leave the other null: guessing a translation would
 * risk filling a wrong country, and a mismatch is visible as `rejected`.
 */
export function splitCountry(raw: string | null): { code: string | null; label: string | null } {
  if (raw === null) return { code: null, label: null };
  return /^[A-Z]{2,3}$/.test(raw.trim())
    ? { code: raw.trim(), label: null }
    : { code: null, label: raw.trim() };
}

/**
 * First entry in each list is the name VERIFIED against the live CRM
 * (2026-09-27, `/lead` and `/lead/{id}`); the rest are fallbacks in case other
 * entity types spell it differently.
 */
const F = {
  given: ['firstName', 'first_name', 'given_name', 'givenName'],
  middle: ['middleName', 'middle_name', 'middle'],
  family: ['lastName', 'last_name', 'family_name', 'familyName', 'surname'],
  dob: ['dob', 'date_of_birth', 'dateOfBirth', 'birthDate'],
  email: ['email', 'email_address', 'emailAddress'],
  phone: ['phone', 'mobile', 'phone_number', 'phoneNumber'],
  passportNumber: ['passport', 'passport_number', 'passportNumber', 'passportNo'],
  passportIssued: ['issueDate', 'issue_date', 'passport_issue_date', 'passportIssueDate'],
  passportExpires: ['expiryDate', 'expiry_date', 'passport_expiry_date', 'passportExpiry'],
  country: ['country', 'nationality', 'citizenship', 'country_of_citizenship'],
  visaType: ['visa', 'visa_type', 'visaType', 'visa_subclass'],
  visaExpires: ['visaExpiry', 'visa_expiry', 'visa_expiry_date', 'visa_expires'],
  address: ['address', 'residential_address', 'residentialAddress', 'street_address'],
  location: ['location', 'onshore_offshore', 'applying_from'],
  occupation: ['occupation', 'anzsco', 'job_title', 'jobTitle', 'profession'],
  education: ['qualification', 'highest_qualification', 'highest_education', 'education'],
  serviceType: ['serviceType', 'service_type', 'serviceTypes', 'services'],
} as const;

export function toApplicantPayload(type: EntityType, id: number, body: unknown): ApplicantPayload {
  const r = unwrapRecord(body);
  return ApplicantPayload.parse({
    personRef: { type, id },
    name: {
      given: pick(r, F.given) ?? '',
      middle: pick(r, F.middle),
      family: pick(r, F.family) ?? '',
    },
    dob: toIsoDate(pick(r, F.dob)),
    contact: { email: pick(r, F.email), phone: pick(r, F.phone) },
    passport: {
      number: pick(r, F.passportNumber),
      issued: toIsoDate(pick(r, F.passportIssued)),
      expires: toIsoDate(pick(r, F.passportExpires)),
    },
    citizenship: splitCountry(pick(r, F.country)),
    currentVisa: { type: pick(r, F.visaType), expires: toIsoDate(pick(r, F.visaExpires)) },
    address: { residential: pick(r, F.address) },
    location: pick(r, F.location),
    employment: { occupation: pick(r, F.occupation) },
    education: { highest: pick(r, F.education) },
    serviceTypes: parseServiceTypes(rawOf(r, F.serviceType)),
    addressHistory: [], // the CRM has no address history on a lead
  });
}

/** CRM keys this mapper ignored. Key names only — never values (CONTRACTS §8.1). */
export function unmappedKeys(body: unknown): string[] {
  const known = new Set(Object.values(F).flat().map((k) => k.toLowerCase()));
  return Object.keys(unwrapRecord(body)).filter((k) => !known.has(k.toLowerCase()));
}

/**
 * CRM fields the payload mapping has no home for, as extra rows for the value
 * list (§11.6). `ApplicantPayload` is the shape the FILL ENGINE needs; the
 * value list is for manual placement, where `status` or an ANZSCO code is just
 * as worth pasting. Without this the panel shows a handful of rows from a
 * 40-key record.
 *
 * Skipped: internal ids, audit timestamps, and nested objects/arrays — none of
 * them are things an agent would paste into a government form.
 */
const SKIP = new Set([
  'id', 'userid', 'sourceid', 'branchid', 'updatedby', 'studentid', 'skillassessmentid',
  'visaapplicantid', 'insuranceapplicantid', 'tribunalreviewid',
  'createdat', 'updatedat', 'deletedat', 'reopenedat', 'leadstagehistory',
]);

/** `firstName` -> `First name`; `anzsco` -> `Anzsco`. */
function humanise(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function extraValues(body: unknown): PaletteValue[] {
  const rec = unwrapRecord(body);
  const mapped = new Set(Object.values(F).flat().map((k) => k.toLowerCase()));
  const out: PaletteValue[] = [];
  for (const [key, raw] of Object.entries(rec)) {
    const lower = key.toLowerCase();
    if (mapped.has(lower) || SKIP.has(lower)) continue;
    // Objects and arrays are structure, not a value someone pastes into a field.
    // (null is kept: an empty row still tells the agent the field exists.)
    if (raw !== null && typeof raw === 'object') continue;
    out.push({
      path: `crm.${key}`,
      label: humanise(key),
      value: raw === null || raw === undefined ? '' : String(raw),
      kind: /date|expiry|dob/i.test(key) ? 'date' : 'text',
    });
  }
  return out;
}
