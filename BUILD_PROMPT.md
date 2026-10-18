# ImmiFill: Build Brief for Claude Code

You are the **Orchestrator** of a software team. Your job is to ship a working Chrome extension called **ImmiFill** in this single session. You plan, delegate to specialist subagents, integrate, verify, review, and fix until the Definition of Done (§9) is met.

Read this whole document before taking any action.

## 0. Source of truth and priority

When sources conflict, follow this order (highest wins):

1. Real data: `docs/api/samples/*.json`, `docs/immi-pages/*.html`
2. This document
3. `docs/api/auth.md`, `docs/api/records.md`, `docs/field-map.md`. These repeat §6–§7 in more detail; read them too.
4. Your own judgment. Record every judgment call in `DECISIONS.md`.

Never invent endpoints, query params, response fields, or ImmiAccount labels. If something is unknown, make it a single named constant, record it in `ASSUMPTIONS.md`, and continue. Stop and ask the user ONLY if `docs/api/auth.md` is missing.

## 1. Your role: Orchestrator (tech lead + product owner)

- You own the plan, the contracts, integration, and final quality. You decide; subagents execute.
- Your context window is the scarcest resource on the team:
  - Delegate reading and writing of large files to subagents.
  - Keep only summaries and file paths in your own context.
- Look at every decision from more than one angle before committing. Ask yourself:
  - Product: does this serve the user flow in §5?
  - Engineering: is it simple, typed, and testable?
  - Risk: what breaks on a real ImmiAccount page?
  - Security: what leaks?
- You may write code yourself only for scaffolding (Phase 2), contracts (Phase 3), and integration glue (Phase 5). Feature code is written by subagents.

## 2. The team

### 2.1 How hiring works

- Hire with the **Task tool** (subagents), using a role brief built from the template in §2.3.
- Run independent subagents **in parallel** (multiple Task calls in one message).
- Subagents cannot spawn their own subagents. All hiring goes through you, so the team is flat.
- You may hire the same role more than once, for example a second engineer to fix review findings.

### 2.2 Roster

| Role | Phase | Owns (may create/edit) | Responsibility |
|---|---|---|---|
| **Recon Analyst** | 1 | `.claude/work/CONTEXT.md` | Read all of `docs/`; produce a compact digest |
| **Product Manager** | 1, 7 | `.claude/work/PLAN.md` (requirements part), `ASSUMPTIONS.md` | User stories, acceptance criteria, scope challenges, final product review |
| **Architect** | 1, 3 | `.claude/work/PLAN.md` (tech part), `src/shared/**` | File layout, contracts, task breakdown with file ownership |
| **API & Auth Engineer** | 4 | `src/entrypoints/background.ts`, `src/background/**`, `scripts/smoke.ts` | Session, API client, search, message handlers |
| **Data Engineer** | 4 | `src/records/**`, `src/profile/**`, `src/transforms/**` + their tests | Zod schemas, mappers, transforms |
| **Fill Engine Engineer** | 4 | `src/entrypoints/content.ts`, `src/filler/**`, `src/field-maps/**`, `test/fixtures/**` + tests | Locators, controls, Fill all, click-to-fill, pick mode, drop handling, inspector, highlights |
| **UI Engineer** | 4 | `src/entrypoints/sidepanel/**`, `src/components/**` | Side panel with shadcn/ui |
| **QA Engineer** | 6 | `test/acceptance/**` | Acceptance checks (§8.2), runs every gate |
| **Security Reviewer** | 7 | none (read-only, reports findings) | Secrets, PII, permissions, injection, storage |
| **Code Reviewer** | 7 | none (read-only) | Correctness, types, duplication, contract adherence, dead code |
| **Accessibility & UX Reviewer** | 7 | none (read-only) | Keyboard, ARIA, focus, empty/error/loading states |
| **Red Team Tester** | 7 | `test/redteam/**` | Tries to break the engine: weird DOM, re-renders, bad data, junk values |
| **Tech Writer** | 8 | `README.md` | Setup, load unpacked, extend record types / field maps / filters |

You may add a role if the plan needs one. Record why in `DECISIONS.md`.

### 2.3 Brief template (use for every hire)

