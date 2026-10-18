/**
 * ImmiFill E2E tests — 5 tests against the built side-panel served over HTTP.
 *
 * The extension's chrome.* APIs are mocked via page.addInitScript so the React
 * app behaves exactly as it would inside the real extension — no CRM credentials
 * or running Chrome extension required.
 */
import { test, expect, type Page } from "@playwright/test";

// ── API mock ──────────────────────────────────────────────────────────────────

type MockOpts = {
  loggedIn?: boolean;
  loginError?: string;
};

async function mockChromeApis(page: Page, opts: MockOpts = {}) {
  await page.addInitScript((o: MockOpts) => {
    const session = o.loggedIn
      ? {
          token: "e2e-token",
          expiry: Math.floor(Date.now() / 1000) + 43200,
          user: {
            id: 1,
            firstName: "Jane",
            lastName: "Staff",
            email: "jane@successedu.com.au",
            roleId: 1,
            branchId: 2,
          },
        }
      : null;

    Object.defineProperty(window, "chrome", {
      writable: true,
      configurable: true,
      value: {
        storage: {
          session: {
            get: (_: unknown, cb: (r: Record<string, unknown>) => void) =>
              setTimeout(() => cb(session ? { immifill_session: session } : {}), 0),
            set: (_: unknown, cb?: () => void) => {
              if (cb) cb();
            },
            remove: (_: unknown, cb?: () => void) => {
              if (cb) cb();
            },
          },
        },
        runtime: {
          id: "e2e-extension-id",
          sendMessage: (msg: { type: string }, cb?: (r: unknown) => void) => {
            if (!cb) return;
            setTimeout(() => {
              switch (msg.type) {
                case "auth.session":
                  cb({ ok: true, data: session });
                  break;
                case "auth.login":
                  if (o.loginError) {
                    cb({ ok: false, error: o.loginError });
                  } else {
                    cb({
                      ok: true,
                      data: {
                        token: "e2e-token",
                        expiry: Math.floor(Date.now() / 1000) + 43200,
                        user: {
                          id: 1,
                          firstName: "Jane",
                          lastName: "Staff",
                          email: "jane@successedu.com.au",
                          roleId: 1,
                          branchId: 2,
                        },
                      },
                    });
                  }
                  break;
                case "auth.logout":
                  cb({ ok: true, data: null });
                  break;
                case "records.search":
                  cb({
                    ok: true,
                    data: {
                      count: 2,
                      rows: [
                        {
                          id: 5,
                          firstName: "Test",
                          lastName: "One",
                          email: "testone@gmail.com",
                          phone: "+61432111111",
                        },
                        {
                          id: 4,
                          firstName: "Shelley",
                          lastName: "Grimes",
                          email: "dyvasef@yopmail.com",
                          phone: "+16621173021",
                        },
                      ],
                    },
                  });
                  break;
                case "records.get":
                  cb({
                    ok: true,
                    data: {
                      id: 5,
                      firstName: "Test",
                      lastName: "One",
                      middleName: null,
                      email: "testone@gmail.com",
                      phone: "+61432111111",
                      dob: "1990-06-15",
                      passport: "A12345678",
                      country: "AUS",
                      location: "Onshore",
                      occupation: "Software Engineer",
                      anzsco: "261313",
                      status: "Active",
                      csaStatus: "Collecting Docs",
                      assignedDate: "2026-10-04",
                      remarks: "<p>Good candidate</p>",
                      visaNote: null,
                      miscNote: null,
                      files: null,
                    },
                  });
                  break;
                default:
                  cb({ ok: false, error: "Unknown message type" });
              }
            }, 0);
          },
          onMessage: { addListener: () => {}, removeListener: () => {} },
        },
        sidePanel: { setPanelBehavior: () => Promise.resolve() },
      },
    });
  }, opts);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("T1 — extension loads and shows the login screen", async ({ page }) => {
  await mockChromeApis(page, { loggedIn: false });
  await page.goto("/sidepanel.html");

  await expect(page.locator("text=ImmiFill")).toBeVisible({ timeout: 8_000 });
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

test("T2 — login form shows inline error on bad credentials", async ({ page }) => {
  await mockChromeApis(page, { loginError: "Invalid email or password" });
  await page.goto("/sidepanel.html");

  await page.getByLabel("Email").fill("wrong@example.com");
  await page.getByLabel("Password").fill("badpass");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page.locator('[role="alert"]')).toContainText(
    /invalid email or password/i,
    { timeout: 5_000 },
  );
});

test("T3 — successful login navigates to search screen and shows user name", async ({ page }) => {
  await mockChromeApis(page, { loggedIn: false });
  await page.goto("/sidepanel.html");

  await page.getByLabel("Email").fill("jane@successedu.com.au");
  await page.getByLabel("Password").fill("correct");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page.getByPlaceholder(/search/i)).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText(/Jane Staff/i)).toBeVisible();
});

test("T4 — search shows client results with names", async ({ page }) => {
  await mockChromeApis(page, { loggedIn: true });
  await page.goto("/sidepanel.html");

  await expect(page.getByPlaceholder(/search/i)).toBeVisible({ timeout: 8_000 });
  await page.getByPlaceholder(/search/i).fill("Test");

  await expect(page.getByText(/Test One/i)).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText(/Shelley Grimes/i)).toBeVisible({ timeout: 5_000 });
});

test("T5 — selecting a client shows user data with Fill all button and applicant fields", async ({ page }) => {
  await mockChromeApis(page, { loggedIn: true });
  await page.goto("/sidepanel.html");

  await expect(page.getByPlaceholder(/search/i)).toBeVisible({ timeout: 8_000 });
  await page.getByPlaceholder(/search/i).fill("Test");
  await expect(page.getByText(/Test One/i)).toBeVisible({ timeout: 5_000 });
  await page.getByText(/Test One/i).first().click();

  await expect(page.getByRole("button", { name: /fill all/i })).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText(/personal/i)).toBeVisible();
  await expect(page.getByText("testone@gmail.com")).toBeVisible();
});
