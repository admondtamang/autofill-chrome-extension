# ImmiFill – Plan

## Requirements

### 1. Overview

ImmiFill is a Chrome MV3 extension that lets Success Education staff log in with their CRM credentials, search for a client, view that client's data in a side panel, and fill Australian Department of Home Affairs ImmiAccount forms at `https://online.immi.gov.au/` — either all at once, field by field via click, or via drag and drop.

---

### 2. User Stories and Acceptance Criteria

#### US-01 Login

**As a** Success Education staff member,
**I want to** log in with my CRM email and password,
**so that** I can securely access client data without re-entering credentials on every use.

**Acceptance Criteria:**
- AC-01.1: Clicking the extension icon opens the side panel showing a login screen with email and password fields and a submit button.
- AC-01.2: On submit, the extension POSTs `{ email, password }` to `POST /auth/login` with headers `content-type: application/json` and `accept: application/json`.
- AC-01.3: On a 200 response, the session stores only `{ token, expiry, user: { id, firstName, lastName, email, roleId, branchId } }` in `chrome.storage.session`; all other user fields are discarded.
- AC-01.4: The password is never stored, logged, or transmitted outside of the login request body.
- AC-01.5: On login success, the side panel navigates to the search screen.
- AC-01.6: On a non-200 response, an error toast displays the `message` field from the response body, or a generic error message if `message` is absent.
- AC-01.7: A loading state is shown while the request is in flight; the submit button is disabled.
- AC-01.8: The session is considered expired when `Date.now() / 1000 >= expiry - 60`. On expiry or any HTTP 401, the session is cleared and the UI routes to the login screen.
- AC-01.9: The token is never written to any log call (verified by spy on `console.*`).

---

#### US-02 Search and Pick Client

**As a** staff member,
**I want to** search for a client by name or other identifier,
**so that** I can quickly find the right client to fill forms for.

**Acceptance Criteria:**
- AC-02.1: The search screen shows a record-type selector (Visa Applicant [default], Student, Lead), a free-text search input (`q`), and a results list.
- AC-02.2: Searching is debounced 300 ms and requires a minimum of 2 characters; requests with fewer characters are not sent.
- AC-02.3: A new search query cancels any in-flight request via AbortController; stale results never render.
- AC-02.4: Results are fetched from `GET /{recordType}?q={q}&limit=25` (and `page=` per the `PAGINATION` constant).
- AC-02.5: Each result row displays name, record type, and email or phone.
- AC-02.6: A "Load more" button appears when `loadedRows < count`; clicking it fetches the next page and appends results.
- AC-02.7: The filter bar is rendered from `FilterConfig[]` and is hidden while the config is empty (no filters are defined yet).
- AC-02.8: Loading, empty, and error states are shown with appropriate skeleton, message, and error toast.
- AC-02.9: Clicking a result row navigates to the user data screen for that client.

---

#### US-03 View Client Data

**As a** staff member,
**I want to** see all of a client's CRM data in the side panel, grouped by category,
**so that** I can review the data before filling forms.

**Acceptance Criteria:**
- AC-03.1: The user data screen shows the client's name, record type, a "Change client" button, a Fill all button, an Overwrite toggle, and an Auto-fill toggle.
- AC-03.2: Fields are grouped in accordion sections: Personal, Passport, Contact, Visa, Occupation, Sponsor & Nomination, Skills Assessment, CRM Status, Notes, Files, Other.
- AC-03.3: Each field row displays label and value, a copy button, a click-to-fill button, and a drag handle.
- AC-03.4: Empty fields (`null`, `""`, or whitespace-only) are hidden behind a "Show empty" toggle.
- AC-03.5: An in-panel search filter matches by field label or value.
- AC-03.6: Fields whose dates were derived from an ISO timestamp (not a plain date string) display a "verify" badge.
- AC-03.7: Internal fields (`id`, `userId`, `updatedBy`, `branchId`, `sourceId`, `createdAt`, `updatedAt`, `deletedAt`, `invoiceNumber`, `payment`, `paymentStatus`) are never shown in the UI.
- AC-03.8: Notes fields display plain text (HTML stripped); they show a copy button but no click-to-fill button and are not draggable.
- AC-03.9: Files render as links; they are not draggable or fillable.

---

#### US-04 Fill All

**As a** staff member,
**I want to** fill all mapped fields on the current ImmiAccount page in one click,
**so that** I can efficiently populate the form without clicking each field individually.

**Acceptance Criteria:**
- AC-04.1: Clicking "Fill all" fills every mapped field on the active ImmiAccount page (`https://online.immi.gov.au/*`) in DOM order.
- AC-04.2: Fields that already have a value are skipped unless the Overwrite switch is on.
- AC-04.3: After filling any field that can reveal conditional fields or trigger a re-render, the engine waits for the DOM to settle: MutationObserver quiet for 300 ms, hard timeout 3 s; locators are re-resolved after each settle.
- AC-04.4: Notes fields and file fields are never written by Fill all.
- AC-04.5: Empty values (null, "", whitespace) are never written.
- AC-04.6: The "Auto-fill each page" switch (default off), when enabled, automatically runs Fill all on each newly loaded ImmiAccount page while a client is selected.
- AC-04.7: Fill all never clicks Next, Save, Submit, ticks declarations, or touches CAPTCHAs.
- AC-04.8: A FillReport is produced after every Fill all run (see US-07).

