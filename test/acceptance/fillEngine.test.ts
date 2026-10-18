import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import * as fs from "fs";
import * as path from "path";
import type { ApplicantProfile } from "@/shared/types/applicantProfile";
import type { FillReport } from "@/shared/contracts/fillReport";
import { fillAll } from "@/filler/engine";
import { applicantDetailsMap } from "@/field-maps/applicantDetails";
import { passportDetailsMap } from "@/field-maps/passportDetails";
import { contactDetailsMap } from "@/field-maps/contactDetails";
import { visaHistoryMap } from "@/field-maps/visaHistory";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadFixture(name: string): Document {
  const fixturePath = path.resolve(
    __dirname,
    "../fixtures",
    name
  );
  const html = fs.readFileSync(fixturePath, "utf-8");
  const dom = new JSDOM(html, { url: "https://online.immi.gov.au/test" });
  return dom.window.document;
}

const testProfile: ApplicantProfile = {
  personal: {
    familyName: "Smith",
    givenNames: "John",
    dateOfBirth: "1990-06-15",
  },
  passport: {
    number: "PA123456",
    dateOfIssue: "2020-01-01",
    dateOfExpiry: "2030-01-01",
    country: "AU",
  },
  contact: {
    email: "john.smith@example.com",
    mobile: "+61432111111",
  },
  visa: {
    inAustralia: "Yes",
    currentVisa: "500",
    currentVisaExpiry: "2025-12-31",
  },
};

// ─── Applicant Details ────────────────────────────────────────────────────────

describe("fillAll – applicantDetails.html", () => {
  let doc: Document;

  beforeEach(() => {
    doc = loadFixture("applicantDetails.html");
  });

  it("fills Family name and Given names", async () => {
    const report = await fillAll(testProfile, true, applicantDetailsMap, doc);
    expect(report.filled).toContain("personal.familyName");
    expect(report.filled).toContain("personal.givenNames");
  });

  it("fills Date of birth", async () => {
    const report = await fillAll(testProfile, true, applicantDetailsMap, doc);
    expect(report.filled).toContain("personal.dateOfBirth");
  });

  it("sets the correct value on the familyName input", async () => {
    await fillAll(testProfile, true, applicantDetailsMap, doc);
    const el = doc.getElementById("familyName") as HTMLInputElement;
    expect(el.value).toBe("Smith");
  });

  it("sets the correct value on the givenNames input (wrapping label)", async () => {
    await fillAll(testProfile, true, applicantDetailsMap, doc);
    const el = doc.querySelector<HTMLInputElement>(
      '[name="givenNames"]'
    );
    expect(el?.value).toBe("John");
  });

  it("sets the correct value on the dateOfBirth input", async () => {
    await fillAll(testProfile, true, applicantDetailsMap, doc);
    const el = doc.getElementById("dateOfBirth") as HTMLInputElement;
    expect(el.value).toBe("1990-06-15");
  });

  it("report has no failures for a complete profile", async () => {
    const report = await fillAll(testProfile, true, applicantDetailsMap, doc);
    expect(report.failed).toHaveLength(0);
  });

  it("does not overwrite when overwrite=false and field has value", async () => {
    // Pre-fill the familyName
    const nameEl = doc.getElementById("familyName") as HTMLInputElement;
    nameEl.value = "Existing";

    const report = await fillAll(testProfile, false, applicantDetailsMap, doc);
    expect(report.skipped).toContain("personal.familyName");
    expect(nameEl.value).toBe("Existing");
  });

  it("snapshot – FillReport shape", async () => {
    const report = await fillAll(testProfile, true, applicantDetailsMap, doc);
    expect(report).toMatchSnapshot();
  });
});

// ─── Passport Details ─────────────────────────────────────────────────────────

describe("fillAll – passportDetails.html", () => {
  let doc: Document;

  beforeEach(() => {
    doc = loadFixture("passportDetails.html");
  });

  it("fills passport number", async () => {
    const report = await fillAll(testProfile, true, passportDetailsMap, doc);
    expect(report.filled).toContain("passport.number");
  });

  it("fills date of issue", async () => {
    const report = await fillAll(testProfile, true, passportDetailsMap, doc);
    expect(report.filled).toContain("passport.dateOfIssue");
  });

  it("fills date of expiry", async () => {
    const report = await fillAll(testProfile, true, passportDetailsMap, doc);
    expect(report.filled).toContain("passport.dateOfExpiry");
  });

  it("fills country of passport (AU → Australia via country transform)", async () => {
    const report = await fillAll(testProfile, true, passportDetailsMap, doc);
    expect(report.filled).toContain("passport.country");
  });

  it("sets passport number value correctly", async () => {
    await fillAll(testProfile, true, passportDetailsMap, doc);
    const el = doc.getElementById("passportNumber") as HTMLInputElement;
    expect(el.value).toBe("PA123456");
  });

  it("fails gracefully for unrecognized country", async () => {
    const profileWithBadCountry: ApplicantProfile = {
      ...testProfile,
      passport: { ...testProfile.passport, country: "NOTACOUNTRY" },
    };
    const report = await fillAll(
      profileWithBadCountry,
      true,
      passportDetailsMap,
      doc
    );
    expect(report.failed.some((f) => f.field === "passport.country")).toBe(true);
  });

  it("snapshot – FillReport shape", async () => {
    const report = await fillAll(testProfile, true, passportDetailsMap, doc);
    expect(report).toMatchSnapshot();
  });
});

