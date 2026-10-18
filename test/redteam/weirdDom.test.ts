import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { fillAll } from "@/filler/engine";
import { applicantDetailsMap } from "@/field-maps/applicantDetails";
import { resolveElement } from "@/filler/locators";
import type { ApplicantProfile } from "@/shared/types/applicantProfile";

const testProfile: ApplicantProfile = {
  personal: {
    familyName: "Smith",
    givenNames: "John",
    dateOfBirth: "1990-06-15",
  },
};

function makeDoc(html: string): Document {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body>${html}</body></html>`,
    { url: "https://online.immi.gov.au/test" }
  );
  return dom.window.document;
}

// ─── Missing labels ───────────────────────────────────────────────────────────

describe("weirdDom – missing labels", () => {
  it("adds to notFound when label is completely absent", async () => {
    // No labels at all — just raw inputs with no labels
    const doc = makeDoc(`
      <input type="text" id="someInput" name="someInput" />
    `);
    const report = await fillAll(testProfile, true, applicantDetailsMap, doc);
    // All three fields should be notFound
    expect(report.notFound).toContain("personal.familyName");
    expect(report.notFound).toContain("personal.givenNames");
    // date of birth might also be notFound
    expect(report.filled).toHaveLength(0);
  });

  it("does not crash when document has no form elements", async () => {
    const doc = makeDoc("<p>No form here</p>");
    const report = await fillAll(testProfile, true, applicantDetailsMap, doc);
    expect(report.notFound.length).toBeGreaterThan(0);
    expect(report.filled).toHaveLength(0);
  });

  it("fills fields that do have labels and marks others as notFound", async () => {
    // Only provide a label for familyName
    const doc = makeDoc(`
      <label for="familyName">Family name</label>
      <input type="text" id="familyName" name="familyName" />
    `);
    const report = await fillAll(testProfile, true, applicantDetailsMap, doc);
    expect(report.filled).toContain("personal.familyName");
    expect(report.notFound).toContain("personal.givenNames");
  });
});

// ─── Duplicate IDs ────────────────────────────────────────────────────────────

describe("weirdDom – duplicate IDs", () => {
  it("resolves via label text even when multiple elements share an id", async () => {
    // Duplicate IDs are invalid HTML but resolveElement uses label text
    const doc = makeDoc(`
      <label for="dupId">Family name</label>
      <input type="text" id="dupId" name="familyName" />
      <label for="dupId">Other label</label>
      <input type="text" id="dupId" name="other" />
    `);
    // resolveElement should find the first input that the "Family name" label points to
    const el = resolveElement({ type: "label", value: "Family name" }, doc);
    expect(el).not.toBeNull();
    expect(el?.getAttribute("name")).toBe("familyName");
  });

  it("fillAll succeeds on first matching label despite duplicate IDs", async () => {
    const doc = makeDoc(`
      <label for="dupId">Family name</label>
      <input type="text" id="dupId" name="familyName" />
      <label for="dupId">Other label</label>
      <input type="text" id="dupId" name="other" />
      <label>Given names<input type="text" name="givenNames" /></label>
      <label for="dob">Date of birth</label>
      <input type="date" id="dob" name="dateOfBirth" />
    `);
    const report = await fillAll(testProfile, true, applicantDetailsMap, doc);
    expect(report.filled).toContain("personal.familyName");
  });
});

// ─── Dynamic re-render ────────────────────────────────────────────────────────

describe("weirdDom – dynamic re-render", () => {
  it("settle resolves even when elements are removed and re-added", async () => {
    const doc = makeDoc(`
      <label for="familyName">Family name</label>
      <input type="text" id="familyName" name="familyName" />
      <label>Given names<input type="text" name="givenNames" /></label>
      <label for="dob">Date of birth</label>
      <input type="date" id="dob" name="dateOfBirth" />
    `);

    // Simulate a dynamic re-render by removing and re-adding an element
    const input = doc.getElementById("familyName");
    const parent = input?.parentElement;

    // Start fillAll — it will fill familyName and then wait for settle
    const fillPromise = fillAll(testProfile, true, applicantDetailsMap, doc);

    // Simulate DOM churn during settle window
    if (parent && input) {
      setTimeout(() => {
        parent.removeChild(input);
        setTimeout(() => {
          parent.appendChild(input);
        }, 10);
      }, 50);
    }

    const report = await fillPromise;
    // At minimum we should have tried to fill
    expect(report).toBeDefined();
    expect(typeof report.filled).toBe("object");
  });

  it("report is returned even if DOM keeps mutating (hard timeout fires)", async () => {
    // This test verifies the hard timeout in waitForSettle resolves without rejection
    const doc = makeDoc(`
      <label for="familyName">Family name</label>
      <input type="text" id="familyName" name="familyName" />
      <label>Given names<input type="text" name="givenNames" /></label>
      <label for="dob">Date of birth</label>
      <input type="date" id="dob" name="dateOfBirth" />
    `);

    // Create continuous DOM mutations
    let running = true;
    const div = doc.createElement("div");
    doc.body.appendChild(div);
    const mutate = () => {
      if (!running) return;
      div.textContent = Math.random().toString();
      setTimeout(mutate, 10);
    };
    mutate();

    const report = await fillAll(testProfile, true, applicantDetailsMap, doc);
    running = false;

    // Should still return a valid report (hard timeout fired)
    expect(report).toBeDefined();
    expect(Array.isArray(report.filled)).toBe(true);
  }, 10000);
});

// ─── Deeply nested structure ──────────────────────────────────────────────────

describe("weirdDom – deeply nested labels", () => {
  it("resolves a label inside nested divs", async () => {
    const doc = makeDoc(`
      <div class="section">
        <div class="row">
          <div class="col">
            <label for="familyName">Family name</label>
          </div>
          <div class="col">
            <input type="text" id="familyName" name="familyName" />
          </div>
        </div>
      </div>
    `);
    const el = resolveElement({ type: "label", value: "Family name" }, doc);
    expect(el).not.toBeNull();
    expect(el instanceof doc.defaultView!.HTMLInputElement).toBe(true);
  });
});