---

#### US-05 Click to Fill

**As a** staff member,
**I want to** send a single value from the side panel to a specific ImmiAccount form field,
**so that** I can fill individual fields without triggering a full Fill all.

**Acceptance Criteria:**
- AC-05.1: The content script tracks the last focused form control on the ImmiAccount page via `focusin`.
- AC-05.2: Clicking the click-to-fill button on a side-panel field row sends that value to the currently focused form control; the fill always overwrites.
- AC-05.3: If no control is focused when click-to-fill is triggered, pick mode is entered: the cursor changes to crosshair, form controls are outlined on hover, and the next click on a control receives the value.
- AC-05.4: Pick mode is cancelled by pressing Escape or after a 15-second timeout (`PICK_MODE_TIMEOUT_MS`).
- AC-05.5: Pressing Enter on a focused field row in the side panel performs click-to-fill (keyboard alternative to drag).
- AC-05.6: A FillReport entry is produced for the filled field.

---

#### US-06 Drag and Drop

**As a** staff member,
**I want to** drag a value from the side panel and drop it onto any ImmiAccount form control,
**so that** I can fill individual fields flexibly regardless of focus state.

**Acceptance Criteria:**
- AC-06.1: Every non-notes, non-files field row in the side panel is draggable and sets two data transfer entries: `text/plain` (display value) and `application/x-immifill+json` (`{ profilePath, value }`).
- AC-06.2: The content script handles `dragover` by calling `preventDefault` on form controls and outlining the target; it handles `drop` in the capture phase, calling `preventDefault`.
- AC-06.3: On drop, the engine parses the JSON payload first; if unavailable (cross-document scenario), it falls back to `text/plain` plus the last drag's `profilePath` (sent via runtime message on `dragstart`).
- AC-06.4: The dropped value is routed through the transform engine so that selects, radios, and date controls are filled correctly.
- AC-06.5: Drag-and-drop fills always overwrite.
- AC-06.6: Drag handles have `aria-describedby` instructions for screen-reader users.
- AC-06.7: A FillReport entry is produced for the filled field.

---

#### US-07 Fill Report

**As a** staff member,
**I want to** see a summary of what was filled, skipped, not found, or failed after a fill action,
**so that** I can review results and correct any issues before submitting the form.

**Acceptance Criteria:**
- AC-07.1: After every Fill all, click-to-fill, or drag-and-drop action, a `FillReport` is produced with four categories: `filled`, `skipped`, `notFound`, and `failed: { field, reason }[]`.
- AC-07.2: The Fill report is displayed in a Sheet or Accordion in the side panel with counts and per-field lists.
- AC-07.3: Filled fields are highlighted green on the ImmiAccount page; fields with data but no match on the page are highlighted amber.
- AC-07.4: Field rows in the side panel receive a "used" badge once filled on the current page.
- AC-07.5: An `aria-live` region in the side panel announces fill results for screen-reader users.
- AC-07.6: Unresolvable country values (e.g. `"Charity"`) appear in `failed` with reason `failed: unrecognized country value`.
- AC-07.7: Fields skipped due to the Overwrite switch being off appear in `skipped`.

---

### 3. Non-Goals (§5.3)

The following are explicitly out of scope for this project:

1. **Auto-submitting or navigating** — The extension will never click Next, Save, or Submit on any ImmiAccount page.
2. **Ticking declarations** — Checkbox declaration fields will not be touched.
3. **CAPTCHA interaction** — The extension will not interact with any CAPTCHA challenge.
4. **Multi-browser support** — Only Google Chrome (MV3) is supported.
5. **Persistent applicant data storage** — Client data is not stored beyond the current browser session; `chrome.storage.session` is cleared on session expiry or logout.
6. **Backend changes** — This is an integration-only project; no CRM or ImmiAccount backend is modified.
7. **Filter implementation** — No CRM record filters are implemented in this release (FilterConfig is empty; filter bar is hidden).
8. **Detail endpoint** — No separate detail API call; client data is resolved from the search result cache.
9. **ImmiAccount automation beyond filling** — Navigation, pagination of ImmiAccount pages, and multi-page orchestration beyond the Auto-fill toggle are out of scope.

---

### 4. Scope Challenges and Risks

