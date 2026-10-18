# Field mapping and data rules

Target ImmiAccount labels below are EXPECTED labels. Confirm every one against `docs/immi-pages/*.html` and the field inspector output. Never ship a locator that hasn't been checked against a fixture.

## CRM row → ApplicantProfile → ImmiAccount

| CRM field(s)                 | ApplicantProfile path            | Expected ImmiAccount label                        | Transform |
|------------------------------|----------------------------------|---------------------------------------------------|-----------|
| `lastName`                   | `personal.familyName`            | Family name                                       | trim |
| `firstName` + `middleName`   | `personal.givenNames`            | Given names                                       | join non-empty with one space |
| `dob`                        | `personal.dateOfBirth`           | Date of birth                                     | date rule |
| `passport`                   | `passport.number`                | Passport number                                   | trim, uppercase |
| `issueDate`                  | `passport.dateOfIssue`           | Date of issue                                     | date rule |
| `expiryDate`                 | `passport.dateOfExpiry`          | Date of expiry                                    | date rule |
| `country`                    | `passport.country` (ASSUMPTION: country of passport) | Country of passport / Nationality of passport holder | country rule |
| `email`                      | `contact.email`                  | Email address                                     | trim, lowercase |
| `phone`                      | `contact.mobile`                 | Mobile / cell phone (may be split into country code, area code, number) | phone rule |
| `location`                   | `visa.inAustralia`               | Is the applicant currently in Australia?          | `Onshore` → Yes, `Offshore` → No, else skip |
| `currentVisa`                | `visa.currentVisa`               | Current visa (if present on page)                 | none |
| `visaExpiry`                 | `visa.currentVisaExpiry`         | Visa expiry date (if present on page)             | date rule |
| `occupation`                 | `employment.nominatedOccupation` | Nominated occupation                              | none |
| `anzsco`                     | `employment.anzscoCode`          | ANZSCO code (if present on page)                  | digits only |
| `sponsorName/Email/Phone`    | `sponsor.name/email/phone`       | Sponsor details (if present on page)              | phone rule for phone |
| `state`                      | `address.state`                  | State or province                                 | AU state rule |
| `proposedVisa`, `visaStream` | `visa.proposed`, `visa.stream`   | (display only, helps the user pick the right form)| none |

Everything else visible goes to `extras` and is shown under its section ("Visa", "Nomination", "Skills assessment", "CRM status", "Notes", "Other"). It stays draggable and click-to-fill.

## Transform rules

**Date rule.** Any date field may arrive as `YYYY-MM-DD` or as a full ISO timestamp (`2026-09-16T18:15:00.000Z`).
- Date-only strings: treat as plain strings. NEVER pass them through `new Date()`, because UTC parsing shifts the day in negative-offset time zones.
- Timestamps: convert to a calendar date in `CRM_TIMEZONE` (a constant, default = browser time zone) using `Intl.DateTimeFormat`. Mark the value with a "verify date" badge in the UI.
  - Observed: `2026-09-16T18:15:00.000Z` is exactly midnight on 2026-09-17 at UTC+05:45. The CRM stores local midnight from the entering user's browser, so the intended date is the 17th, not the 16th.
- Output: format into whatever ImmiAccount's date controls expect, as found in the fixtures.

**Country rule.** Values are inconsistent: ISO alpha-3 (`NPL`), and free text that may not be a country at all (`Charity`).
- Resolve in this order: ISO alpha-3, then ISO alpha-2, then exact or alias name match, against the option text of the target `<select>`. Use `i18n-iso-countries` plus a small alias table (e.g. "Korea, South", "Viet Nam", "Hong Kong (SAR of China)").
- Unresolvable values: do NOT fill. Report as `failed: "unrecognized country value"` and show the raw value with a warning badge.

**Phone rule.** Parse E.164 with `libphonenumber-js`.
- Single phone input: fill the international format.
- Split inputs: fill country code (digits, no `+`), area code, and number separately as the fixture dictates.
- Unparseable values: fill the raw value only into a single free-text input; otherwise report as failed.

**AU state rule.** Only fill when the value matches an AU state/territory name or code (NSW, VIC, QLD, WA, SA, TAS, ACT, NT). Otherwise skip and report.

**HTML notes.** `remarks`, `visaNote`, `miscNote` contain HTML. Strip tags via `DOMParser` → `textContent` and collapse whitespace. These values are display, copy, and drag only, never part of Fill all.

**Files.** Render `files[]` as links (name + size, open in new tab). They are not draggable or fillable.

**Empty values.** `null`, `""`, and whitespace-only values count as empty. Hide them behind the "Show empty" toggle. Fill all never writes empty values.

**No business validation.** Test data contains impossible combinations (e.g. a passport expiring before the visa grant date). Do not block or "correct" values. Fill what the CRM holds.
