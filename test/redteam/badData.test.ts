import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { fillAll } from "@/filler/engine";
import { applicantDetailsMap } from "@/field-maps/applicantDetails";
import { passportDetailsMap } from "@/field-maps/passportDetails";
import { contactDetailsMap } from "@/field-maps/contactDetails";
import type { ApplicantProfile } from "@/shared/types/applicantProfile";

function makeDoc(html: string): Document {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body>${html}</body></html>`,
    { url: "https://online.immi.gov.au/test" }
  );
  return dom.window.document;
}

const applicantHtml = `
  <label for="familyName">Family name</label>
  <input type="text" id="familyName" name="familyName" />
  <label>Given names<input type="text" name="givenNames" /></label>
  <label for="dob">Date of birth</label>
  <input type="date" id="dob" name="dateOfBirth" />
`;

const passportHtml = `
  <label for="passportNumber">Passport number</label>
  <input type="text" id="passportNumber" name="passportNumber" />
  <label for="dateOfIssue">Date of issue</label>
  <input type="date" id="dateOfIssue" name="dateOfIssue" />
  <label for="dateOfExpiry">Date of expiry</label>
  <input type="date" id="dateOfExpiry" name="dateOfExpiry" />
  <label for="countryOfPassport">Country of passport</label>
  <select id="countryOfPassport" name="countryOfPassport">
    <option value="">-- Select --</option>
    <option value="Australia">Australia</option>
    <option value="Nepal">Nepal</option>
  </select>
`;

const contactHtml = `
  <label for="emailAddress">Email address</label>
  <input type="email" id="emailAddress" name="emailAddress" />
  <label for="mobilePhone">Mobile/cell phone</label>
  <input type="tel" id="mobilePhone" name="mobilePhone" />
`;

// ─── null profile fields ──────────────────────────────────────────────────────

describe("badData – null profile fields", () => {
  it("does not crash when personal is undefined", async () => {
    const doc = makeDoc(applicantHtml);
    const profile: ApplicantProfile = {};
    const report = await fillAll(profile, true, applicantDetailsMap, doc);
    expect(report).toBeDefined();
    expect(report.filled).toHaveLength(0);
    expect(report.failed).toHaveLength(0);
  });

  it("does not crash when individual fields are undefined", async () => {
    const doc = makeDoc(applicantHtml);
    const profile: ApplicantProfile = {
      personal: {
        familyName: undefined,
        givenNames: undefined,
        dateOfBirth: undefined,
      },
    };
    const report = await fillAll(profile, true, applicantDetailsMap, doc);
    expect(report).toBeDefined();
    expect(report.filled).toHaveLength(0);
  });

  it("skips null values without crashing", async () => {
    const doc = makeDoc(applicantHtml);
    // Cast to allow null for testing purposes
    const profile = {
      personal: {
        familyName: null,
        givenNames: null,
        dateOfBirth: null,
      },
    } as unknown as ApplicantProfile;
    const report = await fillAll(profile, true, applicantDetailsMap, doc);
    expect(report).toBeDefined();
    expect(report.filled).toHaveLength(0);
    expect(report.failed).toHaveLength(0);
  });
});

// ─── Unrecognized country ─────────────────────────────────────────────────────

describe("badData – unrecognized country", () => {
  it("adds to failed when country cannot be resolved", async () => {
    const doc = makeDoc(passportHtml);
    const profile: ApplicantProfile = {
      passport: {
        number: "PA123456",
        dateOfIssue: "2020-01-01",
        dateOfExpiry: "2030-01-01",
        country: "ZZZZZZ", // not a valid country
      },
    };
    const report = await fillAll(profile, true, passportDetailsMap, doc);
    expect(report.failed.some((f) => f.field === "passport.country")).toBe(true);
    const failedCountry = report.failed.find((f) => f.field === "passport.country");
    expect(failedCountry?.reason).toMatch(/country/i);
  });

  it("still fills other fields even when country fails", async () => {
    const doc = makeDoc(passportHtml);
    const profile: ApplicantProfile = {
      passport: {
        number: "PA123456",
        dateOfIssue: "2020-01-01",
        dateOfExpiry: "2030-01-01",
        country: "ZZZZZZ",
      },
    };
    const report = await fillAll(profile, true, passportDetailsMap, doc);
    expect(report.filled).toContain("passport.number");
    expect(report.filled).toContain("passport.dateOfIssue");
    expect(report.filled).toContain("passport.dateOfExpiry");
  });
});

// ─── Non-AU state ─────────────────────────────────────────────────────────────

describe("badData – non-AU state", () => {
  it("skips (isEmptyValue) when state is empty", async () => {
    const doc = makeDoc(applicantHtml);
    const profile: ApplicantProfile = {
      address: { state: "" },
    };
    const report = await fillAll(profile, true, applicantDetailsMap, doc);
    // state field is not in applicantDetailsMap, so nothing to fill
    expect(report.filled).toHaveLength(0);
  });
});

// ─── Junk values ──────────────────────────────────────────────────────────────

describe("badData – junk values", () => {
  it("does not crash with an object in a string field", async () => {
    const doc = makeDoc(applicantHtml);
    // Force a weird value via casting
    const profile = {
      personal: {
        familyName: { nested: "object" },
      },
    } as unknown as ApplicantProfile;
    await expect(
      fillAll(profile, true, applicantDetailsMap, doc)
    ).resolves.toBeDefined();
  });

  it("does not crash with undefined at profile level", async () => {
    const doc = makeDoc(applicantHtml);
    const profile = undefined as unknown as ApplicantProfile;
    // This should not throw
    await expect(
      fillAll(profile, true, applicantDetailsMap, doc)
    ).resolves.toBeDefined();
  });

  it("does not crash with array in profile field", async () => {
    const doc = makeDoc(applicantHtml);
    const profile = {
      personal: ["not", "an", "object"],
    } as unknown as ApplicantProfile;
    await expect(
      fillAll(profile, true, applicantDetailsMap, doc)
    ).resolves.toBeDefined();
  });

  it("does not crash with a number in string field position", async () => {
    const doc = makeDoc(applicantHtml);
    const profile = {
      personal: {
        familyName: 12345,
      },
    } as unknown as ApplicantProfile;
    const report = await fillAll(profile, true, applicantDetailsMap, doc);
    // Should have attempted to fill (12345 is not empty by isEmptyValue)
    // but convert to string "12345"
    expect(report).toBeDefined();
  });

  it("does not crash when phone is an invalid string", async () => {
    const doc = makeDoc(contactHtml);
    const profile: ApplicantProfile = {
      contact: {
        email: "test@example.com",
        mobile: "not-a-phone-number",
      },
    };
    const report = await fillAll(profile, true, contactDetailsMap, doc);
    // phone transform should fail gracefully
    expect(report.failed.some((f) => f.field === "contact.mobile")).toBe(true);
    // email should still fill
    expect(report.filled).toContain("contact.email");
  });
});
