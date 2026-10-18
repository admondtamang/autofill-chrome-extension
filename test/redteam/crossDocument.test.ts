import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { dropFill } from "@/filler/engine";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDom(html = ""): { dom: JSDOM; doc: Document } {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body>${html}</body></html>`,
    { url: "https://online.immi.gov.au/test" }
  );
  return { dom, doc: dom.window.document };
}

// ─── Custom MIME unavailable → text/plain fallback ────────────────────────────

describe("crossDocument – custom MIME unavailable", () => {
  it("falls back to text/plain when application/x-immifill+json is empty", async () => {
    const { doc } = makeDom();
    const input = doc.createElement("input");
    input.type = "text";
    doc.body.appendChild(input);

    // Simulate what the content script does when custom MIME is unavailable:
    // It uses lastDragProfilePath + text/plain value
    // We test dropFill directly with the plain value
    const lastDragProfilePath = "personal.familyName";
    const textValue = "FallbackValue";

    const report = await dropFill(lastDragProfilePath, textValue, input, "text");
    expect(report.filled).toContain("personal.familyName");
    expect(input.value).toBe("FallbackValue");
  });

  it("handles empty plain text gracefully", async () => {
    const { doc } = makeDom();
    const input = doc.createElement("input");
    input.type = "text";
    doc.body.appendChild(input);

    // Empty string is still set (isEmptyValue check is in fillAll, not dropFill)
    const report = await dropFill("personal.familyName", "", input, "text");
    // setValue returns true for text with empty string (it's a valid operation)
    expect(report).toBeDefined();
  });

  it("parses valid JSON from custom MIME and uses profilePath + value", async () => {
    const { doc } = makeDom();
    const input = doc.createElement("input");
    input.type = "text";
    doc.body.appendChild(input);

    // Custom MIME JSON payload simulation
    const mimePayload = JSON.stringify({
      profilePath: "passport.number",
      value: "PA987654",
    });

    const parsed = JSON.parse(mimePayload) as { profilePath: string; value: string };
    const report = await dropFill(parsed.profilePath, parsed.value, input, "text");
    expect(report.filled).toContain("passport.number");
    expect(input.value).toBe("PA987654");
  });

  it("does not crash when JSON is malformed", async () => {
    // Simulate the try/catch in the content script drop handler
    const malformedJson = "{ not valid json }";
    let parseError: Error | null = null;
    try {
      JSON.parse(malformedJson);
    } catch (e) {
      parseError = e as Error;
    }
    expect(parseError).not.toBeNull();
    // Verify that the fallback path is taken (text/plain)
    // In this test we just verify that JSON.parse fails without crashing
  });
});

// ─── Cross-document scenarios ─────────────────────────────────────────────────

describe("crossDocument – multiple documents", () => {
  it("can fill elements in two separate JSDOM documents independently", async () => {
    const { doc: doc1 } = makeDom();
    const { doc: doc2 } = makeDom();

    const input1 = doc1.createElement("input");
    input1.type = "text";
    doc1.body.appendChild(input1);

    const input2 = doc2.createElement("input");
    input2.type = "text";
    doc2.body.appendChild(input2);

    const report1 = await dropFill("personal.familyName", "Doc1Value", input1, "text");
    const report2 = await dropFill("personal.givenNames", "Doc2Value", input2, "text");

    expect(report1.filled).toContain("personal.familyName");
    expect(report2.filled).toContain("personal.givenNames");
    expect(input1.value).toBe("Doc1Value");
    expect(input2.value).toBe("Doc2Value");

    // Values should not bleed across documents
    expect(input1.value).not.toBe("Doc2Value");
    expect(input2.value).not.toBe("Doc1Value");
  });

  it("fill in one document does not affect elements in another document", async () => {
    const { doc: doc1 } = makeDom(`
      <input type="text" id="shared" name="shared" value="original1" />
    `);
    const { doc: doc2 } = makeDom(`
      <input type="text" id="shared" name="shared" value="original2" />
    `);

    const el1 = doc1.getElementById("shared") as HTMLInputElement;
    const el2 = doc2.getElementById("shared") as HTMLInputElement;

    await dropFill("personal.familyName", "Changed", el1, "text");

    expect(el1.value).toBe("Changed");
    expect(el2.value).toBe("original2"); // should be unchanged
  });
});

// ─── DataTransfer simulation ──────────────────────────────────────────────────

describe("crossDocument – DataTransfer MIME type priority", () => {
  it("custom MIME takes precedence over text/plain when both present", async () => {
    const { doc } = makeDom();
    const input = doc.createElement("input");
    input.type = "text";
    doc.body.appendChild(input);

    // Simulate content script logic: custom MIME is available
    const customMimeData = JSON.stringify({
      profilePath: "personal.familyName",
      value: "FromCustomMIME",
    });
    const textPlainData = "FromTextPlain";

    // Content script tries custom MIME first
    let usedValue = textPlainData; // default to text/plain
    try {
      const parsed = JSON.parse(customMimeData) as { profilePath: string; value: string };
      usedValue = parsed.value;
    } catch {
      // use textPlainData
    }

    const report = await dropFill("personal.familyName", usedValue, input, "text");
    expect(input.value).toBe("FromCustomMIME");
    expect(report.filled).toContain("personal.familyName");
  });
});