```
ROLE: <role> on the ImmiFill team. You report to the Orchestrator.
GOAL: <one sentence>
READ FIRST: <exact file paths; at most what is needed>
CONTRACTS (read-only, do not modify): src/shared/**
YOU OWN (only files you may create or edit): <globs>
TASKS: <numbered, concrete>
ACCEPTANCE: <testable criteria>
VERIFY BEFORE RETURNING: <exact commands, e.g. npm run typecheck && npx vitest run src/records>
RULES: Follow §4 rules of BUILD_PROMPT.md. If a contract blocks you, STOP and report; do not edit it.
RETURN (max 150 words): status (done/blocked), files changed, verify output (pass/fail + counts), assumptions made, open issues.
```

## 3. Execution phases and gates

Track every task in `.claude/work/PROGRESS.md` as a checklist with owner and status. Update it after every phase so the work survives context compaction. Commit with git after each gate passes (`git init` first if needed), using messages like `phase-4: data mappers`.

| Phase | Who | Output | Gate to pass before moving on |
|---|---|---|---|
| **1. Recon & plan** | Recon Analyst, then PM + Architect (parallel) | `CONTEXT.md` (≤300 lines: endpoints, fields, fixtures found, gaps), `PLAN.md`, `ASSUMPTIONS.md` | You review the plan from product, engineering, risk, and security angles; revise once if weak |
| **2. Scaffold** | You | Project builds empty: WXT + React + TS strict + Tailwind + shadcn/ui + Vitest + ESLint + Prettier | `npm run typecheck && npm run build` pass |
| **3. Contracts** | Architect, reviewed by you | `src/shared/**`: message contracts, ApplicantProfile, FillReport, FieldMap, RecordType, FilterConfig types, zod schema skeletons | Typecheck passes. Contracts are now **frozen**: changes need your approval and an entry in `DECISIONS.md` |
| **4. Build (parallel)** | API & Auth, Data, Fill Engine, UI engineers, all at once | Features with unit tests | Each subagent's own verify passes |
| **5. Integrate** | You | Side panel ↔ background ↔ content script wired end to end | Full gate: `npm run typecheck && npm run lint && npm test && npm run build` |
| **6. Verify** | QA Engineer | Acceptance tests (§8.2); smoke test (§6.4) if env vars are present | All acceptance tests pass |
| **7. Review (parallel)** | Security, Code, A11y/UX, Red Team, PM | Findings ranked must-fix / should-fix / nit | You dispatch must-fix and should-fix items to the owning role, then re-run the full gate. Max **3** review→fix cycles; leftovers go in the final report |
| **8. Docs & report** | Tech Writer, then you | `README.md`, final report (§9) | Definition of Done met |

## 4. Operating rules (every agent)

**Context discipline**

- Read only what the task needs. Use Grep/Glob for targeted lookups instead of reading whole directories.
- If a code-graph or context tool is available (for example `graphify`, a repo-map tool, or a codebase MCP server), use it to query structure instead of reading files.
- Use the built-in Explore subagent for wide searches.
- Subagent results come back as summaries; full detail lives in files, not in chat.
- Never paste large file contents, sample JSON, or HTML fixtures into a report. Reference the path.

**Engineering**

- TypeScript strict, no `any`, no `@ts-ignore`, no non-null assertions on external data.
- Validate all external data with zod at the boundary (API responses, messages, DOM reads).
- Write tests first for pure logic: mappers, transforms, locators, search query building.
- Small files, named exports, no default exports except where WXT requires them.
- Every unknown is one named constant in `src/shared/config.ts`.
- Pin dependency versions. The only allowed runtime deps are:
  - react, react-dom, wxt, zod
  - tailwind + shadcn/ui and its Radix deps
  - lucide-react, sonner, cmdk
  - libphonenumber-js, i18n-iso-countries
  
  Anything else needs a one-line justification in `DECISIONS.md`.

**Safety**

- Never print, log, or commit tokens, passwords, or applicant data. `.env*` goes in `.gitignore`.
- Tests never touch the network; they use `docs/api/samples` and `test/fixtures`.
- No destructive commands outside the project directory. No `git push`.

**Coordination**

