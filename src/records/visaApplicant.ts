import { z } from "zod";
import type { RecordDefinition } from "@/shared/contracts/recordType";
import type { ApplicantProfile } from "@/shared/types/applicantProfile";
import { transformDate } from "@/transforms/date";
import { transformNotes } from "@/transforms/notes";
import { isEmptyValue } from "@/transforms/empty";

// ---------------------------------------------------------------------------
// Row schema
// ---------------------------------------------------------------------------

const fileSchema = z
  .object({
    url: z.string(),
    name: z.string(),
    size: z.number(),
    addedDate: z.string(),
  })
  .passthrough();

/**
 * Base row schema shared by visaApplicant, student, and lead.
 * All fields are nullable().optional() to survive any shape the API returns.
 * Uses .passthrough() so unknown future fields are not stripped.
 */
export const baseRowSchema = z
  .object({
    // --- Identity / internal (never mapped to profile) ---
    id: z.number().nullable().optional(),
    userId: z.number().nullable().optional(),
    updatedBy: z.number().nullable().optional(),
    branchId: z.number().nullable().optional(),
    sourceId: z.number().nullable().optional(),
    createdAt: z.string().nullable().optional(),
    updatedAt: z.string().nullable().optional(),
    deletedAt: z.string().nullable().optional(),
    invoiceNumber: z.string().nullable().optional(),
    payment: z.unknown().nullable().optional(),
    paymentStatus: z.string().nullable().optional(),

    // --- Personal ---
    firstName: z.string().nullable().optional(),
    lastName: z.string().nullable().optional(),
    middleName: z.string().nullable().optional(),
    dob: z.string().nullable().optional(),

    // --- Passport ---
    passport: z.string().nullable().optional(),
    issueDate: z.string().nullable().optional(),
    expiryDate: z.string().nullable().optional(),
    country: z.string().nullable().optional(),

    // --- Contact ---
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),

    // --- Location / visa ---
    location: z.string().nullable().optional(),
    currentVisa: z.string().nullable().optional(),
    visaExpiry: z.string().nullable().optional(),
    proposedVisa: z.string().nullable().optional(),
    visaStream: z.string().nullable().optional(),
    visaSubmitted: z.string().nullable().optional(),
    visaGranted: z.string().nullable().optional(),

    // --- Address ---
    state: z.string().nullable().optional(),

    // --- CRM status ---
    status: z.string().nullable().optional(),
    statusDate: z.string().nullable().optional(),
    csaStatus: z.string().nullable().optional(),
    assignedDate: z.string().nullable().optional(),
    requestedDate: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),

    // --- Employment / sponsor ---
    occupation: z.string().nullable().optional(),
    anzsco: z.string().nullable().optional(),
    sponsorName: z.string().nullable().optional(),
    sponsorEmail: z.string().nullable().optional(),
    sponsorPhone: z.string().nullable().optional(),

    // --- Nomination ---
    nominationLodged: z.string().nullable().optional(),
    nominationDecision: z.string().nullable().optional(),
    nominationStatus: z.string().nullable().optional(),

    // --- Skills assessment ---
    sbsStatus: z.string().nullable().optional(),
    sbsSubmissionDate: z.string().nullable().optional(),
    sbsDecisionDate: z.string().nullable().optional(),

    // --- Notes ---
    remarks: z.string().nullable().optional(),
    visaNote: z.string().nullable().optional(),
    miscNote: z.string().nullable().optional(),

    // --- Files ---
    files: z.array(fileSchema).nullable().optional(),
  })
  .passthrough();

export type VisaApplicantRow = z.infer<typeof baseRowSchema>;

// ---------------------------------------------------------------------------
// Internal field sets
// ---------------------------------------------------------------------------

/** Fields that are NEVER surfaced in ApplicantProfile */
const INTERNAL_FIELDS = new Set([
  "id",
  "userId",
  "updatedBy",
  "branchId",
  "sourceId",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "invoiceNumber",
  "payment",
  "paymentStatus",
]);

/** Fields that are explicitly mapped to profile paths (not extras) */
const MAPPED_FIELDS = new Set([
  "firstName",
  "lastName",
  "middleName",
  "dob",
  "passport",
  "issueDate",
  "expiryDate",
  "country",
  "email",
  "phone",
  "location",
  "currentVisa",
  "visaExpiry",
  "proposedVisa",
  "visaStream",
  "visaSubmitted",
  "visaGranted",
  "state",
  "status",
  "csaStatus",
  "assignedDate",
  "requestedDate",
  "dueDate",
  "occupation",
  "anzsco",
  "sponsorName",
  "sponsorEmail",
  "sponsorPhone",
  "nominationLodged",
  "nominationDecision",
  "nominationStatus",
  "sbsStatus",
  "sbsSubmissionDate",
  "sbsDecisionDate",
  "remarks",
  "visaNote",
  "miscNote",
  "files",
]);

