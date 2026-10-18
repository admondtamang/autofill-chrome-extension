import { describe, it, expect } from "vitest";
import fixture from "../../docs/api/samples/visa-applicant.json";
import { visaApplicantDefinition } from "@/records/visaApplicant";

const { rowSchema, toApplicantProfile } = visaApplicantDefinition;

/** Fields that must NEVER appear in ApplicantProfile */
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

/** Fields that are explicitly mapped (not extras) */
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

function isEmptyRaw(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

describe("visaApplicant mapping — all 5 rows", () => {
  const rows = fixture.rows;

  it("fixture has exactly 5 rows", () => {
    expect(rows).toHaveLength(5);
  });

  for (const rawRow of rows) {
    const rowId = (rawRow as Record<string, unknown>)["id"];

    it(`row id=${String(rowId)}: rowSchema.parse succeeds`, () => {
      const result = rowSchema.safeParse(rawRow);
      expect(result.success).toBe(true);
    });

    it(`row id=${String(rowId)}: no internal fields in ApplicantProfile`, () => {
      const parsed = rowSchema.parse(rawRow);
      const profile = toApplicantProfile(parsed) as Record<string, unknown>;

      for (const field of INTERNAL_FIELDS) {
        // Check top-level keys
        expect(profile).not.toHaveProperty(field);
        // Extras should not contain internal fields either
        const extras = profile["extras"] as Array<{ path: string }> | undefined;
        if (extras) {
          const extrasHasField = extras.some((e) => e.path === field);
          expect(extrasHasField).toBe(false);
        }
      }
    });

    it(`row id=${String(rowId)}: every non-internal non-empty field is in profile or extras`, () => {
      const parsed = rowSchema.parse(rawRow);
      const profile = toApplicantProfile(parsed) as Record<string, unknown>;
      const extras = (profile["extras"] as Array<{ path: string }> | undefined) ?? [];
      const extraPaths = new Set(extras.map((e) => e.path));

      const rowRecord = rawRow as Record<string, unknown>;
      for (const key of Object.keys(rowRecord)) {
        if (INTERNAL_FIELDS.has(key)) continue;
        const val = rowRecord[key];
        if (isEmptyRaw(val)) continue;

        const isMapped = MAPPED_FIELDS.has(key);
        const isInExtras = extraPaths.has(key);

        expect(
          isMapped || isInExtras,
          `field "${key}" with value "${String(val)}" is neither mapped nor in extras`
        ).toBe(true);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Specific assertions for Shelley Grimes (id=4)
  // ---------------------------------------------------------------------------
  describe("row id=4 (Shelley Grimes) — specific field assertions", () => {
    const shelleyRaw = rows.find((r) => (r as Record<string, unknown>)["id"] === 4);

    it("fixture contains row id=4", () => {
      expect(shelleyRaw).toBeDefined();
    });

    it("contact.email = dyvasef@yopmail.com", () => {
      const parsed = rowSchema.parse(shelleyRaw);
      const profile = toApplicantProfile(parsed) as Record<string, unknown>;
      const contact = profile["contact"] as Record<string, unknown> | undefined;
      expect(contact?.["email"]).toBe("dyvasef@yopmail.com");
    });

    it("passport.country = NPL (raw value, not transformed)", () => {
      const parsed = rowSchema.parse(shelleyRaw);
      const profile = toApplicantProfile(parsed) as Record<string, unknown>;
      const passport = profile["passport"] as Record<string, unknown> | undefined;
      expect(passport?.["country"]).toBe("NPL");
    });

    it("visa.currentVisaExpiry is a plain date string '2026-09-17'", () => {
      const parsed = rowSchema.parse(shelleyRaw);
      const profile = toApplicantProfile(parsed) as Record<string, unknown>;
      const visa = profile["visa"] as Record<string, unknown> | undefined;
      const expiry = visa?.["currentVisaExpiry"];
      expect(expiry).toBeDefined();
      expect(typeof expiry).toBe("string");
      expect(expiry).toBe("2026-09-17");
    });

    it("employment.anzscoCode = 111111 (digits only)", () => {
      const parsed = rowSchema.parse(shelleyRaw);
      const profile = toApplicantProfile(parsed) as Record<string, unknown>;
      const employment = profile["employment"] as Record<string, unknown> | undefined;
      expect(employment?.["anzscoCode"]).toBe("111111");
    });
  });
});