- An agent edits only the files it owns. A need to change someone else's file is reported back, not done.

## 5. Product

### 5.1 Context

Success Education is an Australian education and migration agency. Staff use the Success CRM (`crm-v2.successedu.com.au`) to manage leads, students, and visa applicants. ImmiFill lets a staff member:

1. Log in with their CRM credentials.
2. Search for and pick a client.
3. See all of that client's data in a side panel.
4. Fill Australian Department of Home Affairs **ImmiAccount** forms (`https://online.immi.gov.au/`), either all at once, field by field with a click, or by drag and drop.

This is an **integration-only** project. Do not build or change any backend.

### 5.2 User flow

1. Click the extension icon. The side panel opens with the login screen.
2. Log in. The search screen opens, with record type defaulting to Visa Applicant.
3. Type a query (and filters, if configured). Pick a result.
4. The user data screen shows all fields, grouped.
5. On an ImmiAccount page, the user can:
   - **Fill all**: fill every mapped field on this page
   - **Click to fill**: send one value to the focused field, or enter pick mode
   - **Drag and drop**: drag one value onto any field
6. A fill report shows what was filled, skipped, not found, or failed. Fields on the page are highlighted.
7. The user reviews the page and clicks Next themselves. Repeat per page, or turn on Auto-fill to fill each new page automatically.

### 5.3 Non-goals

- Auto-submitting or navigating (never click Next, Save, or Submit)
- Ticking declarations
- Touching CAPTCHAs
- Supporting other browsers
- Storing applicant data beyond the browser session
- Making backend changes

## 6. API integration

### 6.1 Base

- Base URL: `https://api.successedu.com.au/success-crm` (config constant `API_BASE_URL`).
- All calls go through the background service worker. Host permissions make CORS irrelevant there.

### 6.2 Auth

- `POST /auth/login` with header `content-type: application/json` and body `{ "email": string, "password": string }`.
- Response: `{ token: string (JWT), user: {...many fields}, expiry: number (unix SECONDS) }`. Token lifetime is 12h. There is no refresh endpoint.
- Authenticated requests: **ASSUMPTION** `Authorization: Bearer <token>`, defined as constants `AUTH_HEADER_NAME` and `AUTH_HEADER_PREFIX`.
- Session handling:
  - Store `{ token, expiry, user: { id, firstName, lastName, email, roleId, branchId } }` in `chrome.storage.session`. Discard all other user fields.
  - The session is expired when `Date.now()/1000 >= expiry - 60`.
  - On expiry or a 401, clear the session and route to login.
  - Never store the password.
- Error message: use `message` from the response body if present, else a generic message.

### 6.3 Records and search

Endpoints, all `GET`, all returning the envelope `{ count: number, rows: Row[] }`:

| Registry id | Label | Path |
|---|---|---|
| `visaApplicant` (default) | Visa Applicant | `/visaApplicant` |
| `student` | Student | `/student` |
| `lead` | Lead | `/lead` |

Query params:

- `limit=25`.
- `q` for free text: debounce 300ms, minimum 2 characters.
- Pagination: **ASSUMPTION** `page`, 1-based, defined as constant `PAGINATION`. `hasMore = loadedRows < count`.
- Filters: none are known yet. Use `FilterConfig[]` (`{ param, label, type: 'select'|'multiselect'|'date-range'|'text', options? }`), empty by default. The filter bar is hidden while the config is empty. Do not invent filters.
- A new search cancels the in-flight one (AbortController keyed by request id). Stale results must never render.

There is no detail endpoint. `getDetail(type, id)` resolves from a cache of search rows keyed by `type:id`.

Row schema: see `docs/api/samples/visa-applicant.json`. `student` and `lead` are **ASSUMED** to have the same fields until samples exist.

- Every field is `.nullable().optional()`.
- Schemas use `.passthrough()`.
- Unmapped fields go to `extras`.

### 6.4 Optional live smoke test

`scripts/smoke.ts` runs ONLY if `CRM_TEST_EMAIL` and `CRM_TEST_PASSWORD` are set in the environment or in `.env.local`. It:

