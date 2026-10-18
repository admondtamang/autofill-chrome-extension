/**
 * ImmiFill demo — serves the built side panel, opens a headed browser,
 * walks through all screens, and saves screenshots.
 */
import { chromium } from "playwright";
import { createServer } from "http";
import { readFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, "../.output/chrome-mv3");
const SHOTS = path.resolve(__dirname, "../demo-screenshots");
mkdirSync(SHOTS, { recursive: true });

// ── static server ─────────────────────────────────────────────────────────────
const MIME: Record<string, string> = {
  html: "text/html", js: "application/javascript",
  css: "text/css", png: "image/png", json: "application/json",
};
const server = createServer((req, res) => {
  const url = req.url === "/" ? "/sidepanel.html" : (req.url ?? "/");
  const file = path.join(DIST, url);
  if (existsSync(file)) {
    const ext = path.extname(file).slice(1);
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  } else {
    res.writeHead(404); res.end();
  }
});
const PORT = 5050;
server.listen(PORT);
const BASE = `http://localhost:${PORT}`;

// ── chrome API mock (injected before page scripts run) ────────────────────────
function chromeApiScript(loggedIn: boolean): string {
  const session = loggedIn ? JSON.stringify({
    token: "demo-token",
    expiry: Math.floor(Date.now() / 1000) + 43200,
    user: { id: 1, firstName: "Admond", lastName: "Tamang", email: "admond@successedu.com.au", roleId: 1, branchId: 2 },
  }) : "null";

  return `(function() {
    var session = ${session};
    window.chrome = {
      storage: {
        session: {
          get: function(_, cb) { setTimeout(function() { cb(session ? { immifill_session: session } : {}); }, 0); },
          set: function(_, cb) { if (cb) cb(); },
          remove: function(_, cb) { if (cb) cb(); },
        },
        local: {
          _data: {},
          get: function(key, cb) { var k = typeof key === 'string' ? key : (Array.isArray(key) ? key[0] : Object.keys(key)[0]); setTimeout(function() { cb(this._data[k] !== undefined ? { [k]: this._data[k] } : {}); }.bind(this), 0); },
          set: function(obj, cb) { Object.assign(this._data, obj); if (cb) cb(); },
          remove: function(_, cb) { if (cb) cb(); },
        },
      },
      runtime: {
        id: "demo",
        sendMessage: function(msg, cb) {
          if (!cb) return;
          setTimeout(function() {
            if (msg.type === "auth.session") { cb({ ok: true, data: session }); return; }
            if (msg.type === "auth.login") {
              cb({ ok: true, data: { token: "demo-token", expiry: Math.floor(Date.now()/1000)+43200, user: { id:1, firstName:"Admond", lastName:"Tamang", email:"admond@successedu.com.au", roleId:1, branchId:2 } } });
              return;
            }
            if (msg.type === "auth.logout") { cb({ ok: true, data: null }); return; }
            if (msg.type === "records.search") {
              cb({ ok: true, data: { count: 3, rows: [
                { id:3, firstName:"Grady", lastName:"Tanner", middleName:"Zahir", email:"sakuto@yopmail.com", phone:"+13891237608" },
                { id:4, firstName:"Shelley", lastName:"Grimes", middleName:null, email:"dyvasef@yopmail.com", phone:"+16621173021" },
                { id:5, firstName:"Test", lastName:"One", middleName:null, email:"testone@gmail.com", phone:"+61432111111" },
              ]}});
              return;
            }
            if (msg.type === "records.get") {
              cb({ ok: true, data: { id:3, firstName:"Grady", lastName:"Tanner", middleName:"Zahir", email:"sakuto@yopmail.com", phone:"+13891237608", dob:"2026-09-02", passport:"Zephr", issueDate:"2026-09-01", expiryDate:"2026-09-23", country:"Charity", location:"Onshore", proposedVisa:"AAT Lodgement", visaSubmitted:"2026-09-01", visaGranted:"2026-09-28", currentVisa:"AAT Hearing", occupation:"Corporate General Manager", anzsco:"111211", sponsorName:"Illana", sponsorEmail:"byledopoty@yopmail.com", sponsorPhone:"+17026453361", nominationLodged:"2026-09-15", nominationDecision:"2026-09-30", nominationStatus:"Ready To Submit", sbsStatus:null, status:"Submitted", csaStatus:"Collecting Docs", assignedDate:"2026-09-17", visaStream:"Employer sponsored", remarks:"<p>evfc<\\/p>", miscNote:"<p>miscellaneous note here<\\/p>", state:"Phillip", files:null } });
              return;
            }
            cb({ ok: false, error: "Unknown" });
          }, 80);
        },
        onMessage: { addListener: function(){}, removeListener: function(){} },
      },
      sidePanel: { setPanelBehavior: function() { return Promise.resolve(); } },
    };
  })();`;
}

