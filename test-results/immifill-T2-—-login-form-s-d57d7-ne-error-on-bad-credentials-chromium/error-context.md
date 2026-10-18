# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: immifill.spec.ts >> T2 — login form shows inline error on bad credentials
- Location: test/e2e/immifill.spec.ts:158:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('[role="alert"]')
Expected pattern: /invalid email or password/i
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toContainText" locator('[role="alert"]') with timeout 5000ms
  - waiting for locator('[role="alert"]')

```

```yaml
- banner: ImmiFill
- main:
  - heading "Sign in to ImmiFill" [level=1]
  - paragraph: Enter your CRM credentials
  - text: Email
  - textbox "Email":
    - /placeholder: you@successedu.com.au
  - text: Password
  - textbox "Password":
    - /placeholder: ••••••••
  - button "Sign in" [disabled]
```

# Test source

```ts
  66  |                         token: "e2e-token",
  67  |                         expiry: Math.floor(Date.now() / 1000) + 43200,
  68  |                         user: {
  69  |                           id: 1,
  70  |                           firstName: "Jane",
  71  |                           lastName: "Staff",
  72  |                           email: "jane@successedu.com.au",
  73  |                           roleId: 1,
  74  |                           branchId: 2,
  75  |                         },
  76  |                       },
  77  |                     });
  78  |                   }
  79  |                   break;
  80  |                 case "auth.logout":
  81  |                   cb({ ok: true, data: null });
  82  |                   break;
  83  |                 case "records.search":
  84  |                   cb({
  85  |                     ok: true,
  86  |                     data: {
  87  |                       count: 2,
  88  |                       rows: [
  89  |                         {
  90  |                           id: 5,
  91  |                           firstName: "Test",
  92  |                           lastName: "One",
  93  |                           email: "testone@gmail.com",
  94  |                           phone: "+61432111111",
  95  |                         },
  96  |                         {
  97  |                           id: 4,
  98  |                           firstName: "Shelley",
  99  |                           lastName: "Grimes",
  100 |                           email: "dyvasef@yopmail.com",
  101 |                           phone: "+16621173021",
  102 |                         },
  103 |                       ],
  104 |                     },
  105 |                   });
  106 |                   break;
  107 |                 case "records.get":
  108 |                   cb({
  109 |                     ok: true,
  110 |                     data: {
  111 |                       id: 5,
  112 |                       firstName: "Test",
  113 |                       lastName: "One",
  114 |                       middleName: null,
  115 |                       email: "testone@gmail.com",
  116 |                       phone: "+61432111111",
  117 |                       dob: "1990-06-15",
  118 |                       passport: "A12345678",
  119 |                       country: "AUS",
  120 |                       location: "Onshore",
  121 |                       occupation: "Software Engineer",
  122 |                       anzsco: "261313",
  123 |                       status: "Active",
  124 |                       csaStatus: "Collecting Docs",
  125 |                       assignedDate: "2026-10-04",
  126 |                       remarks: "<p>Good candidate</p>",
  127 |                       visaNote: null,
  128 |                       miscNote: null,
  129 |                       files: null,
  130 |                     },
  131 |                   });
  132 |                   break;
  133 |                 default:
  134 |                   cb({ ok: false, error: "Unknown message type" });
  135 |               }
  136 |             }, 0);
  137 |           },
  138 |           onMessage: { addListener: () => {}, removeListener: () => {} },
  139 |         },
  140 |         sidePanel: { setPanelBehavior: () => Promise.resolve() },
  141 |       },
  142 |     });
  143 |   }, opts);
  144 | }
  145 | 
  146 | // ── Tests ─────────────────────────────────────────────────────────────────────
  147 | 
  148 | test("T1 — extension loads and shows the login screen", async ({ page }) => {
  149 |   await mockChromeApis(page, { loggedIn: false });
  150 |   await page.goto("/sidepanel.html");
  151 | 
  152 |   await expect(page.locator("text=ImmiFill")).toBeVisible({ timeout: 8_000 });
  153 |   await expect(page.getByLabel("Email")).toBeVisible();
  154 |   await expect(page.getByLabel("Password")).toBeVisible();
  155 |   await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  156 | });
  157 | 
  158 | test("T2 — login form shows inline error on bad credentials", async ({ page }) => {
  159 |   await mockChromeApis(page, { loginError: "Invalid email or password" });
  160 |   await page.goto("/sidepanel.html");
  161 | 
  162 |   await page.getByLabel("Email").fill("wrong@example.com");
  163 |   await page.getByLabel("Password").fill("badpass");
  164 |   await page.getByRole("button", { name: /sign in/i }).click();
  165 | 
> 166 |   await expect(page.locator('[role="alert"]')).toContainText(
      |                                                ^ Error: expect(locator).toContainText(expected) failed
  167 |     /invalid email or password/i,
  168 |     { timeout: 5_000 },
  169 |   );
  170 | });
  171 | 
  172 | test("T3 — successful login navigates to search screen and shows user name", async ({ page }) => {
  173 |   await mockChromeApis(page, { loggedIn: false });
  174 |   await page.goto("/sidepanel.html");
  175 | 
  176 |   await page.getByLabel("Email").fill("jane@successedu.com.au");
  177 |   await page.getByLabel("Password").fill("correct");
  178 |   await page.getByRole("button", { name: /sign in/i }).click();
  179 | 
  180 |   await expect(page.getByPlaceholder(/search/i)).toBeVisible({ timeout: 8_000 });
  181 |   await expect(page.getByText(/Jane Staff/i)).toBeVisible();
  182 | });
  183 | 
  184 | test("T4 — search shows client results with names", async ({ page }) => {
  185 |   await mockChromeApis(page, { loggedIn: true });
  186 |   await page.goto("/sidepanel.html");
  187 | 
  188 |   await expect(page.getByPlaceholder(/search/i)).toBeVisible({ timeout: 8_000 });
  189 |   await page.getByPlaceholder(/search/i).fill("Test");
  190 | 
  191 |   await expect(page.getByText(/Test One/i)).toBeVisible({ timeout: 5_000 });
  192 |   await expect(page.getByText(/Shelley Grimes/i)).toBeVisible({ timeout: 5_000 });
  193 | });
  194 | 
  195 | test("T5 — selecting a client shows user data with Fill all button and applicant fields", async ({ page }) => {
  196 |   await mockChromeApis(page, { loggedIn: true });
  197 |   await page.goto("/sidepanel.html");
  198 | 
  199 |   await expect(page.getByPlaceholder(/search/i)).toBeVisible({ timeout: 8_000 });
  200 |   await page.getByPlaceholder(/search/i).fill("Test");
  201 |   await expect(page.getByText(/Test One/i)).toBeVisible({ timeout: 5_000 });
  202 |   await page.getByText(/Test One/i).first().click();
  203 | 
  204 |   await expect(page.getByRole("button", { name: /fill all/i })).toBeVisible({ timeout: 8_000 });
  205 |   await expect(page.getByText(/personal/i)).toBeVisible();
  206 |   await expect(page.getByText("testone@gmail.com")).toBeVisible();
  207 | });
  208 | 
```