| # | Challenge / Risk | Severity | Mitigation |
|---|-----------------|----------|------------|
| R1 | **No ImmiAccount HTML fixtures exist.** The `docs/immi-pages/` folder contains only a README. All field map label names are EXPECTED and unverified. | High | Build fill engine generically; create synthetic test fixtures; ship field maps with `verified: false`; state prominently in final report. |
| R2 | **Auth header format is assumed** (`Authorization: Bearer <token>`). If the CRM uses a different scheme, all API calls will fail silently with 401s. | High | Auth header is a single named constant (`AUTH_HEADER_NAME`, `AUTH_HEADER_PREFIX`); smoke test will confirm or refute. |
| R3 | **Pagination param name is assumed** (`page`, 1-based). Wrong param means Load more returns the same page repeatedly. | Medium | Kept as named constant `PAGINATION`; smoke test tries `page=2` to verify. |
| R4 | **`student` and `lead` row schemas are unverified.** Only `visaApplicant` has a sample JSON. | Medium | Assumed same schema; schemas use `.passthrough()`; fix when samples are added. |
| R5 | **`country` field semantics are assumed** (passport country). Values are inconsistent (ISO alpha-3, free text like `"Charity"`). | Medium | Country rule resolves alpha-3 → alpha-2 → alias; unresolvable values reported as failed, not errored. |
| R6 | **CRM error response body shape is unknown.** | Low | Show `message` field if present in body, else show a generic error string. |
| R7 | **Cross-document drag and drop.** The custom MIME type `application/x-immifill+json` may be unavailable at drop time due to browser security restrictions across frames/documents. | Medium | Fall back to `text/plain` plus `profilePath` sent via runtime message on `dragstart`. |
| R8 | **ImmiAccount conditional field triggers are unknown.** Filling one field may reveal others or trigger a postback; re-render timing is unpredictable. | Medium | MutationObserver with 300 ms quiet period and 3 s hard timeout; re-resolve locators after each settle. |
| R9 | **`CRM_TIMEZONE` defaults to browser time zone.** Staff in different time zones filling the same ISO timestamp date may get different results. | Low | Flag `verify: true` on all timestamp-derived dates; display a verify badge in the UI. |
| R10 | **No refresh endpoint.** The 12-hour JWT cannot be silently renewed; long sessions will expire mid-use. | Low | Clear session and route to login on expiry; staff must re-authenticate. |

---

### 5. Field Map Verification Status

All ImmiAccount label names (Family name, Given names, Date of birth, Passport number, etc.) listed in the field mapping are **EXPECTED ONLY**. They have not been verified against real ImmiAccount HTML fixtures because no fixture files exist. Field maps will be shipped with `verified: false` and validated once real fixtures are available.

---

## Tech Plan

> Owned by the Architect. Requirements section above is owned by the Product Manager.

---

### 1. File Layout

