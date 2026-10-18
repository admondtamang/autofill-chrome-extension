/**
 * Visual fill demo for sample.html using Playwright (headed).
 * Uses the same direct DOM approach as the extension.
 * Run: npx tsx scripts/test-fill.ts
 */
import { chromium, type Page } from "playwright";

const FILE = "file:///Users/admondtamang/Downloads/files/sample.html";
const SHOT = "/Users/admondtamang/Downloads/files/immifill-kickoff/demo-screenshots/sample-filled.png";

const TEST_FIELDS: Array<{ name: string; value: string; label: string; type?: string }> = [
  { name: "_2a0b0a0a0e0a0a2a5h1b0b0a", value: "Smith",        label: "Family name" },
  { name: "_2a0b0a0a0e0a0a2a5h1c0b0a", value: "John William", label: "Given names" },
  { name: "_2a0b0a0a0e0a0a2a5h3a1a",   value: "1990-05-15",   label: "Date of birth" },
  { name: "_2a0b0a0a0e0a0a2a5i0b0",    value: "PA1234567",    label: "Passport number" },
  { name: "_2a0b0a0a0e0a0a2a5bd0b0",   value: "2020-01-10",   label: "Date of issue" },
  { name: "_2a0b0a0a0e0a0a2a5be0b0",   value: "2030-01-10",   label: "Date of expiry" },
  { name: "_2a0b0a0a0e0a0a2a6c0b0",    value: "Sydney",       label: "Town / City" },
  { name: "_2a0b0a0a0e0a0a2a5h2a1a",   value: "F",            label: "Sex",         type: "radio" },
];

async function fillField(page: Page, name: string, value: string, type?: string) {
  const sel = type === "radio"
    ? `input[type=radio][name="${name}"][value="${value}"]`
    : `[name="${name}"]`;
  const safe = value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  return page.evaluate(`
    (function() {
      var el = document.querySelector('${sel}');
      if (!el) return "not_found";
      el.scrollIntoView({ block: "center", behavior: "instant" });
      el.style.outline = "3px solid #f97316";
      el.style.backgroundColor = "#fff7ed";
      ${type === "radio" ? `
        el.click();
        el.style.outline = el.checked ? "3px solid #16a34a" : "3px solid #ef4444";
        el.style.backgroundColor = el.checked ? "#f0fdf4" : "#fef2f2";
        return el.checked ? "ok" : "rejected";
      ` : `
        var s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value") && Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        if (s) s.call(el, '${safe}'); else el.value = '${safe}';
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new Event("blur", { bubbles: true }));
        var ok = el.value === '${safe}';
        el.style.outline = ok ? "3px solid #16a34a" : "3px solid #ef4444";
        el.style.backgroundColor = ok ? "#f0fdf4" : "#fef2f2";
        return ok ? "ok" : "rejected:" + el.value;
      `}
    })()
  `) as Promise<string>;
}

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 80 });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  console.log("Opening sample.html…");
  await page.goto(FILE);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1000);

  console.log("\nFilling fields:\n");

  for (const f of TEST_FIELDS) {
    const result = await fillField(page, f.name, f.value, f.type);
    await page.waitForTimeout(500);
    const icon = result === "ok" ? "✅" : result === "not_found" ? "❌" : "⚠️";
    console.log(`  ${icon} ${f.label}: "${f.value}"`);
  }

  // Scroll to the filled names section for the screenshot
  await page.evaluate(`
    (function() {
      var el = document.querySelector('[name="_2a0b0a0a0e0a0a2a5h1b0b0a"]');
      if (el) el.scrollIntoView({ block: "start", behavior: "instant" });
    })()
  `);
  await page.waitForTimeout(600);
  await page.screenshot({ path: SHOT });
  console.log("\nScreenshot → " + SHOT);

  console.log("\nBrowser open — press Ctrl+C to close.");
  await new Promise(() => {});
}

main().catch((e) => { console.error(e); process.exit(1); });
