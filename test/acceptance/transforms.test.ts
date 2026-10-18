import { describe, it, expect } from "vitest";
import { transformDate } from "@/transforms/date";
import { transformCountry } from "@/transforms/country";
import { transformPhone } from "@/transforms/phone";
import { transformState } from "@/transforms/state";
import { transformNotes } from "@/transforms/notes";
import { isEmptyValue } from "@/transforms/empty";

// ---------------------------------------------------------------------------
// isEmptyValue
// ---------------------------------------------------------------------------
describe("isEmptyValue", () => {
  it("returns true for null", () => expect(isEmptyValue(null)).toBe(true));
  it("returns true for undefined", () => expect(isEmptyValue(undefined)).toBe(true));
  it('returns true for ""', () => expect(isEmptyValue("")).toBe(true));
  it('returns true for whitespace-only string', () => expect(isEmptyValue("   ")).toBe(true));
  it('returns false for "x"', () => expect(isEmptyValue("x")).toBe(false));
  it("returns false for 0", () => expect(isEmptyValue(0)).toBe(false));
  it("returns false for false", () => expect(isEmptyValue(false)).toBe(false));
});

// ---------------------------------------------------------------------------
// transformDate
// ---------------------------------------------------------------------------
describe("transformDate", () => {
  it("converts ISO timestamp to date in Asia/Kathmandu (+05:45)", () => {
    const result = transformDate("2026-09-16T18:15:00.000Z", "Asia/Kathmandu");
    expect(result).toEqual({ value: "2026-09-17", verify: true });
  });

  it("returns date-only string unchanged (no timezone shift)", () => {
    const dateOnly = "2026-09-16";
    // Even with a negative-offset timezone the date must not change
    const result = transformDate(dateOnly, "America/New_York");
    expect(result).toBe("2026-09-16");
  });

  it("returns undefined for null", () => {
    expect(transformDate(null)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(transformDate("")).toBeUndefined();
  });

  it("returns undefined for whitespace-only string", () => {
    expect(transformDate("   ")).toBeUndefined();
  });

  it("returns plain string for date-only input", () => {
    expect(transformDate("2026-01-15")).toBe("2026-01-15");
  });
});

// ---------------------------------------------------------------------------
// transformCountry
// ---------------------------------------------------------------------------
describe("transformCountry", () => {
  it('"NPL" resolves to a country name (not null)', () => {
    const result = transformCountry("NPL");
    expect(result).not.toBeNull();
    expect(typeof result).toBe("string");
  });

  it('"Charity" cannot be resolved → null', () => {
    expect(transformCountry("Charity")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(transformCountry(null)).toBeNull();
  });

  it("resolves ISO alpha-2 code", () => {
    const result = transformCountry("AU");
    expect(result).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// transformPhone
// ---------------------------------------------------------------------------
describe("transformPhone", () => {
  it('E.164 "+61432111111" parses to international format', () => {
    const result = transformPhone("+61432111111");
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("international");
    expect(typeof (result as { international: string }).international).toBe("string");
  });

  it("returns null for null input", () => {
    expect(transformPhone(null)).toBeNull();
  });

  it("returns null for unparseable value", () => {
    expect(transformPhone("not-a-phone")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// transformState
// ---------------------------------------------------------------------------
describe("transformState", () => {
  it('"Phillip" is not a valid AU state → null', () => {
    expect(transformState("Phillip")).toBeNull();
  });

  it('"NSW" → "NSW"', () => {
    expect(transformState("NSW")).toBe("NSW");
  });

  it('"New South Wales" → "NSW"', () => {
    expect(transformState("New South Wales")).toBe("NSW");
  });

  it("case-insensitive code match", () => {
    expect(transformState("nsw")).toBe("NSW");
    expect(transformState("vic")).toBe("VIC");
  });

  it("returns null for null input", () => {
    expect(transformState(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// transformNotes
// ---------------------------------------------------------------------------
describe("transformNotes", () => {
  it('"<p>notes added!</p>" → "notes added!"', () => {
    expect(transformNotes("<p>notes added!</p>")).toBe("notes added!");
  });

  it('"<p>evfc</p>" → "evfc"', () => {
    expect(transformNotes("<p>evfc</p>")).toBe("evfc");
  });

  it("strips nested tags and collapses whitespace", () => {
    const result = transformNotes("<p>hello  <b>world</b></p>");
    // Multiple spaces between text nodes are collapsed to one
    expect(result).toBe("hello world");
  });

  it("returns undefined for null", () => {
    expect(transformNotes(null)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(transformNotes("")).toBeUndefined();
  });
});
