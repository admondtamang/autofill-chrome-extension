# Fixture mappings

TL;DR: 6 mappings, one per fixture, all `pageMatch.host = localhost:5174`.
Verified against: `docs/CONTRACTS.md` §1 `FormMapping`, 2026-09-26. 38 field entries total.

| Mapping | Fixture | What it proves | Edge case exercised |
| --- | --- | --- | --- |
| `plain.json` | `fixtures/plain.html` | Every native handler: text, date, select, radio, checkbox, textarea. Select matched by **label** (`#country`, opaque `c-0577` values) and by **value** (`#visaType`). | Baseline. `required` on `name.given`, `name.family`, `dob`, `citizenship.label` → Sparse Applicant produces 3 pre-flight misses (`dob`, `citizenship.label`). Date format `dd/MM/yyyy`. |
| `postback.json` | `fixtures/postback.html` | `waitAfterMs` + `waitStable`: the passport section does not exist until the country select postback lands 500-1500 ms later, and its nodes are re-created. | Stale element references. Invalid Passport Applicant hits `required: true` on `passport.number` (null). Date format `dd MMM yyyy`. |
| `react.json` | `fixtures/react.html` | Native value-setter trick. React re-renders every 300 ms, so a plain `el.value = x` is reverted; `#state` must show the value in React state. Controlled `<select>` matched by value (`citizenship.code`). | Framework-owned state. Unicode Applicant proves non-ASCII survives a React round-trip. |
| `repeat.json` | `fixtures/repeat.html` | `repeatGroup` + `addButtonSelector` + `rowSelector`. Page starts with ZERO rows, so one Add click per `addressHistory` item, then per-row index-based names `addr[n].street`. | Complete Applicant has 2 rows, Sparse has 0 (no clicks at all). Date format `yyyy-MM-dd`. |
| `immi-saved.json` | `fixtures/immi-saved/index.html` | Real-shaped ImmiAccount selectors: `ctl00_ContentPlaceHolder1_*` ids, `$`-separated names, table layout, `__VIEWSTATE`, a postback select, `fallbackLabel` on every fragile id. Options are UPPERCASE (`NEPAL`) so label matching must be case-insensitive. | Long Name Applicant: 41-char family name with apostrophe and hyphens against `maxlength="60"`. Date format `dd/MM/yyyy`. |
| `traps.json` | `fixtures/traps.html` | Safety rules. Maps **only** the 4 safe fields; the submit button, Pay input and `#declaration` checkbox are deliberately absent from the mapping and must never be touched. | `#contactPhone` reformats on blur → `rejected`. `#citizenshipLimited` has no matching option → `rejected`. `#occupation` does not exist; only `fallbackLabel: "Occupation"` reaches the hashed-class input. `#lockedAddress` is `readonly` → `rejected`. |

## Notes

- Date formats differ on purpose across fixtures (`dd/MM/yyyy`, `dd MMM yyyy`, `yyyy-MM-dd`)
  to prove `formatValue` is driven by the mapping, not hardcoded.
- `traps.json` is the only mapping expected to produce non-`filled` statuses for every
  field on a complete payload. That is the pass condition, not a failure.
- `repeat.json` path convention: `addressHistory[].street` — the `repeatGroup` prefix plus
  the per-row key. `selector` is resolved **within** each `rowSelector` element.