```
immifill/
├── wxt.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── components.json                        # shadcn/ui config
├── vitest.config.ts
├── .eslintrc.cjs
├── .prettierrc
├── .gitignore
├── package.json
│
├── scripts/
│   └── smoke.ts                           # optional live smoke test (env-gated; skipped if vars absent)
│
├── src/
│   ├── entrypoints/
│   │   ├── background.ts                  # MV3 service worker — WXT requires default export
│   │   ├── content.ts                     # content script, immi.gov.au — WXT requires default export
│   │   └── sidepanel/
│   │       ├── index.html
│   │       ├── main.tsx                   # React root — WXT requires default export
│   │       ├── App.tsx
│   │       ├── screens/
│   │       │   ├── LoginScreen.tsx
│   │       │   ├── SearchScreen.tsx
│   │       │   ├── UserDataScreen.tsx
│   │       │   └── FillReportSheet.tsx
│   │       └── hooks/
│   │           ├── useSession.ts
│   │           ├── useSearch.ts
│   │           ├── useFill.ts
│   │           └── useProfile.ts
│   │
│   ├── shared/
│   │   ├── config.ts                      # ALL named constants — one place, see §2.1
│   │   ├── contracts/
│   │   │   ├── messages.ts                # typed chrome runtime message discriminated union
│   │   │   ├── fillReport.ts              # FillReport type + zod schema
│   │   │   ├── fieldMap.ts                # FieldMap, FieldEntry, LocatorStrategy, ControlType
│   │   │   ├── filterConfig.ts            # FilterConfig type; default empty array
│   │   │   └── recordType.ts             # RecordType union + RecordDefinition generic type
│   │   └── types/
│   │       └── applicantProfile.ts        # ApplicantProfile — all fields optional
│   │
│   ├── background/
│   │   ├── apiClient.ts                   # fetch wrapper: Bearer auth, error normalisation, no logging
│   │   ├── session.ts                     # chrome.storage.session read/write/clear + expiry check
│   │   └── handlers/
│   │       ├── authHandlers.ts            # login, logout, getSession message handlers
│   │       └── recordHandlers.ts          # search (AbortController), getDetail (memory cache)
│   │
│   ├── records/
│   │   ├── visaApplicant.ts               # id, label, path, rowSchema (zod), toApplicantProfile
│   │   ├── student.ts                     # ASSUMPTION A3: same fields as visaApplicant
│   │   ├── lead.ts                        # ASSUMPTION A3: same fields as visaApplicant
│   │   └── registry.ts                   # RecordRegistry map: RecordType → RecordDefinition
│   │
│   ├── profile/
│   │   └── applicantProfile.ts            # re-exports ApplicantProfile; helper types for mappers
│   │
│   ├── transforms/
│   │   ├── date.ts                        # date-only passthrough; ISO ts → YYYY-MM-DD via Intl
│   │   ├── country.ts                     # alpha-3/alpha-2/name/alias → select option text
│   │   ├── phone.ts                       # libphonenumber-js: international / split / raw fallback
│   │   ├── state.ts                       # AU state whitelist; non-matching → null (skip)
│   │   ├── notes.ts                       # DOMParser → textContent, collapse whitespace
│   │   └── empty.ts                       # isEmptyValue predicate: null | "" | whitespace
│   │
│   ├── filler/
│   │   ├── engine.ts                      # Fill all / click-to-fill / drop orchestration → FillReport
│   │   ├── locators.ts                    # label-text → element (label[for], wrap, table cell, aria)
│   │   ├── controls.ts                    # native value setter + input/change/blur dispatch
│   │   ├── settle.ts                      # MutationObserver quiet-300ms / hard-3s; re-resolve after
│   │   └── highlights.ts                  # green (filled) / amber (data present, not found) outlines
│   │
│   ├── field-maps/
│   │   ├── applicantDetails.ts            # pageMatcher + fields[]; verified: false (synthetic only)
│   │   ├── passportDetails.ts             # verified: false
│   │   ├── contactDetails.ts              # verified: false
│   │   ├── visaHistory.ts                 # verified: false
│   │   └── index.ts                       # ALL_FIELD_MAPS: FieldMap[]; getMapForPage(href) helper
│   │
│   └── components/
│       ├── ui/                            # shadcn/ui components (manual if CLI fails with WXT aliases)
│       │   ├── button.tsx
│       │   ├── input.tsx
│       │   ├── label.tsx
│       │   ├── accordion.tsx
│       │   ├── sheet.tsx
│       │   ├── skeleton.tsx
│       │   ├── switch.tsx
│       │   ├── toast.tsx
│       │   └── badge.tsx
│       ├── FieldRow.tsx                   # label + value + copy + click-to-fill + drag handle
│       ├── FilterBar.tsx                  # renders FilterConfig[]; hidden when empty
│       ├── RecordTypeTabs.tsx
│       ├── SearchResult.tsx
│       └── SectionAccordion.tsx
│
└── test/
    ├── acceptance/
    │   ├── search.test.ts                 # URL building, abort, stale result guard
    │   ├── mapping.test.ts                # sample row → ApplicantProfile completeness
    │   ├── transforms.test.ts             # all §9.2 transform cases
    │   ├── fillEngine.test.ts             # Fill all on fixtures; FillReport snapshot; conditional re-render
    │   ├── clickToFill.test.ts            # focused field + pick mode + Esc cancel
    │   ├── dragDrop.test.ts               # text/select/radio/date; both payload types
    │   └── session.test.ts                # expiry clears session; token never in console.*
    ├── fixtures/
    │   ├── applicantDetails.html          # SYNTHETIC — modelled on typical ImmiAccount markup
    │   ├── passportDetails.html           # SYNTHETIC
    │   ├── contactDetails.html            # SYNTHETIC
    │   └── visaHistory.html               # SYNTHETIC
    └── redteam/
        ├── weirdDom.test.ts               # missing labels, duplicate ids, dynamic re-renders
        ├── badData.test.ts                # null fields, unrecognised country, non-AU state, junk
        └── crossDocument.test.ts          # custom MIME unavailable → text/plain fallback
```

---

### 2. Contracts Overview (`src/shared/`)

All contracts are frozen after Phase 3. Changes require Orchestrator approval and a `DECISIONS.md` entry. No agent outside `src/shared/` may edit these files.

#### 2.1 `config.ts` — Named Constants

Every unknown or assumption lives here as a named export. Phase 4 engineers import from here; they never hardcode values.

| Export | Value | Source |
|---|---|---|
| `API_BASE_URL` | `"https://api.successedu.com.au/success-crm"` | CONFIRMED |
| `AUTH_HEADER_NAME` | `"Authorization"` | ASSUMPTION A1 |
| `AUTH_HEADER_PREFIX` | `"Bearer"` | ASSUMPTION A1 |
| `PAGINATION` | `{ param: "page", base: 1 }` | ASSUMPTION A2 |
| `SEARCH_LIMIT` | `25` | CONFIRMED |
| `SEARCH_DEBOUNCE_MS` | `300` | CONFIRMED |
| `SEARCH_MIN_CHARS` | `2` | CONFIRMED |
| `CRM_TIMEZONE` | `Intl.DateTimeFormat().resolvedOptions().timeZone` | ASSUMPTION A6 |
| `PICK_MODE_TIMEOUT_MS` | `15_000` | spec §8.2 |
| `DOM_SETTLE_QUIET_MS` | `300` | spec §8.2 |
| `DOM_SETTLE_HARD_TIMEOUT_MS` | `3_000` | spec §8.2 |

