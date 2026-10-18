/**
 * Visual fill demo for sample.html (new version with radio + combos).
 * Run: npx tsx scripts/test-fill.ts
 */
import { chromium, type Page } from "playwright";

const FILE = "file:///Users/admondtamang/Downloads/files/sample.html";
const SHOT = "/Users/admondtamang/Downloads/files/immifill-kickoff/demo-screenshots/sample-filled.png";

// ── Test data matching the applicant profile ──────────────────────────────────
type Field =
  | { kind: "text";   name: string; value: string; label: string }
  | { kind: "select"; name: string; value: string; label: string }
  | { kind: "radio";  name: string; value: string; label: string };

const TEST_FIELDS: Field[] = [
  // ── Text / date inputs ─────────────────────────────────────────────────────
  { kind: "text",   name: "_2a0b0a0a0e0a0a2a7b1a1a0", value: "Smith",        label: "Family name" },
  { kind: "text",   name: "_2a0b0a0a0e0a0a2a7b2a1a0", value: "John William", label: "Given names" },
  { kind: "text",   name: "_2a0b0a0a0e0a0a2a7d0b0",   value: "1990-05-15",   label: "Date of birth" },
  { kind: "text",   name: "_2a0b0a0a0e0a0a2a8b0b0",   value: "PA1234567",    label: "Passport number" },
  { kind: "text",   name: "_2a0b0a0a0e0a0a2a8e0b0",   value: "2020-01-10",   label: "Date of issue" },
  { kind: "text",   name: "_2a0b0a0a0e0a0a2a8f0b0",   value: "2030-01-10",   label: "Date of expiry" },
  { kind: "text",   name: "_2a0b0a0a0e0a0a2a10c0b0",  value: "Sydney",       label: "Town / City" },
  { kind: "text",   name: "_2a0b0a0a0e0a0a2a10d0b0",  value: "NSW",          label: "State / Province" },

  // ── Select / combobox ──────────────────────────────────────────────────────
  // _2a0b0a0a0e0a0a2a17d0b0a has 251 country options; Australia = value "13"
  { kind: "select", name: "_2a0b0a0a0e0a0a2a17d0b0a", value: "13",           label: "Country (Australia)" },

  // ── Radio groups ───────────────────────────────────────────────────────────
  { kind: "radio",  name: "_2a0b0a0a0e0a0a2a7c0b0",   value: "F",            label: "Sex" },
  // Yes/No radios (1=Yes, 2=No) — pick relevant ones
  { kind: "radio",  name: "_2a0b0a0a0e0a0a2a9c1b0a",  value: "2",            label: "Citizen of any country? (No)" },
  { kind: "radio",  name: "_2a0b0a0a0e0a0a2a11c1b0a", value: "2",            label: "Known by other names? (No)" },
];

// ── Fill one field in the page ────────────────────────────────────────────────
async function fillField(page: Page, f: Field): Promise<string> {
  const safe = f.value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  if (f.kind === "radio") {
    return page.evaluate(`
      (function() {
        var el = document.querySelector('input[type=radio][name="${f.name}"][value="${safe}"]');
        if (!el) return "not_found";
        el.scrollIntoView({ block: "center", behavior: "instant" });
        el.style.outline = "3px solid #f97316"; el.style.backgroundColor = "#fff7ed";
        el.click();
        el.style.outline = el.checked ? "3px solid #16a34a" : "3px solid #ef4444";
        el.style.backgroundColor = el.checked ? "#f0fdf4" : "#fef2f2";
        return el.checked ? "ok" : "rejected";
      })()
    `) as Promise<string>;
  }

  if (f.kind === "select") {
    return page.evaluate(`
      (function() {
        var el = document.querySelector('select[name="${f.name}"]');
        if (!el) return "not_found";
        el.scrollIntoView({ block: "center", behavior: "instant" });
        el.style.outline = "3px solid #f97316"; el.style.backgroundColor = "#fff7ed";
        el.value = '${safe}';
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new Event("blur",   { bubbles: true }));
        var ok = el.value === '${safe}';
        el.style.outline = ok ? "3px solid #16a34a" : "3px solid #ef4444";
        el.style.backgroundColor = ok ? "#f0fdf4" : "#fef2f2";
        return ok ? "ok" : ("rejected:" + el.value);
      })()
    `) as Promise<string>;
  }

  // text / date
  return page.evaluate(`
    (function() {
      var el = document.querySelector('[name="${f.name}"]');
      if (!el) return "not_found";
      el.scrollIntoView({ block: "center", behavior: "instant" });
      el.style.outline = "3px solid #f97316"; el.style.backgroundColor = "#fff7ed";
      var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value") && Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      if (setter) setter.call(el, '${safe}'); else el.value = '${safe}';
      el.dispatchEvent(new Event("input",  { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("blur",   { bubbles: true }));
      var ok = el.value === '${safe}';
      el.style.outline = ok ? "3px solid #16a34a" : "3px solid #ef4444";
      el.style.backgroundColor = ok ? "#f0fdf4" : "#fef2f2";
      return ok ? "ok" : ("rejected:" + el.value);
    })()
  `) as Promise<string>;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 80 });
  const page    = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  console.log("Opening sample.html…\n");
  await page.goto(FILE);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1000);

  const results = { ok: 0, notFound: 0, rejected: 0 };

  for (const f of TEST_FIELDS) {
    const res = await fillField(page, f);
    await page.waitForTimeout(450);

    if (res === "ok") {
      console.log(`  ✅ [${f.kind.padEnd(6)}] ${f.label}: "${f.value}"`);
      results.ok++;
    } else if (res === "not_found") {
      console.log(`  ❌ [${f.kind.padEnd(6)}] ${f.label}: NOT FOUND`);
      results.notFound++;
    } else {
      console.log(`  ⚠️  [${f.kind.padEnd(6)}] ${f.label}: ${res}`);
      results.rejected++;
    }
  }

  console.log(`\n━━━ Summary: ${results.ok} filled | ${results.notFound} not found | ${results.rejected} rejected ━━━`);

  // Screenshot of the names section
  await page.evaluate(`
    (function() {
      var el = document.querySelector('[name="_2a0b0a0a0e0a0a2a7b1a1a0"]');
      if (el) el.scrollIntoView({ block: "start", behavior: "instant" });
    })()
  `);
  await page.waitForTimeout(600);
  await page.screenshot({ path: SHOT });
  console.log(`\nScreenshot → ${SHOT}`);

  console.log("\nBrowser open — press Ctrl+C to close.");
  await new Promise(() => {});
}

main().catch((e) => { console.error(e); process.exit(1); });
