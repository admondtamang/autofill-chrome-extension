# ImmiFill – Recon Digest  (2026-10-18)
<!-- Sources: docs/api/{auth,records}.md, docs/api/samples/visa-applicant.json, docs/field-map.md, docs/immi-pages/README.md, BUILD_PROMPT.md -->

## 1. API – Confirmed Facts

### Base URL
`https://api.successedu.com.au/success-crm`
Constant name: `API_BASE_URL`

### Auth Endpoint

| Method | Path         | Headers                                          | Body                             |
|--------|--------------|--------------------------------------------------|----------------------------------|
| POST   | /auth/login  | content-type: application/json, accept: application/json | `{ email: string, password: string }` |

**Response 200 shape:**
```
{
  token: string (JWT HS256),
  user: { id, profileUrl, firstName, lastName, email, phone, roleId, branchId, isActive, ...many more },
  expiry: number (unix seconds)
}
```
- JWT payload: `{ user: { id, email, roleId, branchId }, iat, exp }`. Lifetime = 12h (exp - iat = 43200).
- No refresh endpoint exists (CONFIRMED).
- Browser-specific headers (origin, referer, sec-*) are NOT required.

**Session storage (chrome.storage.session):**
Store only: `{ token, expiry, user: { id, firstName, lastName, email, roleId, branchId } }`
Discard all other user fields.

**Expiry check:** `Date.now() / 1000 >= expiry - 60` → treat as expired.
**On expiry or HTTP 401:** clear session, route to login screen.
**Error shape:** unknown; use `message` if present, else generic error.
**Security:** never log token, password, or response bodies.

### Authenticated Request Header
ASSUMPTION: `Authorization: Bearer <token>`
Constants: `AUTH_HEADER_NAME`, `AUTH_HEADER_PREFIX` (one place, changeable).

---

## 2. Record Endpoints (all GET)

| Registry id      | Label         | Path             |
|-----------------|---------------|------------------|
| `visaApplicant` (default) | Visa Applicant | `/visaApplicant` |
| `student`       | Student       | `/student`       |
| `lead`          | Lead          | `/lead`          |

**Response envelope (all endpoints):**
```ts
{ count: number, rows: Row[] }
```

### Query Params

| Param    | Status      | Notes                                                                 |
|----------|-------------|-----------------------------------------------------------------------|
| `limit`  | CONFIRMED   | Use 25                                                                |
| `q`      | CONFIRMED   | Free-text search; server decides which fields are matched             |
| `page`   | ASSUMPTION  | 1-based. Constant: `PAGINATION`. `hasMore = loadedRows < count`      |
| filters  | TODO        | Names/values unknown. FilterConfig empty; filter bar hidden for now. |

**No detail endpoint.** `getDetail(type, id)` resolves from an in-memory cache of search rows, keyed by `type:id`.

**UX:** debounce `q` 300ms, minimum 2 chars. New search cancels in-flight request (AbortController per request id).

---

## 3. CRM Row Schema (visaApplicant – CONFIRMED from sample)

All fields are nullable/optional. Schemas: `.nullable().optional()` with `.passthrough()`.

### Identity
| Field       | Sample Values               | Type        |
|-------------|----------------------------|-------------|
| `firstName` | "Test", "Shelley"          | string      |
| `middleName`| "Zahir", null              | string/null |
| `lastName`  | "One", "Grimes"            | string      |
| `dob`       | "2026-09-02", null         | date-string/null |

### Passport
| Field       | Sample Values               | Type        |
|-------------|----------------------------|-------------|
| `passport`  | "Zephr", null              | string/null |
| `issueDate` | "2026-09-01", null         | date-string/null |
| `expiryDate`| "2026-09-23", null         | date-string/null |
| `country`   | "NPL", "Charity", null     | string/null |

### Contact
| Field   | Sample Values          | Type        |
|---------|------------------------|-------------|
| `email` | "testone@gmail.com"    | string      |
| `phone` | "+61432111111" (E.164) | string/null |

### Visa
| Field          | Sample Values                          | Type        |
|----------------|----------------------------------------|-------------|
| `currentVisa`  | "AAT Hearing", null                    | string/null |
| `visaExpiry`   | "2026-09-16T18:15:00.000Z", null       | ISO ts/null |
| `proposedVisa` | "AAT Lodgement", null                  | string/null |
| `visaStream`   | "Employer sponsored", null             | string/null |
| `location`     | "Onshore", null                        | string/null |
| `visaSubmitted`| "2026-09-01", null                     | date-string/null |
| `visaGranted`  | "2026-09-28", null                     | date-string/null |

### Occupation
| Field        | Sample Values                       | Type        |
|--------------|-------------------------------------|-------------|
| `occupation` | "Chief Executive or Managing Director" | string/null |
| `anzsco`     | "111111", "111211", null            | string/null |