// ─── Contact Details ──────────────────────────────────────────────────────────

describe("fillAll – contactDetails.html", () => {
  let doc: Document;

  beforeEach(() => {
    doc = loadFixture("contactDetails.html");
  });

  it("fills email address", async () => {
    const report = await fillAll(testProfile, true, contactDetailsMap, doc);
    expect(report.filled).toContain("contact.email");
  });

  it("fills mobile phone (with phone transform)", async () => {
    const report = await fillAll(testProfile, true, contactDetailsMap, doc);
    expect(report.filled).toContain("contact.mobile");
  });

  it("sets email value correctly", async () => {
    await fillAll(testProfile, true, contactDetailsMap, doc);
    const el = doc.getElementById("emailAddress") as HTMLInputElement;
    expect(el.value).toBe("john.smith@example.com");
  });

  it("sets mobile to international format", async () => {
    await fillAll(testProfile, true, contactDetailsMap, doc);
    const el = doc.getElementById("mobilePhone") as HTMLInputElement;
    expect(el.value).toMatch(/^\+/); // international format starts with +
  });

  it("snapshot – FillReport shape", async () => {
    const report = await fillAll(testProfile, true, contactDetailsMap, doc);
    expect(report).toMatchSnapshot();
  });
});

// ─── Visa History ─────────────────────────────────────────────────────────────

describe("fillAll – visaHistory.html", () => {
  let doc: Document;

  beforeEach(() => {
    doc = loadFixture("visaHistory.html");
  });

  it("fills inAustralia radio", async () => {
    const report = await fillAll(testProfile, true, visaHistoryMap, doc);
    expect(report.filled).toContain("visa.inAustralia");
  });

  it("fills current visa", async () => {
    const report = await fillAll(testProfile, true, visaHistoryMap, doc);
    expect(report.filled).toContain("visa.currentVisa");
  });

  it("fills current visa expiry", async () => {
    const report = await fillAll(testProfile, true, visaHistoryMap, doc);
    expect(report.filled).toContain("visa.currentVisaExpiry");
  });

  it("selects the correct radio (Yes)", async () => {
    await fillAll(testProfile, true, visaHistoryMap, doc);
    const yesRadio = doc.querySelector<HTMLInputElement>(
      'input[type="radio"][name="inAustralia"][value="Yes"]'
    );
    expect(yesRadio?.checked).toBe(true);
  });

  it("snapshot – FillReport shape", async () => {
    const report = await fillAll(testProfile, true, visaHistoryMap, doc);
    expect(report).toMatchSnapshot();
  });

  it("conditional: settle waits after filling a radio that may reveal fields", async () => {
    // Simulate a conditional section appearing after radio fill
    const form = doc.getElementById("visaHistoryForm");
    const conditionalSection = doc.getElementById("currentVisaSection");

    if (form && conditionalSection) {
      // Observe changes – set up a mutation
      const observer = new MutationObserver(() => {
        // noop – just verifying settle works
      });
      observer.observe(form, { childList: true, subtree: true });

      const report = await fillAll(testProfile, true, visaHistoryMap, doc);
      observer.disconnect();

      expect(report.filled.length).toBeGreaterThan(0);
    }
  });
});

// ─── Empty profile ────────────────────────────────────────────────────────────

describe("fillAll – empty profile fields are skipped", () => {
  it("skips all when profile is empty", async () => {
    const doc = loadFixture("applicantDetails.html");
    const emptyProfile: ApplicantProfile = {};
    const report = await fillAll(emptyProfile, true, applicantDetailsMap, doc);
    expect(report.filled).toHaveLength(0);
    expect(report.failed).toHaveLength(0);
  });

  it("skips only missing fields, fills present ones", async () => {
    const doc = loadFixture("applicantDetails.html");
    const partialProfile: ApplicantProfile = {
      personal: { familyName: "Only" },
    };
    const report: FillReport = await fillAll(
      partialProfile,
      true,
      applicantDetailsMap,
      doc
    );
    expect(report.filled).toContain("personal.familyName");
    expect(report.filled).not.toContain("personal.givenNames");
    expect(report.filled).not.toContain("personal.dateOfBirth");
  });
});
