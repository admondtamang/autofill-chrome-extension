import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { dropFill } from "@/filler/engine";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDom(): { dom: JSDOM; doc: Document } {
  const dom = new JSDOM("<!DOCTYPE html><body></body>", {
    url: "https://online.immi.gov.au/test",
  });
  return { dom, doc: dom.window.document };
}

function makeTextInput(doc: Document): HTMLInputElement {
  const input = doc.createElement("input");
  input.type = "text";
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

function makeRadioGroup(
  doc: Document,
  name: string,
  values: string[]
): HTMLInputElement[] {
  const radios: HTMLInputElement[] = [];
  for (const v of values) {
    const r = doc.createElement("input");
    r.type = "radio";
    r.name = name;
    r.value = v;
    doc.body.appendChild(r);
    radios.push(r);
  }
  return radios;
}

function makeDateInput(doc: Document): HTMLInputElement {
  const input = doc.createElement("input");
  input.type = "date";
  doc.body.appendChild(input);
  return input;
}

// ─── dropFill on various control types ───────────────────────────────────────

describe("dropFill – text input", () => {
  it("fills a text input on drop", async () => {
    const { doc } = makeDom();
    const input = makeTextInput(doc);
    const report = await dropFill("personal.familyName", "Nguyen", input, "text");
    expect(report.filled).toContain("personal.familyName");
    expect(input.value).toBe("Nguyen");
  });

  it("highlights element after successful drop", async () => {
    const { doc } = makeDom();
    const input = makeTextInput(doc);
    await dropFill("personal.familyName", "Test", input, "text");
    expect(input.classList.contains("immifill-filled")).toBe(true);
  });

  it("dispatches input event after drop", async () => {
    const { doc } = makeDom();
    const input = makeTextInput(doc);
    const events: string[] = [];
    input.addEventListener("input", () => events.push("input"));
    await dropFill("personal.familyName", "Test", input, "text");
    expect(events).toContain("input");
  });
});

describe("dropFill – select input", () => {
  it("fills a select by option text", async () => {
    const { doc } = makeDom();
    const select = makeSelectInput(doc, ["", "Australia", "India", "Nepal"]);
    const report = await dropFill(
      "passport.country",
      "Australia",
      select,
      "select"
    );
    expect(report.filled).toContain("passport.country");
    expect(select.value).toBe("Australia");
  });

  it("returns failed report when option not found", async () => {
    const { doc } = makeDom();
    const select = makeSelectInput(doc, ["", "Australia", "India"]);
    const report = await dropFill(
      "passport.country",
      "NotACountry",
      select,
      "select"
    );
    expect(report.filled).toHaveLength(0);
    expect(report.failed.length).toBeGreaterThan(0);
  });
});

describe("dropFill – radio input", () => {
  it("checks the correct radio on drop", async () => {
    const { doc } = makeDom();
    const radios = makeRadioGroup(doc, "inAustralia", ["Yes", "No"]);
    const report = await dropFill(
      "visa.inAustralia",
      "Yes",
      radios[0]!,
      "radio"
    );
    expect(report.filled).toContain("visa.inAustralia");
    const yesRadio = radios.find((r) => r.value === "Yes");
    expect(yesRadio?.checked).toBe(true);
  });

  it("returns failed when radio value not found", async () => {
    const { doc } = makeDom();
    const radios = makeRadioGroup(doc, "test", ["Yes", "No"]);
    const report = await dropFill("test.field", "Maybe", radios[0]!, "radio");
    expect(report.failed.length).toBeGreaterThan(0);
  });
});

describe("dropFill – date input", () => {
  it("fills a date input with YYYY-MM-DD value", async () => {
    const { doc } = makeDom();
    const input = makeDateInput(doc);
    const report = await dropFill(
      "passport.dateOfExpiry",
      "2030-01-01",
      input,
      "date"
    );
    expect(report.filled).toContain("passport.dateOfExpiry");
    expect(input.value).toBe("2030-01-01");
  });
});

// ─── application/x-immifill+json MIME ────────────────────────────────────────

describe("dropFill – custom MIME payload", () => {
  it("parses application/x-immifill+json payload correctly", async () => {
    const { doc } = makeDom();
    const input = makeTextInput(doc);

    // Simulate what the content script does with custom MIME
    const payload = JSON.parse(
      JSON.stringify({ profilePath: "personal.familyName", value: "Chan" })
    ) as { profilePath: string; value: string };

    const report = await dropFill(
      payload.profilePath,
      payload.value,
      input,
      "text"
    );
    expect(report.filled).toContain("personal.familyName");
    expect(input.value).toBe("Chan");
  });
});

// ─── text/plain fallback ──────────────────────────────────────────────────────

describe("dropFill – text/plain fallback", () => {
  it("fills with plain text value when given directly", async () => {
    const { doc } = makeDom();
    const input = makeTextInput(doc);
    // Simulate text/plain fallback: dropFill is called with the plain text
    const report = await dropFill("personal.familyName", "PlainValue", input, "text");
    expect(report.filled).toContain("personal.familyName");
    expect(input.value).toBe("PlainValue");
  });
});