### Sponsor / Nomination
| Field               | Sample Values              | Type        |
|---------------------|----------------------------|-------------|
| `sponsorName`       | "Illana", null             | string/null |
| `sponsorEmail`      | "byledopoty@yopmail.com"   | string/null |
| `sponsorPhone`      | "+17026453361", null       | string/null |
| `nominationLodged`  | "2026-09-15", null         | date-string/null |
| `nominationDecision`| "2026-09-30", null         | date-string/null |
| `nominationStatus`  | "Ready To Submit", null    | string/null |

### Skills Assessment
| Field              | Sample Values | Type        |
|--------------------|---------------|-------------|
| `sbsStatus`        | null          | string/null |
| `sbsSubmissionDate`| null          | date-string/null |
| `sbsDecisionDate`  | null          | date-string/null |

### CRM Workflow (display only)
| Field          | Sample Values             | Type        |
|----------------|---------------------------|-------------|
| `status`       | "Submitted", "Collecting Docs", null | string/null |
| `statusDate`   | null                      | date-string/null |
| `csaStatus`    | "Collecting Docs", null   | string/null |
| `requestedDate`| null                      | date-string/null |
| `dueDate`      | null                      | date-string/null |
| `assignedDate` | "2026-10-04"              | date-string |
| `state`        | "Phillip", null           | string/null |

### Notes (HTML strings)
| Field      | Sample Values              | Type        |
|------------|----------------------------|-------------|
| `remarks`  | "<p>notes added!</p>", null| HTML/null   |
| `visaNote` | null                       | HTML/null   |
| `miscNote` | "<p>uyjvh...</p>", null    | HTML/null   |

### Files
```ts
files: Array<{ url: string, name: string, size: number, addedDate: string }> | null
```

### Internal (never displayed, never filled)
`id`, `userId`, `updatedBy`, `branchId`, `sourceId`, `createdAt`, `updatedAt`, `deletedAt`,
`invoiceNumber`, `payment`, `paymentStatus`
(`id` is used as internal row key only.)

---

## 4. CRM Field → ApplicantProfile Mapping

Labels marked * are EXPECTED only — not verified against real fixtures (none exist).

| CRM Field(s)                    | ApplicantProfile Path           | ImmiAccount Label *                        | Transform           |
|---------------------------------|---------------------------------|--------------------------------------------|---------------------|
| `lastName`                      | personal.familyName             | Family name                                | trim                |
| `firstName` + `middleName`      | personal.givenNames             | Given names                                | join non-empty / space |
| `dob`                           | personal.dateOfBirth            | Date of birth                              | date rule           |
| `passport`                      | passport.number                 | Passport number                            | trim, uppercase     |
| `issueDate`                     | passport.dateOfIssue            | Date of issue                              | date rule           |
| `expiryDate`                    | passport.dateOfExpiry           | Date of expiry                             | date rule           |
| `country` (ASSUMPTION: passport)| passport.country                | Country of passport                        | country rule        |
| `email`                         | contact.email                   | Email address                              | trim, lowercase     |
| `phone`                         | contact.mobile                  | Mobile / cell phone                        | phone rule          |
| `location`                      | visa.inAustralia                | In Australia?                              | Onshore→Yes, Offshore→No, else skip |
| `currentVisa`                   | visa.currentVisa                | Current visa (if present)                  | none                |
| `visaExpiry`                    | visa.currentVisaExpiry          | Visa expiry date (if present)              | date rule           |
| `proposedVisa`, `visaStream`    | visa.proposed, visa.stream      | display only                               | none                |
| `visaSubmitted`, `visaGranted`  | visa.submitted, visa.granted    | display only                               | date rule           |
| `occupation`                    | employment.nominatedOccupation  | Nominated occupation                       | none                |
| `anzsco`                        | employment.anzscoCode           | ANZSCO code (if present)                   | digits only         |
| `sponsorName/Email/Phone`       | sponsor.name/email/phone        | Sponsor details (if present)               | phone rule for phone|
| `nominationLodged/Decision/Status` | nomination.lodged/decision/status | display only                           | date rule / none    |
| `sbsStatus/SubmissionDate/DecisionDate` | skillsAssessment.*      | display only                               | date rule / none    |
| `state`                         | address.state                   | State or province                          | AU state rule       |
| `status`, `csaStatus`, `assignedDate`, `requestedDate`, `dueDate` | crm.* | display only      | date rule / none    |
| `remarks`, `visaNote`, `miscNote` | notes.*                       | display/copy only, never Fill all          | strip HTML          |
| `files`                         | files[]                         | links only, not fillable or draggable      | none                |
| all other visible fields        | extras[]                        | shown by section, draggable, click-to-fill | none                |

---

## 5. Transform Rules Summary

**Date rule:**
- `YYYY-MM-DD` → leave as string, do NOT pass through `new Date()` (UTC shift risk).
- ISO timestamp → convert via `Intl.DateTimeFormat` in `CRM_TIMEZONE` (default: browser TZ); flag `verify: true`.
- Known case: `2026-09-16T18:15:00.000Z` → `2026-09-17` at `Asia/Kathmandu`.

