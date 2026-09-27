import { ApplicantPayload, type EntityType } from '@/lib/schema';

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
 * An ambiguous slash date is read day-first, which is the Australian form.
 */
export function toIsoDate(raw: string | null): string | null {
  if (raw === null) return null;
  const value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const iso = /^(\d{4}-\d{2}-\d{2})T/.exec(value);
  if (iso?.[1]) return iso[1];
  const slash = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  if (slash?.[1] && slash[2] && slash[3]) {
    return `${slash[3]}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10);
}

const F = {
  given: ['first_name', 'firstName', 'given_name', 'givenName', 'first'],
  middle: ['middle_name', 'middleName', 'middle'],
  family: ['last_name', 'lastName', 'family_name', 'familyName', 'surname', 'last'],
  dob: ['dob', 'date_of_birth', 'dateOfBirth', 'birth_date', 'birthDate', 'birthdate'],
  email: ['email', 'email_address', 'emailAddress', 'primary_email', 'personal_email'],
  phone: ['phone', 'mobile', 'phone_number', 'phoneNumber', 'mobile_number', 'contact_number'],
  passportNumber: ['passport_number', 'passportNumber', 'passport_no', 'passportNo', 'passport'],
  passportIssued: ['passport_issue_date', 'passportIssueDate', 'passport_issued', 'passport_issue'],
  passportExpires: ['passport_expiry_date', 'passportExpiry', 'passport_expiry', 'passport_expires'],
  citizenshipLabel: ['nationality', 'citizenship', 'country_of_citizenship', 'citizenship_name'],
  citizenshipCode: ['citizenship_code', 'nationality_code', 'country_code'],
  visaType: ['visa_type', 'visaType', 'current_visa', 'visa', 'visa_subclass'],
  visaExpires: ['visa_expiry_date', 'visaExpiry', 'visa_expiry', 'visa_expires'],
  address: ['residential_address', 'residentialAddress', 'address', 'street_address', 'address_line1'],
  location: ['location', 'onshore_offshore', 'applying_from', 'applicant_location'],
  occupation: ['occupation', 'job_title', 'jobTitle', 'profession'],
  education: ['highest_qualification', 'highest_education', 'qualification', 'education'],
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
    citizenship: { code: pick(r, F.citizenshipCode), label: pick(r, F.citizenshipLabel) },
    currentVisa: { type: pick(r, F.visaType), expires: toIsoDate(pick(r, F.visaExpires)) },
    address: { residential: pick(r, F.address) },
    location: pick(r, F.location),
    employment: { occupation: pick(r, F.occupation) },
    education: { highest: pick(r, F.education) },
    serviceTypes: [],
    addressHistory: [],
  });
}

/** CRM keys this mapper ignored. Key names only — never values (CONTRACTS §8.1). */
export function unmappedKeys(body: unknown): string[] {
  const known = new Set(Object.values(F).flat().map((k) => k.toLowerCase()));
  return Object.keys(unwrapRecord(body)).filter((k) => !known.has(k.toLowerCase()));
}