// ── browser ───────────────────────────────────────────────────────────────────
const browser = await chromium.launch({
  headless: false,
  args: ["--window-size=460,760", "--window-position=80,40"],
});

async function shot(page: Awaited<ReturnType<typeof browser.newPage>>, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}`, fullPage: false });
  console.log(`  📸  ${name}`);
}

console.log("\n🚀  ImmiFill Live Demo\n");

// ── 1. Login screen ───────────────────────────────────────────────────────────
console.log("── Screen 1: Login");
const page = await browser.newPage({ viewport: { width: 400, height: 680 } });
await page.addInitScript({ content: chromeApiScript(false) });
await page.goto(`${BASE}/sidepanel.html`);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(800);
await shot(page, "01-login.png");

// ── 2. Login error ────────────────────────────────────────────────────────────
console.log("── Screen 2: Login error");
const emailInput = await page.locator("input").first();
await emailInput.fill("wrong@example.com");
await page.locator('input[type="password"]').fill("wrongpass");
const submitBtn = page.locator('button[type="submit"], button:has-text("Sign"), button:has-text("Log")').first();
await submitBtn.click();
await page.waitForTimeout(1000);
await shot(page, "02-login-error.png");

// ── 3. Search screen (logged in) ──────────────────────────────────────────────
console.log("── Screen 3: Search");
await page.close();
const page2 = await browser.newPage({ viewport: { width: 400, height: 680 } });
await page2.addInitScript({ content: chromeApiScript(true) });
await page2.goto(`${BASE}/sidepanel.html`);
await page2.waitForLoadState("networkidle");
await page2.waitForTimeout(800);
await shot(page2, "03-search.png");

// ── 4. Search results ─────────────────────────────────────────────────────────
console.log("── Screen 4: Search results");
const searchEl = await page2.$('input[placeholder]');
if (searchEl) await searchEl.fill("Grady");
await page2.waitForTimeout(1200);
await shot(page2, "04-results.png");

// ── 5. User data screen ───────────────────────────────────────────────────────
console.log("── Screen 5: User data");
try {
  await page2.click("text=Grady Tanner", { timeout: 4000 });
} catch {
  // click whatever result row is first
  const rows = await page2.$$('[role="listitem"], li, .cursor-pointer');
  if (rows[0]) await rows[0].click();
}
await page2.waitForTimeout(1500);
await shot(page2, "05-userdata.png");

// ── 6. Scroll to show more fields ────────────────────────────────────────────
console.log("── Screen 6: User data scrolled");
await page2.keyboard.press("End");
await page2.waitForTimeout(600);
await shot(page2, "06-userdata-scrolled.png");

// ── 7. AI Settings screen ─────────────────────────────────────────────────────
console.log("── Screen 7: AI Settings");
try {
  const gearBtn = page2.locator('button[aria-label="AI Settings"]');
  await gearBtn.click({ timeout: 3000 });
  await page2.waitForTimeout(600);
  await shot(page2, "07-ai-settings.png");
} catch {
  console.log("  ⚠  Could not open settings screen");
}

console.log(`\n✅  Screenshots saved → demo-screenshots/\n`);
console.log("   Browser stays open for 20s — explore the UI!\n");
await page2.waitForTimeout(20_000);

await browser.close();
server.close();
