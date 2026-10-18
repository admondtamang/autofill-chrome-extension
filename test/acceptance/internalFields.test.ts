/**
 * Acceptance tests for §9.2 case 9:
 * Internal fields from §7.3 never appear in the rendered user data screen.
 *
 * §7.3 internal fields (never shown, never filled):
 *   id, userId, updatedBy, branchId, sourceId, createdAt, updatedAt,
 *   deletedAt, invoiceNumber, payment, paymentStatus
 */
import { describe, it, expect } from "vitest";
import fixture from "../../docs/api/samples/visa-applicant.json";
import { visaApplicantDefinition } from "@/records/visaApplicant";

/** Internal fields that must NEVER appear in the rendered user data screen */
const INTERNAL_FIELDS = [
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
] as const;

/** All known profile path prefixes that the UserDataScreen renders */
const RENDERED_PROFILE_PATHS = new Set([
  "personal.familyName",
  "personal.givenNames",
  "personal.dateOfBirth",
  "passport.number",
  "passport.dateOfIssue",
  "passport.dateOfExpiry",
  "passport.country",
  "contact.email",
  "contact.mobile",
  "address.state",
  "visa.inAustralia",
  "visa.currentVisa",
  "visa.currentVisaExpiry",
  "visa.proposed",
  "visa.stream",
  "visa.submitted",
  "visa.granted",
  "employment.nominatedOccupation",
  "employment.anzscoCode",
  "sponsor.name",
  "sponsor.email",
  "sponsor.phone",
  "nomination.lodged",
  "nomination.decision",
  "nomination.status",
  "skillsAssessment.status",
  "skillsAssessment.submitted",
  "skillsAssessment.decision",
  "crm.status",
  "crm.csaStatus",
  "crm.assignedDate",
  "crm.requestedDate",
  "crm.dueDate",
]);

const { rowSchema, toApplicantProfile } = visaApplicantDefinition;

describe("§9.2.9 – internal fields never appear in user data screen", () => {
  it("no internal field name is used as a profilePath in the UserDataScreen", () => {
    // Verify that none of the INTERNAL_FIELDS appear as either the path segment
    // or the full profilePath in the known rendered paths
    for (const internalField of INTERNAL_FIELDS) {
      for (const renderedPath of RENDERED_PROFILE_PATHS) {
        // A profilePath like "id" or "branchId" directly, or a path ending in it
        const segments = renderedPath.split(".");
        expect(
          segments.includes(internalField),
          `Internal field "${internalField}" must not appear in rendered profile path "${renderedPath}"`,
        ).toBe(false);
      }
    }
  });

  for (const rawRow of fixture.rows) {
    const rowId = (rawRow as Record<string, unknown>)["id"];

    it(`row id=${String(rowId)}: internal fields not present in ApplicantProfile at any level`, () => {
      const parsed = rowSchema.parse(rawRow);
      const profile = toApplicantProfile(parsed) as Record<string, unknown>;

      for (const field of INTERNAL_FIELDS) {
        // Top-level profile keys must not be internal fields
        expect(
          Object.keys(profile).includes(field),
          `Internal field "${field}" must not appear as a top-level key in ApplicantProfile`,
        ).toBe(false);

        // extras must not contain internal field paths or labels matching the field name
        const extras = profile["extras"] as Array<{ path: string; label: string; value: string }> | undefined;
        if (extras) {
          const inExtras = extras.some(
            (e) => e.path === field || e.path.endsWith(`.${field}`),
          );
          expect(
            inExtras,
            `Internal field "${field}" must not appear in extras`,
          ).toBe(false);
        }
      }
    });
  }

  it("ApplicantProfile shape contains no top-level internal field keys", () => {
    // Verify all 5 fixture rows produce profiles without internal keys
    for (const rawRow of fixture.rows) {
      const parsed = rowSchema.parse(rawRow);
      const profile = toApplicantProfile(parsed) as Record<string, unknown>;
      const profileKeys = Object.keys(profile);

      for (const field of INTERNAL_FIELDS) {
        expect(
          profileKeys,
          `profile from row id=${String((rawRow as Record<string, unknown>)["id"])} must not have key "${field}"`,
        ).not.toContain(field);
      }
    }
  });

  it("internal fields are not present in the extras path of any row", () => {
    for (const rawRow of fixture.rows) {
      const parsed = rowSchema.parse(rawRow);
      const profile = toApplicantProfile(parsed) as Record<string, unknown>;
      const extras = (profile["extras"] as Array<{ path: string }> | undefined) ?? [];
      const extraPaths = extras.map((e) => e.path);

      for (const field of INTERNAL_FIELDS) {
        expect(
          extraPaths,
          `Internal field "${field}" must not appear in extras.path`,
        ).not.toContain(field);
      }
    }
  });

  it("UserDataScreen rendered profile paths do not overlap with internal field names", () => {
    // Direct intersection check: no rendered path segment should be an internal field name
    const renderedSegments = new Set<string>();
    for (const path of RENDERED_PROFILE_PATHS) {
      for (const segment of path.split(".")) {
        renderedSegments.add(segment);
      }
    }

    for (const field of INTERNAL_FIELDS) {
      expect(
        renderedSegments.has(field),
        `Internal field "${field}" found as a path segment in the rendered UserDataScreen paths`,
      ).toBe(false);
    }
  });
});