1. Logs in.
2. Calls each endpoint with `limit=1`.
3. Tries `page=2`.
4. Tries `q=test`.
5. Tries both `Bearer <token>` and the raw token, to find which auth header works.

It prints ONLY status codes, `count`, and the key names of the first row, never values or tokens. Record the results in `ASSUMPTIONS.md`, marked confirmed or refuted, and update `src/shared/config.ts`. If the env vars are absent, skip it and say so in the final report.

## 7. Data model and mapping

### 7.1 Record registry

Each record type is one file in `src/records/` exporting `{ id, label, path, rowSchema, toApplicantProfile(row) }`. Adding a type means one file plus one registry line.

### 7.2 ApplicantProfile

One canonical shape. All fields are optional, and all dates are `YYYY-MM-DD` strings.

```
personal { familyName, givenNames, dateOfBirth }
passport { number, dateOfIssue, dateOfExpiry, country }
contact  { email, mobile }
address  { state }
visa     { inAustralia, currentVisa, currentVisaExpiry, proposed, stream, submitted, granted }
employment { nominatedOccupation, anzscoCode }
sponsor  { name, email, phone }
nomination { lodged, decision, status }
skillsAssessment { status, submitted, decision }
crm      { status, csaStatus, assignedDate, requestedDate, dueDate }
notes    { remarks, visaNote, miscNote }   // plain text
files    { url, name, size, addedDate }[]
extras   { path, label, value }[]          // any remaining non-internal raw fields
```

### 7.3 Mapping

| CRM field | Profile path | Expected ImmiAccount label (verify against fixtures) | Transform |
|---|---|---|---|
| `lastName` | personal.familyName | Family name | trim |
| `firstName` + `middleName` | personal.givenNames | Given names | join non-empty values with one space |
| `dob` | personal.dateOfBirth | Date of birth | date |
| `passport` | passport.number | Passport number | trim, uppercase |
| `issueDate` / `expiryDate` | passport.dateOfIssue / dateOfExpiry | Date of issue / Date of expiry | date |
| `country` | passport.country (ASSUMPTION) | Country of passport | country |
| `email` | contact.email | Email address | trim, lowercase |
| `phone` | contact.mobile | Mobile / cell phone (may be split) | phone |
| `location` | visa.inAustralia | Is the applicant currently in Australia? | `Onshore`→Yes, `Offshore`→No, else skip |
| `currentVisa`, `visaExpiry` | visa.currentVisa, visa.currentVisaExpiry | if present | none / date |
| `occupation`, `anzsco` | employment.* | Nominated occupation / ANZSCO | none / digits only |
| `sponsorName/Email/Phone` | sponsor.* | if present | phone for phone |
| `state` | address.state | State or province | AU state |

**Never shown and never filled:** `id` (used only as an internal key), `userId`, `updatedBy`, `branchId`, `sourceId`, `createdAt`, `updatedAt`, `deletedAt`, `invoiceNumber`, `payment`, `paymentStatus`.

### 7.4 Transforms (pure functions, fully unit-tested)

**Date**

- Input may be `YYYY-MM-DD` or a full ISO timestamp.
- Date-only strings stay strings. NEVER pass them through `new Date()`.
- Timestamps are converted to a calendar date in `CRM_TIMEZONE` (default: browser time zone) with `Intl.DateTimeFormat`, and flagged `verify: true`, which shows a badge in the UI.
- Known case: `2026-09-16T18:15:00.000Z` is midnight on 2026-09-17 at UTC+05:45. The test asserts `2026-09-17` with `CRM_TIMEZONE='Asia/Kathmandu'`.
- Output is formatted to the target control's format, as found in the fixtures.

**Country**

- Resolve in order: ISO alpha-3 (`NPL`), then alpha-2, then exact or alias name, against the target `<select>` option text. Use `i18n-iso-countries` plus an alias table.
- Unresolvable values (e.g. `Charity`) are not filled: report `failed: unrecognized country value`.

**Phone**

- Parse E.164 with `libphonenumber-js`.
- Single input: international format. Split inputs: country code (digits), area code, and number, per the fixture.
- Unparseable values: raw value into a single text input only; otherwise failed.

**AU state**

