# ImmiFill

A Chrome MV3 extension for Success Education staff. It reads client data from the Success CRM and fills Australian Department of Home Affairs ImmiAccount forms at `https://online.immi.gov.au/`.

---

## Contents

1. [Setup](#1-setup)
2. [Load unpacked in Chrome](#2-load-unpacked-in-chrome)
3. [How to add a new record type](#3-how-to-add-a-new-record-type)
4. [How to add a filter](#4-how-to-add-a-filter)
5. [How to build a field map using the field inspector](#5-how-to-build-a-field-map-using-the-field-inspector)
6. [Assumptions and known limitations](#6-assumptions-and-known-limitations)
7. [Optional smoke test](#7-optional-smoke-test)

---

## 1. Setup

**Prerequisites**

- Node.js 22 or later
- npm (bundled with Node)

**Install dependencies**

```bash
npm install
```

**Build the extension**

```bash
npm run build
```

Output is written to `.output/chrome-mv3/`.

**Type-check**

```bash
npm run typecheck
```

**Run the test suite**

```bash
npm test
```

All three commands must exit with zero errors before loading the extension.

---

## 2. Load unpacked in Chrome

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the `.output/chrome-mv3` directory inside this repository.
5. The ImmiFill extension icon appears in the toolbar. Click it to open the side panel.

After making code changes, run `npm run build` again, then click the refresh icon on the extension card in `chrome://extensions`.

---

## 3. How to add a new record type

The extension supports three record types out of the box: `visaApplicant`, `student`, and `lead`. To add another:

**Step 1 — Create the record file**

Add `src/records/<yourType>.ts`. The file must export a `RecordDefinition` object with:

| Field | Type | Purpose |
|---|---|---|
| `id` | `RecordType` | Unique string identifier (add it to the union in `src/shared/contracts/recordType.ts`) |
| `label` | `string` | Human-readable name shown in the UI |
| `path` | `string` | API path segment, e.g. `"/yourType"` |
| `rowSchema` | `ZodSchema` | Zod schema for a single API row; use `.passthrough()` and mark all fields `.nullable().optional()` |
| `toApplicantProfile` | `(row) => ApplicantProfile` | Maps the raw row to the shared profile shape |

See `src/records/visaApplicant.ts` for a complete example.

**Step 2 — Register it**

Open `src/records/registry.ts` and add one line to the `RECORD_REGISTRY` map:

```typescript
RECORD_REGISTRY.set("yourType", yourTypeDefinition);
```

That is all. The search screen record-type selector and all API calls derive from the registry automatically.

**Notes**

- `toApplicantProfile` must never map internal fields (`id`, `userId`, `updatedBy`, `branchId`, `sourceId`, `createdAt`, `updatedAt`, `deletedAt`, `invoiceNumber`, `payment`, `paymentStatus`).
- Unmapped non-internal visible fields should be placed in `extras[]`.
- If no sample JSON exists for your record type, document the assumption in `ASSUMPTIONS.md` and add `.passthrough()` to the schema so unexpected fields are absorbed safely.

---

## 4. How to add a filter

Filters appear in the collapsible filter bar on the search screen. The bar is hidden when no filters are defined.

**File to edit:** `src/shared/contracts/filterConfig.ts`

Add an entry to the `FILTER_CONFIG` array:

```typescript
export const FILTER_CONFIG: FilterConfig[] = [
  {
    param:   "visaSubclass",        // query param sent to the CRM API
    label:   "Visa subclass",       // label shown in the UI
    type:    "select",              // "select" | "multiselect" | "date-range" | "text"
    options: [
      { value: "482", label: "482 TSS" },
      { value: "186", label: "186 ENS" },
    ],
  },
];
```

**Important:** The `param` field must match the query parameter name that the CRM API accepts. Confirm the exact parameter name with the CRM API team before adding a filter. The filter bar sends these params verbatim; an incorrect name will produce incorrect results without a visible error.

No other code changes are required. The `FilterBar` component reads `FILTER_CONFIG` at render time.

---

## 5. How to build a field map using the field inspector

Field maps tell the fill engine which ImmiAccount form field corresponds to which piece of client data. Every field map shipped with the extension is marked `verified: false` — see [section 6](#6-assumptions-and-known-limitations) for why.

### Step 1 — Scan the page

1. Navigate to the ImmiAccount form page you want to map.
2. Click the ImmiFill extension icon to open the side panel.
3. Open the overflow menu (three-dot or similar) and click **Scan page**.
4. The extension copies a JSON array to your clipboard. Each element describes one form control:

```json
[
  {
    "label":   "Family name",
    "control": "text",
    "name":    "applicant_familyName",
    "id":      "fld_123",
    "frame":   "main"
  },
  {
    "label":   "Country of passport",
    "control": "select",
    "name":    "passport_country",
    "id":      "fld_456",
    "options": ["Afghanistan", "Albania", ...],
    "frame":   "main"
  }
]
```

### Step 2 — Write the field map

Create `src/field-maps/<pageName>.ts`. Use the scanned labels and control types to populate the `fields` array. Start with `verified: false`.

```typescript
import type { FieldMap } from "@/shared/contracts/fieldMap";

export const applicantDetailsMap: FieldMap = {
  id:          "applicantDetails",
  pageMatcher: /online\.immi\.gov\.au\/.*applicant-details/,
  verified:    false,   // set to true only after confirming against real HTML
  fields: [
    {
      profilePath: "personal.familyName",
      locator:     { type: "label", value: "Family name" },
      control:     "text",
      verified:    false,
    },
    {
      profilePath: "passport.country",
      locator:     { type: "label", value: "Country of passport" },
      control:     "select",
      transform:   "country",
      verified:    false,
    },
  ],
};
```

### Step 3 — Register the map

Open `src/field-maps/index.ts` and add your map to the `ALL_FIELD_MAPS` array.

### Step 4 — Verify against real HTML

Once you have confirmed each label against the real ImmiAccount page HTML:

1. Set `verified: true` on each `FieldEntry` you have confirmed.
2. Set `verified: true` on the `FieldMap` itself only when **all** entries are confirmed.
3. Update `ASSUMPTIONS.md` (assumption A5) to record which labels have been verified.

**Locator strategy priority** (used by the fill engine):

1. Visible label text via `<label for>`, wrapping `<label>`, or adjacent table cell — normalised, case-insensitive.
2. `aria-label` / `aria-labelledby`.
3. `name=` or `id=` attribute (last resort).

Prefer `type: "label"` wherever possible. Use `type: "name-id"` only when no visible label exists.

---

## 6. Assumptions and known limitations

Full details are in [ASSUMPTIONS.md](./ASSUMPTIONS.md). Key points:

**All field maps are `verified: false`.**
No real ImmiAccount HTML fixture files exist. The field maps shipped with this extension were written against synthetic HTML fixtures modelled on expected ImmiAccount markup. Every label name (`Family name`, `Given names`, `Date of birth`, `Passport number`, etc.) is an expectation, not a confirmed value. Use the field inspector workflow (section 5) to verify each label against the real page and update `verified` flags accordingly.

**Open assumptions that affect runtime behaviour:**

| Assumption | Impact if wrong | How to fix |
|---|---|---|
| A1: Auth header is `Authorization: Bearer <token>` | All API calls return 401 | Change `AUTH_HEADER_NAME` / `AUTH_HEADER_PREFIX` in `src/shared/config.ts` |
| A2: Pagination uses `page=` (1-based) | "Load more" returns duplicate results | Change `PAGINATION` constant in `src/shared/config.ts` |
| A3: `student` and `lead` rows share the `visaApplicant` schema | Unmapped fields may appear in extras | Update the schema files when samples are available |
| A6: Dates derived from ISO timestamps use the browser's local timezone | Timezone-sensitive dates may be off by one day | Set `CRM_TIMEZONE` constant or confirm timezone with the API team |

**Non-goals (out of scope):**

- Auto-submitting forms, clicking Next/Save/Submit, ticking declarations, or solving CAPTCHAs.
- Multi-browser support (Chrome MV3 only).
- Storing client data beyond the current browser session.
- Implementing CRM record filters (filter bar is hidden; `FILTER_CONFIG` is empty pending API confirmation).

---

## 7. Optional smoke test

The smoke test exercises the live CRM API. It runs only when credentials are present in the environment; it is skipped automatically otherwise.

**Setup**

Copy the example env file and fill in your credentials:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```
CRM_TEST_EMAIL=your@email.com
CRM_TEST_PASSWORD=yourpassword
```

**Run**

```bash
npm run smoke
```

The script logs in, calls each record endpoint with `limit=1`, tries `page=2`, and attempts both auth header formats. It prints only HTTP status codes, response `count`, and row key names — never credential values or the session token.

**After the smoke test completes:**

- Update `ASSUMPTIONS.md` entries A1 and A2 with confirmed or refuted values.
- If an assumption is refuted, update the corresponding constant in `src/shared/config.ts`.
- Re-run `npm run typecheck && npm test && npm run build` to verify nothing is broken.