#### 2.2 `contracts/messages.ts` — Chrome Runtime Message Contracts

Typed discriminated union covering all side panel ↔ background ↔ content script communication. Zod schemas validate all incoming messages at each boundary.

```
// Side panel → Background (requests)
AuthLoginRequest       { type: "auth.login";      payload: { email, password } }
AuthLogoutRequest      { type: "auth.logout" }
AuthSessionRequest     { type: "auth.session" }
RecordsSearchRequest   { type: "records.search";  payload: { recordType, q, page, filters } }
RecordsGetRequest      { type: "records.get";     payload: { recordType, id } }

// Background → Content script (relay)
FillAllRequest         { type: "fill.all";         payload: { profile: ApplicantProfile, overwrite: boolean } }
ClickToFillRequest     { type: "fill.click";       payload: { profilePath: string, value: string } }
ScanPageRequest        { type: "fill.scan" }
EnterPickModeRequest   { type: "fill.pickMode";    payload: { profilePath: string, value: string } }

// Unified response wrapper
MessageResponse<T>     { ok: true; data: T } | { ok: false; error: string }

// Content script → Background (drag relay for cross-document MIME fallback)
DragStartMessage       { type: "fill.dragStart";   payload: { profilePath: string, value: string } }
```

#### 2.3 `types/applicantProfile.ts` — ApplicantProfile

```typescript
export type ApplicantProfile = {
  personal?:         { familyName?: string; givenNames?: string; dateOfBirth?: string }
  passport?:         { number?: string; dateOfIssue?: string; dateOfExpiry?: string; country?: string }
  contact?:          { email?: string; mobile?: string }
  address?:          { state?: string }
  visa?:             { inAustralia?: "Yes" | "No"; currentVisa?: string; currentVisaExpiry?: string;
                       proposed?: string; stream?: string; submitted?: string; granted?: string }
  employment?:       { nominatedOccupation?: string; anzscoCode?: string }
  sponsor?:          { name?: string; email?: string; phone?: string }
  nomination?:       { lodged?: string; decision?: string; status?: string }
  skillsAssessment?: { status?: string; submitted?: string; decision?: string }
  crm?:              { status?: string; csaStatus?: string; assignedDate?: string;
                       requestedDate?: string; dueDate?: string }
  notes?:            { remarks?: string; visaNote?: string; miscNote?: string } // plain text only
  files?:            Array<{ url: string; name: string; size: number; addedDate: string }>
  extras?:           Array<{ path: string; label: string; value: string }>
}
```

All date fields are `YYYY-MM-DD` strings. No `Date` objects in the profile.

#### 2.4 `contracts/fillReport.ts` — FillReport

```typescript
export type FillReport = {
  filled:   string[]                               // profilePaths successfully written
  skipped:  string[]                               // had a value but Overwrite=false
  notFound: string[]                               // locator found no element on this page
  failed:   Array<{ field: string; reason: string }> // transform error or write error
}
```

#### 2.5 `contracts/fieldMap.ts` — FieldMap

```typescript
export type LocatorStrategy =
  | { type: "label";     value: string }  // visible label text (normalised, case-insensitive)
  | { type: "aria-label"; value: string }
  | { type: "name-id";   value: string }  // name= or id= pattern (last resort)

export type ControlType = "text" | "textarea" | "select" | "radio" | "checkbox" | "date"

export type TransformName = "date" | "country" | "phone" | "state" | "notes"

export type FieldEntry = {
  profilePath: string           // dot-path into ApplicantProfile e.g. "personal.familyName"
  locator:     LocatorStrategy
  control:     ControlType
  transform?:  TransformName
  verified:    boolean          // false = synthetic fixture only
}

export type FieldMap = {
  id:          string
  pageMatcher: RegExp | string  // matched against location.href
  fields:      FieldEntry[]
  verified:    boolean          // false until confirmed against a real ImmiAccount HTML fixture
}
```

#### 2.6 `contracts/filterConfig.ts` — FilterConfig

```typescript
export type FilterConfig = {
  param:    string
  label:    string
  type:     "select" | "multiselect" | "date-range" | "text"
  options?: Array<{ value: string; label: string }>
}
// Active config: export const FILTER_CONFIG: FilterConfig[] = []
// Filter bar is hidden when FILTER_CONFIG.length === 0
```

#### 2.7 `contracts/recordType.ts` — RecordType

```typescript
export type RecordType = "visaApplicant" | "student" | "lead"

export type RecordDefinition<R> = {
  id:                 RecordType
  label:              string
  path:               string              // API path segment, e.g. "/visaApplicant"
  rowSchema:          ZodSchema<R>
  toApplicantProfile: (row: R) => ApplicantProfile
}
```

---

