import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { clickToFill } from "@/filler/engine";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTextInput(doc: Document, value = ""): HTMLInputElement {
  const input = doc.createElement("input");
  input.type = "text";
  input.value = value;
  doc.body.appendChild(input);
  return input;
}

function makeSelectInput(
  doc: Document,
  options: string[]
): HTMLSelectElement {
  const select = doc.createElement("select");
  for (const opt of options) {
    const o = doc.createElement("option");
    o.value = opt;
    o.textContent = opt;
    select.appendChild(o);
  }
  doc.body.appendChild(select);
  return select;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("clickToFill – with focused element", () => {
  let dom: JSDOM;
  let doc: Document;

  beforeEach(() => {
    dom = new JSDOM("<!DOCTYPE html><body></body>", {
      url: "https://online.immi.gov.au/test",
    });
    doc = dom.window.document;
  });

  it("fills a text input directly when focusedEl is provided", async () => {
    const input = makeTextInput(doc);
    const report = await clickToFill(
      "personal.familyName",
      "Smith",
      input,
      "text"
    );
    expect(report.filled).toContain("personal.familyName");
    expect(input.value).toBe("Smith");
  });

  it("returns filled report on success", async () => {
    const input = makeTextInput(doc);
    const report = await clickToFill("contact.email", "a@b.com", input, "text");
    expect(report.filled).toHaveLength(1);
    expect(report.failed).toHaveLength(0);
    expect(report.skipped).toHaveLength(0);
    expect(report.notFound).toHaveLength(0);
  });

  it("fills a select input with matching option text", async () => {
    const select = makeSelectInput(doc, ["", "Australia", "India", "Nepal"]);
    const report = await clickToFill(
      "passport.country",
      "Australia",
      select,
      "select"
    );
    expect(report.filled).toContain("passport.country");
    expect(select.value).toBe("Australia");
  });

  it("highlights the element green after fill", async () => {
    const input = makeTextInput(doc);
    await clickToFill("personal.givenNames", "John", input, "text");
    expect(input.classList.contains("immifill-filled")).toBe(true);
  });
});

describe("clickToFill – no focused element (pick mode)", () => {
  it("returns a report with failure when focusedEl is null", async () => {
    const report = await clickToFill(
      "personal.familyName",
      "Smith",
      null,
      "text"
    );
    expect(report.filled).toHaveLength(0);
    expect(report.failed.length).toBeGreaterThan(0);
  });

  it("fail reason mentions pick mode or no focused element", async () => {
    const report = await clickToFill("personal.familyName", "Smith", null);
    const reason = report.failed[0]?.reason ?? "";
    expect(reason.toLowerCase()).toMatch(/pick|focus/);
  });
});

describe("clickToFill – events are dispatched", () => {
  let dom: JSDOM;
  let doc: Document;

  beforeEach(() => {
    dom = new JSDOM("<!DOCTYPE html><body></body>", {
      url: "https://online.immi.gov.au/test",
    });
    doc = dom.window.document;
  });

  it("dispatches input and change events on fill", async () => {
    const input = makeTextInput(doc);
    const events: string[] = [];
    input.addEventListener("input", () => events.push("input"));
    input.addEventListener("change", () => events.push("change"));

    await clickToFill("personal.familyName", "Test", input, "text");

    expect(events).toContain("input");
    expect(events).toContain("change");
  });
});

describe("clickToFill – pick mode simulation", () => {
  it("pick mode cancel via Escape does not fill", () => {
    // This tests the logic path: if no focusedEl, enter pick mode
    // Escape cancels without fill — we verify that by checking report has no filled
    // The actual pick mode is in content.ts (browser context), so we test
    // the engine function directly for the null-focusedEl path
    const reportPromise = clickToFill("personal.familyName", "Smith", null);
    return reportPromise.then((report) => {
      expect(report.filled).toHaveLength(0);
    });
  });
});