- Fill only when the value is NSW, VIC, QLD, WA, SA, TAS, ACT, or NT, or the full name of one. Otherwise skip (e.g. `Phillip`).

**Notes**

- Strip HTML via `DOMParser` → `textContent` and collapse whitespace. Notes are display, copy, and drag only; Fill all never writes them.

**Empty**

- `null`, `""`, and whitespace-only values are empty. Hide them behind "Show empty". Never write an empty value.

**No business validation**

- Do not block or "correct" impossible combinations in the data.

## 8. Extension specification

### 8.1 Stack and architecture

- Chrome MV3, **WXT**, React 18, TypeScript strict, Tailwind, **shadcn/ui** (Radix), lucide-react, sonner, Vitest + jsdom.
- If the shadcn CLI doesn't work with WXT path aliases, add components manually under `src/components/ui` and note it in `DECISIONS.md`.
- **Background service worker**:
  - The only owner of the token and the only code that makes network calls.
  - Exposes a typed message API: `auth.login`, `auth.logout`, `auth.session`, `records.search`, `records.get`, and relays fill commands to the active tab's content script.
  - `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`.
- **Side panel**: the only UI. Not a popup, because a popup closes when the user clicks the page.
- **Content script**:
  - Runs on `https://online.immi.gov.au/*` with `all_frames: true`.
  - Fills, scans, and highlights. It injects no UI except outline highlights and the pick-mode cursor.
- **Permissions**: `storage`, `sidePanel`, `activeTab`, `scripting`. Host permissions: `https://online.immi.gov.au/*` and `https://api.successedu.com.au/*`. Nothing else.

### 8.2 Fill engine

One engine with three entry points. All three share the value setter, transforms, highlighting, and FillReport.

**Field maps.** Each ImmiAccount page has a map: `{ id, pageMatcher, fields: [{ profilePath, locator, control, transform? }] }`.

- Build them ONLY from `docs/immi-pages/*.html`.
- If that folder has no HTML fixtures:
  - Build the engine generically.
  - Create synthetic fixtures in `test/fixtures/` modeled on typical ImmiAccount markup (labels in table cells or `<label for>`, generated IDs, selects, radio groups, date inputs).
  - Ship field maps marked `verified: false`.
  - State this prominently in the final report.

**Locators.** Try in order:

1. Visible label text (normalized, case-insensitive; `<label for>`, wrapping label, or the adjacent table/label cell)
2. `aria-label` / `aria-labelledby`
3. A name/id pattern

Never rely on a raw generated ID alone.

**Controls**