**Country rule:**
- Resolve: ISO alpha-3 → alpha-2 → exact/alias name → target `<select>` option text.
- Library: `i18n-iso-countries` + alias table.
- Unresolvable (e.g. `"Charity"`): do not fill; report `failed: unrecognized country value`.

**Phone rule:**
- Parse E.164 with `libphonenumber-js`.
- Single input: international format. Split inputs: country code / area code / number per fixture.
- Unparseable: raw value into single text input only.

**AU state rule:**
- Fill only for NSW, VIC, QLD, WA, SA, TAS, ACT, NT (code or full name).
- Otherwise skip (e.g. `"Phillip"` is rejected).

**Notes:** strip HTML via `DOMParser` → `textContent`, collapse whitespace. Display/copy only, never Fill all.

**Empty:** `null`, `""`, whitespace-only → empty. Hidden behind "Show empty" toggle. Never written.

**No business validation:** do not block or correct impossible data combinations.

---

## 6. ImmiAccount Fixtures Status

**ABSENT.** `docs/immi-pages/` contains only `README.md` with instructions for how to save fixtures.
No HTML fixture files exist (no `01-applicant.html`, `02-passport.html`, etc.).

**Impact (per BUILD_PROMPT.md §8.2):**
- Fill engine must be built generically.
- Synthetic fixtures must be created in `test/fixtures/` modeled on typical ImmiAccount markup.
- Field maps must be shipped marked `verified: false`.
- This must be stated prominently in the final report.
- All ImmiAccount label names in field-map.md are EXPECTED only — none have been verified against real fixtures.

---

## 7. Assumptions Log

| # | Assumption                                      | Source                   | Status |
|---|-------------------------------------------------|--------------------------|--------|
| A1 | Auth header is `Authorization: Bearer <token>` | auth.md, BUILD_PROMPT.md | OPEN — smoke test will confirm/refute |
| A2 | Pagination param is `page` (1-based)           | records.md               | OPEN — smoke test will confirm/refute |
| A3 | `student` and `lead` rows have same fields as `visaApplicant` | records.md | OPEN — no samples yet |
| A4 | `country` maps to country of passport          | field-map.md             | OPEN — no fixture to verify label |
| A5 | All ImmiAccount labels (Family name, Given names, etc.) are expected only | field-map.md | OPEN — no HTML fixtures |
| A6 | `CRM_TIMEZONE` defaults to browser time zone   | field-map.md             | OPEN — configurable constant |

---

## 8. Gaps and Unknowns

| Gap                                                        | Blocking? | Resolution path                                  |
|------------------------------------------------------------|-----------|--------------------------------------------------|
| Error response body shape from CRM is unknown              | No        | Show `message` if present, else generic          |
| Filter param names and allowed values unknown              | No        | FilterConfig empty; filter bar hidden             |
| No `student.json` or `lead.json` samples                  | No        | ASSUMPTION same schema; fix when samples added   |
| No ImmiAccount HTML fixtures                               | Yes (field maps) | Build generically; synthetic fixtures; `verified: false` |
| Auth header format unverified                              | No        | Smoke test; kept as named constant               |
| `page` param name and base unverified                      | No        | Smoke test; kept as named constant               |
| `state` field locale/format varies ("Phillip" not AU state)| No        | AU state rule skips non-matching values          |
| `country` values inconsistent (ISO alpha-3, free text)     | No        | Country rule handles; unresolvable → failed      |
| ImmiAccount conditional field triggers unknown             | No        | MutationObserver + 300ms quiet + 3s hard timeout |

---

## 9. Key Constants to Define (src/shared/config.ts)

- `API_BASE_URL`
- `AUTH_HEADER_NAME`, `AUTH_HEADER_PREFIX`
- `PAGINATION` (page param name and base)
- `CRM_TIMEZONE`
- `SEARCH_LIMIT` (25)
- `SEARCH_DEBOUNCE_MS` (300)
- `SEARCH_MIN_CHARS` (2)
- `PICK_MODE_TIMEOUT_MS` (15000)
- `DOM_SETTLE_QUIET_MS` (300)
- `DOM_SETTLE_HARD_TIMEOUT_MS` (3000)

---

## 10. ApplicantProfile Shape Reference

```
personal         { familyName, givenNames, dateOfBirth }
passport         { number, dateOfIssue, dateOfExpiry, country }
contact          { email, mobile }
address          { state }
visa             { inAustralia, currentVisa, currentVisaExpiry, proposed, stream, submitted, granted }
employment       { nominatedOccupation, anzscoCode }
sponsor          { name, email, phone }
nomination       { lodged, decision, status }
skillsAssessment { status, submitted, decision }
crm              { status, csaStatus, assignedDate, requestedDate, dueDate }
notes            { remarks, visaNote, miscNote }   // plain text after HTML strip
files            { url, name, size, addedDate }[]
extras           { path, label, value }[]          // remaining non-internal visible fields
```
All profile fields are optional. All dates are `YYYY-MM-DD` strings in the profile.
