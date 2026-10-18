# ImmiFill – Assumptions

All assumptions are recorded here with their current status. Status values:
- **OPEN** — not yet verified; kept as a named constant or handled defensively
- **CONFIRMED** — verified against real data (sample JSON, smoke test, or HTML fixture)
- **REFUTED** — found to be incorrect; see notes for the correct value

Update this file after the smoke test (`scripts/smoke.ts`) runs and after any real ImmiAccount fixtures are added.

---

## API / Auth Assumptions

| # | Assumption | Source | Status | Notes |
|---|-----------|--------|--------|-------|
| A1 | Authenticated requests use `Authorization: Bearer <token>` as the auth header | `docs/api/auth.md`, BUILD_PROMPT.md §6.2 | **OPEN** | Smoke test will try both `Bearer <token>` and raw token and confirm/refute. Constants: `AUTH_HEADER_NAME`, `AUTH_HEADER_PREFIX` in `src/shared/config.ts`. |
| A2 | Pagination uses query param `page` (1-based) | `docs/api/records.md` | **OPEN** | Smoke test tries `page=2` to verify the param name and base. Constant: `PAGINATION` in `src/shared/config.ts`. |
| A3 | `student` and `lead` record endpoints return rows with the same field schema as `visaApplicant` | `docs/api/records.md` | **OPEN** | No `student.json` or `lead.json` sample exists. Schemas use `.passthrough()` to absorb extra fields safely. Fix when samples are available. |

---

## Field Mapping Assumptions

| # | Assumption | Source | Status | Notes |
|---|-----------|--------|--------|-------|
| A4 | The CRM `country` field maps to the applicant's country of passport | `docs/field-map.md` | **OPEN** | No ImmiAccount fixture exists to verify the label or the field's semantic meaning. The country rule handles alpha-3, alpha-2, and alias name resolution; unresolvable values are reported as `failed`. |
| A5 | All ImmiAccount form label names (Family name, Given names, Date of birth, Passport number, Date of issue, Date of expiry, Country of passport, Email address, Mobile / cell phone, Is the applicant currently in Australia?, Nominated occupation, ANZSCO code, State or province) are expected only and have not been verified against real HTML fixtures | `docs/field-map.md`, BUILD_PROMPT.md §8.2 | **OPEN** | `docs/immi-pages/` contains only a README — no HTML fixture files exist. Field maps will be shipped with `verified: false`. All label names must be verified once real fixtures are saved. |

---

## Transform / Data Assumptions

| # | Assumption | Source | Status | Notes |
|---|-----------|--------|--------|-------|
| A6 | `CRM_TIMEZONE` defaults to the browser's local time zone when converting ISO timestamps to calendar dates | `docs/field-map.md`, BUILD_PROMPT.md §7.4 | **OPEN** | This is configurable as a named constant. Dates derived from ISO timestamps are flagged `verify: true` and shown with a badge in the UI. Staff should confirm timezone-sensitive dates before submitting. |

---

## Infrastructure / Behaviour Assumptions

| # | Assumption | Source | Status | Notes |
|---|-----------|--------|--------|-------|
| A7 | The CRM API error response body may contain a `message` string field; if absent, a generic error is shown | BUILD_PROMPT.md §6.2, CONTEXT.md §1 | **OPEN** | Error response shape is not documented. Implementation uses `message` if present, generic string otherwise. |
| A8 | ImmiAccount conditional field triggers (fields that appear/disappear based on other field values) behave predictably within a 300 ms quiet period after a DOM mutation, with a 3 s hard timeout | BUILD_PROMPT.md §8.2 | **OPEN** | No real ImmiAccount fixtures exist to characterise timing. Synthetic test fixtures simulate a re-render. Constants: `DOM_SETTLE_QUIET_MS` (300), `DOM_SETTLE_HARD_TIMEOUT_MS` (3000). |
| A9 | Cross-document drag and drop: the custom MIME type `application/x-immifill+json` may be unavailable at drop time due to browser security restrictions | BUILD_PROMPT.md §8.2 | **OPEN** | Mitigated by sending `profilePath` via runtime message on `dragstart` and falling back to `text/plain` on drop if the custom type is missing. |

---

## Confirmed Facts (from recon)

The following were confirmed from sample data and API documentation during Phase 1 recon and are **not** assumptions:

| Fact | Source |
|------|--------|
| Base URL is `https://api.successedu.com.au/success-crm` | `docs/api/auth.md` |
| Auth endpoint is `POST /auth/login` with `content-type: application/json` body `{ email, password }` | `docs/api/auth.md` |
| Auth response shape: `{ token, user: {...}, expiry }` where `expiry` is unix seconds | `docs/api/auth.md` |
| JWT lifetime is 12 hours (exp - iat = 43200); no refresh endpoint exists | `docs/api/auth.md` |
| Browser-specific headers (origin, referer, sec-*) are NOT required for API calls | `docs/api/auth.md` |
| Record endpoints return envelope `{ count: number, rows: Row[] }` | `docs/api/records.md` |
| `limit=25` is the confirmed page size | `docs/api/records.md` |
| `q` param enables free-text search; debounce 300 ms, minimum 2 chars | `docs/api/records.md` |
| There is no separate detail endpoint; detail is resolved from in-memory search row cache | `docs/api/records.md` |
| `visaApplicant` row schema confirmed from `docs/api/samples/visa-applicant.json` | Sample file |
| All `visaApplicant` fields are nullable/optional | Sample file |
| Internal fields (`id`, `userId`, `updatedBy`, `branchId`, `sourceId`, `createdAt`, `updatedAt`, `deletedAt`, `invoiceNumber`, `payment`, `paymentStatus`) are never displayed or filled | `docs/field-map.md` |

---

## How to Update This File

1. **After smoke test runs** (`scripts/smoke.ts` with `CRM_TEST_EMAIL` / `CRM_TEST_PASSWORD` set):
   - Update A1 (auth header format confirmed or refuted — note the correct value if refuted).
   - Update A2 (pagination param confirmed or refuted — note the correct param name if refuted).
   - Update `src/shared/config.ts` constants to match confirmed values.

2. **After ImmiAccount HTML fixtures are saved** to `docs/immi-pages/`:
   - Update A4 (country field label verified or corrected).
   - Update A5 (all label names — mark each label verified or note the correct label text).
   - Re-run field-map unit tests and update `verified: false` to `verified: true` per field.

3. **After `student.json` or `lead.json` samples are available**:
   - Update A3 (schema confirmed or note divergent fields).
   - Add any additional Zod schema refinements to the record files.