### 3. Phase 4 Task Breakdown by Role

All four engineers work in parallel. Each owns a disjoint file set. If a file boundary issue arises, stop and report to the Orchestrator — do not edit files you do not own.

---

#### 3.1 API & Auth Engineer

**File ownership:**
- `src/entrypoints/background.ts`
- `src/background/apiClient.ts`
- `src/background/session.ts`
- `src/background/handlers/authHandlers.ts`
- `src/background/handlers/recordHandlers.ts`
- `scripts/smoke.ts`
- `src/background/__tests__/` (unit tests)

**Responsibilities:**
1. `apiClient.ts`: typed fetch wrapper. Attaches `AUTH_HEADER_NAME: AUTH_HEADER_PREFIX <token>`. Normalises errors (use `message` from body if present, else generic string). Never logs token, password, or response bodies.
2. `session.ts`: read/write/clear `chrome.storage.session` storing only `{ token, expiry, user: { id, firstName, lastName, email, roleId, branchId } }`. Expiry check: `Date.now()/1000 >= expiry - 60`. On expiry or 401 → clear + signal `auth.expired`.
3. `authHandlers.ts`: `login` handler (POST /auth/login, store session, return stripped user object); `logout` (clear session); `getSession` (read + expiry check).
4. `recordHandlers.ts`: `search` handler (GET `/{type}?q=&limit=&page=`; one `AbortController` per logical request; stale results discarded); `getDetail` (resolve from in-memory `Map<"type:id", row>`).
5. `background.ts`: wire all handlers into `chrome.runtime.onMessage`; set `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`.
6. `smoke.ts`: runs only if `CRM_TEST_EMAIL` and `CRM_TEST_PASSWORD` are set. Logs in, calls each endpoint with `limit=1`, tries `page=2`, tries `q=test`, tries both `Bearer` and raw-token auth headers. Prints only status codes, `count`, and row key names — never values or the token.

**Unit test coverage required:**
- Session expiry logic (expired vs. valid)
- 401 response → session cleared
- New search aborts in-flight request
- Stale results not returned
- URL construction for q, page, filters

---

#### 3.2 Data Engineer

**File ownership:**
- `src/records/visaApplicant.ts`
- `src/records/student.ts`
- `src/records/lead.ts`
- `src/records/registry.ts`
- `src/profile/applicantProfile.ts`
- `src/transforms/date.ts`
- `src/transforms/country.ts`
- `src/transforms/phone.ts`
- `src/transforms/state.ts`
- `src/transforms/notes.ts`
- `src/transforms/empty.ts`
- `test/acceptance/mapping.test.ts`
- `test/acceptance/transforms.test.ts`

**Responsibilities:**
1. Zod row schemas: every field `.nullable().optional()`; schemas use `.passthrough()`. Base schema on `docs/api/samples/visa-applicant.json`. For `student` and `lead`, ASSUMPTION A3 applies (same schema); add a comment.
2. `toApplicantProfile(row)` for each record type per the mapping table in BUILD_PROMPT.md §7.3. Unmapped non-internal visible fields → `extras[]`. Internal fields (id, userId, updatedBy, branchId, sourceId, createdAt, updatedAt, deletedAt, invoiceNumber, payment, paymentStatus) are never mapped.
3. Transforms — all are pure named-export functions:
   - `date.ts`: date-only string (`YYYY-MM-DD`) → return as-is; never pass through `new Date()`. ISO timestamp → `Intl.DateTimeFormat(CRM_TIMEZONE)` → `YYYY-MM-DD`; return `{ value, verify: true }`. Test: `2026-09-16T18:15:00.000Z` → `"2026-09-17"` with `CRM_TIMEZONE="Asia/Kathmandu"`.
   - `country.ts`: resolve alpha-3 (`NPL`), alpha-2, exact/alias name against `<select>` option text. Use `i18n-iso-countries` + alias table as a named constant. Unresolvable (e.g. `"Charity"`) → return `null` with reason `"unrecognized country value"`.
   - `phone.ts`: parse E.164 with `libphonenumber-js`. Single input → international format. Split inputs → country code / area / number per fixture spec. Unparseable → raw value into single text input only.
   - `state.ts`: whitelist `["NSW","VIC","QLD","WA","SA","TAS","ACT","NT"]` plus full names. Non-matching (e.g. `"Phillip"`) → `null` (skip).
   - `notes.ts`: `new DOMParser().parseFromString(html,"text/html").body.textContent`; collapse runs of whitespace. Notes are display/copy only; never passed to fills.
   - `empty.ts`: `isEmptyValue(v: unknown): boolean` — true for `null`, `undefined`, `""`, whitespace-only string.
4. `registry.ts`: exports `RECORD_REGISTRY: Map<RecordType, RecordDefinition<unknown>>`.

**IMPORTANT:** `student.json` and `lead.json` samples do not exist. Document ASSUMPTION A3 in `ASSUMPTIONS.md`. Fix when samples are added by the team.