- text and textarea
- select (option text, then value, then the country alias table)
- radio and checkbox groups
- date (the fixture's format)
- repeating sections via "Add another" (Fill all only)

**Setting values.** Use the native value setter (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set` and equivalents), then dispatch `input`, `change`, and `blur` with `bubbles: true`.

**Conditional fields.**

- Fill in DOM order.
- After any field that can reveal others or trigger a re-render or postback, wait for the DOM to settle: MutationObserver, quiet for 300ms, hard timeout 3s.
- Re-resolve locators after each settle.

**Mode 1: Fill all** (button)

- Fills every mapped field on the current page.
- Skips fields that already have a value unless the Overwrite switch is on.
- The "Auto-fill each page" switch (default off) runs Fill all on each newly loaded ImmiAccount page while a client is selected.

**Mode 2: Click to fill**

- The content script tracks the last focused form control (`focusin`).
- Clicking a value in the side panel fills that control.
- If no control is focused, enter **pick mode**:
  - crosshair cursor and hover outlines on controls
  - the next click on a control receives the value
  - Esc or a 15s timeout cancels
- Manual fills always overwrite.

**Mode 3: Drag and drop**

- Each side-panel value row is draggable and sets:
  - `text/plain` = display value
  - `application/x-immifill+json` = `{ profilePath, value }`
- The content script handles `dragover` (preventDefault on form controls, outline the target) and `drop` (capture phase, preventDefault).
  - It parses the JSON payload, falling back to text/plain.
  - It routes the value through the engine so transforms apply to selects, radios, and dates.
- Cross-document drag is a known risk. If the custom MIME type is unavailable on drop, fall back to text/plain plus the last drag's `profilePath`, sent via a runtime message on `dragstart`.
- Manual fills always overwrite.

**Results.**

- Every fill returns `FillReport { filled, skipped, notFound, failed: {field, reason}[] }`.
- Highlight filled fields green and unmatched fields that have data amber.
- Rows in the side panel get a "used" badge once filled on the current page.

**Never**

- click Next, Save, or Submit
- tick declarations
- touch a CAPTCHA
- write empty values

### 8.3 Field inspector

The "Scan page" button (in the overflow menu) copies JSON for every form control on the page to the clipboard: `{ label, control, name, id, options?, frame }`. It is used to build new field maps. README explains the workflow.

### 8.4 Side panel UI (shadcn/ui)

**Login**

- Email and password, submit, loading state, error toast.

**Search**

- Record type selector (Visa Applicant / Student / Lead).
- `q` input.
- Collapsible filter bar rendered from `FilterConfig`, hidden while empty, with active-filter chips and clear-all.
- Results list: name, record type, email or phone.
- "Load more" button.
- Empty, loading (skeleton), and error states.

**User data**

- Header: client name, record type, "Change client" button, then the **Fill all** button, the Overwrite switch, and the Auto-fill switch.
- An in-panel filter that matches field label or value.
- Accordion sections: Personal, Passport, Contact, Visa, Occupation, Sponsor & Nomination, Skills assessment, CRM status, Notes, Files, Other.
- Each field row has:
  - label and value
  - a "verify" badge where flagged
  - a copy button
  - a click-to-fill button
  - a drag handle (the whole row is draggable)
- Files render as links and are not draggable.
- Empty fields are hidden behind the "Show empty" toggle.

**Fill report**

- Sheet or Accordion with counts and per-field lists.

**Shell**

- Header with the logged-in user and Logout. Light and dark via `prefers-color-scheme`.

**Accessibility**

- Every control is labeled.
- Full keyboard navigation with visible focus.
- Enter on a focused field row does click-to-fill (the keyboard alternative to drag).
- An `aria-live` region announces fill results.
- Drag handles have `aria-describedby` instructions.

## 9. Quality bar, acceptance, and Definition of Done

### 9.1 Gates

`npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` all pass with zero errors. The build output (`.output/chrome-mv3`) loads via chrome://extensions → Load unpacked.

### 9.2 Acceptance tests (QA owns; all automated)

1. The search client builds correct URLs for: `q` only, filters only, `q` + filters, and page 2.
2. Changing `q` mid-request aborts the stale request; stale results never render.
3. Each sample row maps to ApplicantProfile, and nothing is lost: every non-internal, non-empty raw field appears in the profile or in `extras`.
4. Transforms:
   - the `NPL` and `Charity` country cases
   - the `2026-09-16T18:15:00.000Z` → `2026-09-17` case (`Asia/Kathmandu`)
   - a date-only string unchanged under a negative-offset time zone
   - E.164 split
   - `Phillip` rejected as a state
   - HTML stripped from notes
5. Fill all on every fixture page produces the expected FillReport (snapshot), including after a simulated conditional re-render.
6. Click to fill works with a focused field, and in pick mode (including Esc cancel).
7. A simulated drop works on text, select, radio, and date controls, with both payload types.
8. Session: an expired token or a 401 clears the session; the token is never present in any log call (spy on console).
9. The internal fields in §7.3 never appear in the rendered user data screen.

### 9.3 Definition of Done

- All gates and acceptance tests are green.
- All must-fix review items are resolved.
- `README.md` covers: setup, load unpacked, and how to add a record type, a filter, and a field map (inspector workflow).
- `ASSUMPTIONS.md` lists each assumption as confirmed, refuted, or open.

### 9.4 Final report (your last message, max 40 lines)

1. What works (by user flow step)
2. Gate and test results (counts)
3. Assumptions: confirmed / refuted / open
4. Field maps: verified against real fixtures, or synthetic only
5. Remaining should-fix and nit items
6. Exact steps to load and try the extension
7. Top 3 recommended next steps

## 10. Start now

Begin Phase 1. Do not ask the user for confirmation between phases. Work autonomously until §9.3 is met or you are blocked by a missing auth spec.
