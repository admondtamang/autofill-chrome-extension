import { z } from "zod";
import type { RecordDefinition } from "@/shared/contracts/recordType";
import type { ApplicantProfile } from "@/shared/types/applicantProfile";
import { baseRowSchema, INTERNAL_FIELDS, MAPPED_FIELDS } from "./visaApplicant";
import { transformDate } from "@/transforms/date";
import { transformCountry } from "@/transforms/country";
import { isEmptyValue } from "@/transforms/empty";

// ---------------------------------------------------------------------------
// Lead row schema — extends base with lead-specific field overrides
// ---------------------------------------------------------------------------

export const leadRowSchema = baseRowSchema.extend({
  visa: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  serviceType: z.string().nullable().optional(),
  qualification: z.string().nullable().optional(),
});

export type LeadRow = z.infer<typeof leadRowSchema>;

// ---------------------------------------------------------------------------
// Fields explicitly handled by this transform (excluded from extras)
// ---------------------------------------------------------------------------

const LEAD_MAPPED_FIELDS = new Set([
  ...MAPPED_FIELDS,
  "visa",       // mapped to visa.currentVisa
  "address",    // mapped to extras as "Address"
  "serviceType",// mapped to extras as "Service Type"
  "qualification", // mapped to extras as "Qualification"
]);

const LEAD_LABEL_OVERRIDES: Record<string, string> = {
  statusDate: "Status date",
};

function labelFor(key: string): string {
  if (key in LEAD_LABEL_OVERRIDES) return LEAD_LABEL_OVERRIDES[key];
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function extractDate(raw: string | null | undefined): string | undefined {
  const result = transformDate(raw);
  if (!result) return undefined;
  if (typeof result === "string") return result;
  return result.value;
}

// ---------------------------------------------------------------------------
// toApplicantProfile for Lead
// ---------------------------------------------------------------------------

function toApplicantProfile(raw: unknown): ApplicantProfile {
  const parseResult = leadRowSchema.safeParse(raw);
  const row: LeadRow = parseResult.success ? parseResult.data : (raw as LeadRow);

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
    typeof row.country === "string" && !isEmptyValue(row.country)
      ? (transformCountry(row.country) ?? row.country)
      : undefined;
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
  // Lead uses `visa` field name; visaApplicant uses `currentVisa`
  const visa: Record<string, unknown> = {};
  if (row.location === "Onshore") visa["inAustralia"] = "Yes";
  else if (row.location === "Offshore") visa["inAustralia"] = "No";

  const currentVisa = row.visa ?? row.currentVisa;
  if (!isEmptyValue(currentVisa)) visa["currentVisa"] = currentVisa;

  const currentVisaExpiry = extractDate(row.visaExpiry);
  if (currentVisaExpiry !== undefined) visa["currentVisaExpiry"] = currentVisaExpiry;

  if (!isEmptyValue(row.proposedVisa)) visa["proposed"] = row.proposedVisa;
  if (!isEmptyValue(row.visaStream)) visa["stream"] = row.visaStream;

  if (Object.keys(visa).length > 0) profile["visa"] = visa;

  // --- employment ---
  const employment: Record<string, unknown> = {};
  if (!isEmptyValue(row.occupation)) employment["nominatedOccupation"] = row.occupation;
  if (!isEmptyValue(row.anzsco)) {
    employment["anzscoCode"] = String(row.anzsco).replace(/\D/g, "");
  }
  if (Object.keys(employment).length > 0) profile["employment"] = employment;

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

  // --- extras: lead-specific fields + any unknown non-internal non-mapped fields ---
  const extras: Array<{ path: string; label: string; value: string }> = [];

  // Address (full string — not a state)
  if (typeof row.address === "string" && !isEmptyValue(row.address)) {
    extras.push({ path: "address", label: "Address", value: row.address });
  }

  // Service type (JSON-encoded string array)
  if (typeof row.serviceType === "string" && !isEmptyValue(row.serviceType)) {
    try {
      const parsed = JSON.parse(row.serviceType) as unknown;
      const display = Array.isArray(parsed) ? parsed.join(", ") : row.serviceType;
      extras.push({ path: "serviceType", label: "Service Type", value: display });
    } catch {
      extras.push({ path: "serviceType", label: "Service Type", value: row.serviceType });
    }
  }

  // Qualification
  if (typeof row.qualification === "string" && !isEmptyValue(row.qualification)) {
    extras.push({ path: "qualification", label: "Qualification", value: row.qualification });
  }

  // Any remaining visible, non-internal, non-mapped, non-empty fields
  const rowRecord = raw as Record<string, unknown>;
  for (const key of Object.keys(rowRecord)) {
    if (INTERNAL_FIELDS.has(key)) continue;
    if (LEAD_MAPPED_FIELDS.has(key)) continue;
    const val = rowRecord[key];
    if (isEmptyValue(val)) continue;
    if (typeof val === "object") continue; // skip nested objects
    extras.push({ path: key, label: labelFor(key), value: String(val) });
  }

  if (extras.length > 0) profile["extras"] = extras;

  return profile as unknown as ApplicantProfile;
}

// ---------------------------------------------------------------------------
// Record definition export
// ---------------------------------------------------------------------------

export const leadDefinition: RecordDefinition<LeadRow> = {
  id: "lead",
  label: "Lead",
  path: "/lead",
  rowSchema: leadRowSchema,
  toApplicantProfile,
};