---

#### 3.3 Fill Engine Engineer

**File ownership:**
- `src/entrypoints/content.ts`
- `src/filler/engine.ts`
- `src/filler/locators.ts`
- `src/filler/controls.ts`
- `src/filler/settle.ts`
- `src/filler/highlights.ts`
- `src/field-maps/applicantDetails.ts`
- `src/field-maps/passportDetails.ts`
- `src/field-maps/contactDetails.ts`
- `src/field-maps/visaHistory.ts`
- `src/field-maps/index.ts`
- `test/fixtures/applicantDetails.html`
- `test/fixtures/passportDetails.html`
- `test/fixtures/contactDetails.html`
- `test/fixtures/visaHistory.html`
- `test/acceptance/fillEngine.test.ts`
- `test/acceptance/clickToFill.test.ts`
- `test/acceptance/dragDrop.test.ts`
- `test/redteam/weirdDom.test.ts`
- `test/redteam/badData.test.ts`
- `test/redteam/crossDocument.test.ts`

**Responsibilities:**
1. `locators.ts`: resolve element from `FieldEntry.locator` in order: (a) visible label text via `<label for>`, wrapping `<label>`, adjacent `<td>`/label cell — normalised, case-insensitive; (b) `aria-label` / `aria-labelledby`; (c) `name=` / `id=` pattern. Never rely on a raw generated ID alone.
2. `controls.ts`: write to form controls using the native prototype value setter (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, v)` and equivalents for `HTMLTextAreaElement`, `HTMLSelectElement`); then dispatch `new Event('input',{bubbles:true})`, `'change'`, `'blur'`. Handle: text, textarea, select (option text → value → alias table), radio groups, checkbox groups, date inputs (format per fixture), repeating sections via "Add another" click.
3. `settle.ts`: `waitForSettle(): Promise<void>` — attach `MutationObserver` to document; resolve when no mutations for `DOM_SETTLE_QUIET_MS`; reject/resolve after `DOM_SETTLE_HARD_TIMEOUT_MS`. Engine calls this after any field fill that can reveal conditional fields.
4. `highlights.ts`: add green outline (`immifill-filled` class) on `filled` fields; amber outline (`immifill-unfilled` class) on fields with data but no locator match. Clear all highlights before each Fill all run.
5. `engine.ts`: orchestrates three modes:
   - **Fill all**: iterate `FieldMap.fields` in DOM order, skip if value empty or field non-empty + `overwrite=false`, call `locators.ts` → `controls.ts`, call `settle.ts` after each fill, collect `FillReport`.
   - **Click to fill**: track last focused control via `focusin` listener; on `fill.click` message, fill that control directly or enter pick mode.
   - **Pick mode**: crosshair cursor, hover outlines, next click on a form control fills it; Esc or `PICK_MODE_TIMEOUT_MS` cancels.
   - **Drop handling**: `dragover` `preventDefault` on form controls + outline target; `drop` capture phase `preventDefault`; parse `application/x-immifill+json` first, fall back to `text/plain` + last `profilePath` from `dragstart` relay message.
6. `content.ts`: `chrome.runtime.onMessage` for `fill.all`, `fill.click`, `fill.scan`, `fill.pickMode`; on `dragstart`, send `DragStartMessage` to background to relay `profilePath`.
7. **CRITICAL — No real ImmiAccount HTML fixtures exist.** Create synthetic HTML fixtures in `test/fixtures/` modelled on typical ImmiAccount markup: `<label for="id">Label</label><input id="id">`, fields in table cells, `<select>`, radio groups, date inputs with `type="date"` or split day/month/year inputs. All field maps **must** be shipped with `verified: false`. This must be stated prominently in the final report.
8. `field-maps/index.ts`: exports `ALL_FIELD_MAPS: FieldMap[]`; exports `getMapForPage(href: string): FieldMap | undefined`.
9. Scan page feature in `content.ts`: on `fill.scan` message, collect `{ label, control, name, id, options?, frame }` for all form controls; write JSON to clipboard via `navigator.clipboard.writeText`.

---

#### 3.4 UI Engineer

**File ownership:**
- `src/entrypoints/sidepanel/App.tsx`
- `src/entrypoints/sidepanel/screens/LoginScreen.tsx`
- `src/entrypoints/sidepanel/screens/SearchScreen.tsx`
- `src/entrypoints/sidepanel/screens/UserDataScreen.tsx`
- `src/entrypoints/sidepanel/screens/FillReportSheet.tsx`
- `src/entrypoints/sidepanel/hooks/useSession.ts`
- `src/entrypoints/sidepanel/hooks/useSearch.ts`
- `src/entrypoints/sidepanel/hooks/useFill.ts`
- `src/entrypoints/sidepanel/hooks/useProfile.ts`
- `src/components/ui/` (all shadcn/ui components)
- `src/components/FieldRow.tsx`
- `src/components/FilterBar.tsx`
- `src/components/RecordTypeTabs.tsx`
- `src/components/SearchResult.tsx`
- `src/components/SectionAccordion.tsx`

**Responsibilities:**
1. `App.tsx`: shell routing — Login → Search → UserData based on session state. Header with logged-in user name and Logout button. Light/dark mode via `prefers-color-scheme` (Tailwind `dark:` classes).
2. `LoginScreen.tsx`: email + password fields, submit button, loading state (button disabled), error toast via `sonner`.
3. `SearchScreen.tsx`: record type selector (Visa Applicant / Student / Lead); `q` input with debounce from `useSearch`; collapsible `FilterBar` (hidden when `FILTER_CONFIG.length === 0`); results list with skeleton loading, empty state, error state; "Load more" button when `hasMore`.
4. `UserDataScreen.tsx`: client name + record type header; "Change client" button; Fill all button; Overwrite switch; Auto-fill switch; in-panel search filter; accordion sections (Personal, Passport, Contact, Visa, Occupation, Sponsor & Nomination, Skills Assessment, CRM Status, Notes, Files, Other). Notes fields: copy only, no click-to-fill button, not draggable. Files: links only.
5. `FieldRow.tsx`: label + value display; verify badge (shown when transform returned `verify: true`); copy button; click-to-fill button (triggers `fill.click` message); drag handle. Full row has `draggable` attribute; `ondragstart` sets `text/plain` and `application/x-immifill+json` and sends `DragStartMessage` via hook.
6. `FillReportSheet.tsx`: sheet overlay with counts (filled / skipped / notFound / failed) and per-field lists. `aria-live` region announces results summary.
7. `FilterBar.tsx`: renders `FilterConfig[]` as select/text/date-range inputs; active-filter chips; clear-all button. Hidden via CSS when length === 0.
8. All hooks send and receive typed messages using contracts from `src/shared/contracts/messages.ts`.
9. Accessibility requirements: every control has a `<label>`; full keyboard navigation with visible `:focus-visible` ring; Enter on `FieldRow` triggers click-to-fill; `aria-live` region for fill result announcements; drag handles have `aria-describedby` with drag instructions.
10. "Show empty" toggle: hide rows where `isEmptyValue(value)` is true; reveal on toggle.

---

### 4. Key Architectural Decisions

| Decision | Rationale |
|---|---|
| Background service worker is the sole owner of the token and all network calls | MV3 requirement; CORS irrelevant with host permissions; eliminates token leakage to page context |
| Side panel (not popup) for the UI | Popup closes when user clicks the ImmiAccount page; side panel persists |
| Content script injects no UI elements beyond outlines | Minimises XSS risk; all user-visible UI stays in the isolated side panel |
| Content script scope: `https://online.immi.gov.au/*` with `all_frames: true` | ImmiAccount may render form sections in iframes |
| No detail endpoint: cache search rows in background memory | API has no `/visaApplicant/:id`; `getDetail` resolves from `Map<"type:id", row>` |
| Every unknown is a named constant in `src/shared/config.ts` | Single change point when smoke test confirms/refutes assumptions A1 and A2 |
| Field maps shipped with `verified: false` | No real ImmiAccount HTML fixtures exist; only synthetic test fixtures |
| Native value setter + dispatched events | React/Vue/Angular forms need the native prototype setter to trigger framework change detection |
| AbortController per logical search request | Prevents stale results rendering when a new query supersedes an in-flight one |
| `student` and `lead` schemas assumed identical to `visaApplicant` | No samples exist (ASSUMPTION A3); one-file fix per record type when samples arrive |
| FilterConfig defaults to `[]`; filter bar hidden while empty | Filter param names are unknown; no invented filters |
| No default exports except WXT entrypoints | Enables tree-shaking and consistent named-import style |
| shadcn/ui components added manually if CLI fails | WXT path aliases may conflict with shadcn CLI; manual add is equivalent, noted in DECISIONS.md |

---

### 5. Open Issues and Risks

| # | Issue | Risk | Mitigation |
|---|---|---|---|
| R1 | No real ImmiAccount HTML fixtures | High — field maps unverified against real pages | `verified: false` flag; field inspector for re-mapping; state in final report |
| R2 | Auth header format unconfirmed (ASSUMPTION A1) | High — all calls will 401 if wrong | Named constants; smoke test confirms or refutes |
| R3 | `page` param name/base unconfirmed (ASSUMPTION A2) | Medium — pagination broken if wrong | Named constant `PAGINATION`; smoke test tries `page=2` |
| R4 | `student`/`lead` schemas unknown (ASSUMPTION A3) | Medium — extras[] may be wrong | `.passthrough()` on schema; one-file fix per type |
| R5 | ImmiAccount conditional field triggers unknown | Medium — fills out of order after re-render | MutationObserver + quiet/hard timeout; re-resolve after settle |
| R6 | Cross-document drag MIME type unavailable | Low — drag fails silently | `dragstart` relay via runtime message; `text/plain` + `profilePath` fallback |