/** Human-readable labels for extras */
const FIELD_LABELS: Record<string, string> = {
  statusDate: "Status date",
  location: "Location",
};

function labelFor(key: string): string {
  if (key in FIELD_LABELS) return FIELD_LABELS[key];
  // camelCase → "Camel Case"
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

// ---------------------------------------------------------------------------
// Date extraction helper
// ---------------------------------------------------------------------------

/**
 * Extracts a plain YYYY-MM-DD string from transformDate output.
 * When transformDate returns a DateField object (ISO timestamp case),
 * we take only the `.value` string so that ApplicantProfile fields are
 * always plain strings — never [object Object] when coerced.
 */
function extractDate(raw: string | null | undefined): string | undefined {
  const result = transformDate(raw);
  if (!result) return undefined;
  if (typeof result === "string") return result;
  return result.value; // DateField — take the string value
}

// ---------------------------------------------------------------------------
// Mapping helper
// ---------------------------------------------------------------------------

function setIfDefined<T extends object, K extends keyof T>(
  obj: T,
  key: K,
  value: T[K] | undefined
): void {
  if (!isEmptyValue(value) && value !== undefined) {
    obj[key] = value;
  }
}

// ---------------------------------------------------------------------------
// toApplicantProfile
// ---------------------------------------------------------------------------

function toApplicantProfile(row: VisaApplicantRow): ApplicantProfile {
  const profile: Record<string, unknown> = {};

  // --- personal ---
  const personal: Record<string, unknown> = {};
  const familyName = typeof row.lastName === "string" ? row.lastName.trim() : undefined;
  if (!isEmptyValue(familyName)) personal["familyName"] = familyName;

  const givenParts = [row.firstName, row.middleName]
    .filter((p): p is string => typeof p === "string" && !isEmptyValue(p))
    .map((p) => p.trim())
    .filter((p) => p !== "");
  if (givenParts.length > 0) personal["givenNames"] = givenParts.join(" ");

  const dob = extractDate(row.dob);
  if (dob !== undefined) personal["dateOfBirth"] = dob;

  if (Object.keys(personal).length > 0) profile["personal"] = personal;

  // --- passport ---
  const passport: Record<string, unknown> = {};
  const passportNum =
    typeof row.passport === "string" ? row.passport.trim().toUpperCase() : undefined;
  if (!isEmptyValue(passportNum)) passport["number"] = passportNum;

  const dateOfIssue = extractDate(row.issueDate);
  if (dateOfIssue !== undefined) passport["dateOfIssue"] = dateOfIssue;

  const dateOfExpiry = extractDate(row.expiryDate);
  if (dateOfExpiry !== undefined) passport["dateOfExpiry"] = dateOfExpiry;

  const passportCountry =
    typeof row.country === "string" && !isEmptyValue(row.country) ? row.country : undefined;
  if (passportCountry !== undefined) passport["country"] = passportCountry;

  if (Object.keys(passport).length > 0) profile["passport"] = passport;

  // --- contact ---
  const contact: Record<string, unknown> = {};
  const emailVal =
    typeof row.email === "string" && !isEmptyValue(row.email)
      ? row.email.trim().toLowerCase()
      : undefined;
  if (emailVal !== undefined) contact["email"] = emailVal;

  const mobileVal =
    typeof row.phone === "string" && !isEmptyValue(row.phone) ? row.phone : undefined;
  if (mobileVal !== undefined) contact["mobile"] = mobileVal;

  if (Object.keys(contact).length > 0) profile["contact"] = contact;

  // --- visa ---
  const visa: Record<string, unknown> = {};
  if (row.location === "Onshore") visa["inAustralia"] = "Yes";
  else if (row.location === "Offshore") visa["inAustralia"] = "No";

  if (!isEmptyValue(row.currentVisa)) visa["currentVisa"] = row.currentVisa;

  const currentVisaExpiry = extractDate(row.visaExpiry);
  if (currentVisaExpiry !== undefined) visa["currentVisaExpiry"] = currentVisaExpiry;

  if (!isEmptyValue(row.proposedVisa)) visa["proposed"] = row.proposedVisa;
  if (!isEmptyValue(row.visaStream)) visa["stream"] = row.visaStream;

  const submitted = extractDate(row.visaSubmitted);
  if (submitted !== undefined) visa["submitted"] = submitted;

  const granted = extractDate(row.visaGranted);
  if (granted !== undefined) visa["granted"] = granted;

  if (Object.keys(visa).length > 0) profile["visa"] = visa;

  // --- employment ---
  const employment: Record<string, unknown> = {};
  if (!isEmptyValue(row.occupation)) employment["nominatedOccupation"] = row.occupation;
  if (!isEmptyValue(row.anzsco)) {
    employment["anzscoCode"] = String(row.anzsco).replace(/\D/g, "");
  }
  if (Object.keys(employment).length > 0) profile["employment"] = employment;

  // --- address ---
  const address: Record<string, unknown> = {};
  if (!isEmptyValue(row.state)) address["state"] = row.state;
  if (Object.keys(address).length > 0) profile["address"] = address;

  // --- sponsor ---
  const sponsor: Record<string, unknown> = {};
  if (!isEmptyValue(row.sponsorName)) sponsor["name"] = row.sponsorName;
  if (!isEmptyValue(row.sponsorEmail)) sponsor["email"] = row.sponsorEmail;
  if (!isEmptyValue(row.sponsorPhone)) sponsor["phone"] = row.sponsorPhone;
  if (Object.keys(sponsor).length > 0) profile["sponsor"] = sponsor;

  // --- nomination ---
  const nomination: Record<string, unknown> = {};
  const nomLodged = extractDate(row.nominationLodged);
  if (nomLodged !== undefined) nomination["lodged"] = nomLodged;

  const nomDecision = extractDate(row.nominationDecision);
  if (nomDecision !== undefined) nomination["decision"] = nomDecision;

  if (!isEmptyValue(row.nominationStatus)) nomination["status"] = row.nominationStatus;
  if (Object.keys(nomination).length > 0) profile["nomination"] = nomination;

  // --- skillsAssessment ---
  const skillsAssessment: Record<string, unknown> = {};
  if (!isEmptyValue(row.sbsStatus)) skillsAssessment["status"] = row.sbsStatus;

  const sbsSubmitted = extractDate(row.sbsSubmissionDate);
  if (sbsSubmitted !== undefined) skillsAssessment["submitted"] = sbsSubmitted;

  const sbsDecision = extractDate(row.sbsDecisionDate);
  if (sbsDecision !== undefined) skillsAssessment["decision"] = sbsDecision;

  if (Object.keys(skillsAssessment).length > 0) profile["skillsAssessment"] = skillsAssessment;

  // --- crm ---
  const crm: Record<string, unknown> = {};
  if (!isEmptyValue(row.status)) crm["status"] = row.status;
  if (!isEmptyValue(row.csaStatus)) crm["csaStatus"] = row.csaStatus;

  const assignedDate = extractDate(row.assignedDate);
  if (assignedDate !== undefined) crm["assignedDate"] = assignedDate;

  const requestedDate = extractDate(row.requestedDate);
  if (requestedDate !== undefined) crm["requestedDate"] = requestedDate;

  const dueDate = extractDate(row.dueDate);
  if (dueDate !== undefined) crm["dueDate"] = dueDate;

  if (Object.keys(crm).length > 0) profile["crm"] = crm;

  // --- notes ---
  const notes: Record<string, unknown> = {};
  const remarks = transformNotes(row.remarks);
  if (remarks !== undefined) notes["remarks"] = remarks;

  const visaNote = transformNotes(row.visaNote);
  if (visaNote !== undefined) notes["visaNote"] = visaNote;

  const miscNote = transformNotes(row.miscNote);
  if (miscNote !== undefined) notes["miscNote"] = miscNote;

  if (Object.keys(notes).length > 0) profile["notes"] = notes;

  // --- files ---
  if (Array.isArray(row.files) && row.files.length > 0) {
    profile["files"] = row.files.map((f) => ({
      url: f.url,
      name: f.name,
      size: f.size,
      addedDate: f.addedDate,
    }));
  }

  // --- extras: all visible, non-internal, non-mapped, non-empty fields ---
  const rowRecord = row as Record<string, unknown>;
  const extras: Array<{ path: string; label: string; value: string }> = [];
  for (const key of Object.keys(rowRecord)) {
    if (INTERNAL_FIELDS.has(key)) continue;
    if (MAPPED_FIELDS.has(key)) continue;
    const val = rowRecord[key];
    if (isEmptyValue(val)) continue;
    extras.push({
      path: key,
      label: labelFor(key),
      value: String(val),
    });
  }
  if (extras.length > 0) profile["extras"] = extras;

  return profile as unknown as ApplicantProfile;
}

// ---------------------------------------------------------------------------
// Record definition export
// ---------------------------------------------------------------------------

export const visaApplicantDefinition: RecordDefinition<VisaApplicantRow> = {
  id: "visaApplicant",
  label: "Visa Applicant",
  path: "/visaApplicant",
  rowSchema: baseRowSchema,
  toApplicantProfile,
};

// Export helper for use in other record modules
export { setIfDefined };
