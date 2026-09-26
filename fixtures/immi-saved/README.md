# immi-saved fixture

TL;DR: `index.html` here is a **synthetic replica**, not a real saved ImmiAccount page.
Verified against: `data/mappings/immi-saved.json` v1, 2026-09-26. 11 mapped fields.

## What it replicates

| Real ImmiAccount pattern | Where in `index.html` |
| --- | --- |
| WebForms ids | `ctl00_ContentPlaceHolder1_txtFamilyName` and siblings |
| WebForms names with `$` | `ctl00$ContentPlaceHolder1$txtFamilyName` |
| Hidden postback state | `#__VIEWSTATE`, `#__EVENTTARGET`, `#__EVENTVALIDATION` |
| Nested `<table>` layout | `td.label` + input cell per row |
| `<label for=...>` association | every text input and select |
| Postback on a dependent select | `#ctl00_ContentPlaceHolder1_ddlPassportCountry` rebuilds `#ctl00_ContentPlaceHolder1_pnlPassportDetails` after 500-1500 ms |
| Page heading for detection | `<h1 id="ctl00_ContentPlaceHolder1_lblPageHeading">Personal details - Applicant</h1>` |
| Uppercase option labels | `NEPAL`, `INDIA` - forces case-insensitive label matching |

## Swapping in a real saved page

1. In a real ImmiAccount session: **File > Save Page As > "Web Page, Complete"** into
   this directory. Keep the `_files` asset folder beside the html.
2. Scrub before committing: clear `__VIEWSTATE` / `__EVENTVALIDATION` values and every
   real applicant value. Synthetic people only, per `docs/CONTRACTS.md` §8.
3. Replace `index.html`, or keep both and point
   `data/mappings/immi-saved.json` → `pageMatch.urlIncludes` at the new filename.
4. Re-point selectors. The mapping keys off, in this order:
   - `selector`: `#<id>` first, `[name="..."]` when the id is generated per session
   - `fallbackLabel`: the `<label for=...>` text, used when the selector misses
   Change `selector` per field; leave `fallbackLabel` as the safety net.
5. Update `pageMatch.headingText` if the real page's `<h1>`/`<legend>` text differs.
   Detection matches case-insensitively on a substring (`docs/CONTRACTS.md` §4).
6. Bump `version` in the mapping.

## Quirk

The replica's postback fires on `change` and re-creates the panel with `innerHTML` of a
page-owned constant string. A real page does a full form POST and reloads. The engine
behaviour exercised is the same: **element references captured before the postback go stale**.
