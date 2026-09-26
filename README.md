# ImmiFill — Chrome MV3 extension

Fills web forms (starting with Australian ImmiAccount) from Success CRM person
records. **You review every page and submit it yourself — the extension never
clicks Next, Submit, Pay, or a declaration checkbox.**

**Status: Phase 1 complete** (bundled synthetic data, no backend, no login).
Phase 2 (live CRM API) is **not started** and is gated on owner approval.

- Scope and requirements: `prd.md`
- Frozen cross-module contracts: `docs/CONTRACTS.md`
- Working conventions and gotchas: `CLAUDE.md`

---

## 1. Prerequisites

| Need | Version | Check |
| --- | --- | --- |
| Node | 22 LTS or newer | `node -v` |
| pnpm | 11.x | `pnpm -v` |
| Chrome / Chromium | 114+ (Side Panel API) | `chrome://version` |

## 2. Install and build

```bash
pnpm install     # postinstall runs `wxt prepare`
pnpm build       # → .output/chrome-mv3-dev/
```

## 3. Load the extension in Chrome

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the **`.output/chrome-mv3-dev`** folder (not the repo root)
5. Click the ImmiFill toolbar icon to open the side panel

`pnpm dev` does all of this in a throwaway Chrome profile with hot reload.
After a `pnpm build`, hit **Reload** on the extension card to pick up changes.

## 4. Start the test pages

```bash
pnpm fixtures      # http://localhost:5174  — six test forms
```

Optionally, in a second shell:

```bash
pnpm fixtures:alt  # http://127.0.0.1:5175 — same pages, NOT a declared origin
```

The alt origin exists to test the runtime permission grant: the extension is not
allowed there until you click **Enable on this site**.

---

## 5. Manual test walkthrough

Open <http://localhost:5174> and work through the pages. For each one: open the
side panel, pick a person, click **Fill this page**.

The five bundled people are synthetic and each breaks something different:

| Person | Type | Exercises |
| --- | --- | --- |
| Complete Applicant | lead | every field present — the happy path |
| Sparse Applicant | lead | mostly null — the pre-flight "missing" list |
| Long O'Connor-Fitzwilliam-… | student | 41-char surname, apostrophe + hyphen |
| Zoé Núñez-श्रेष्ठ | visa | accents and Devanagari |
| Invalid Applicant | skill-assessment | null passport, expired dates |

### What to check on each page

| # | Page | Expected result |
| --- | --- | --- |
| 1 | `plain.html` | All fields green. One select matches by **label**, another by **value**. |
| 2 | `postback.html` | Picking a country re-renders after 0.5–1.5 s; the passport fields **still fill** afterwards. |
| 3 | `react.html` | Values survive React re-render — confirm in the `#state` JSON dump, not just the input. |
| 4 | `repeat.html` | Starts with zero rows; one "Add another address" click per address, filled per row. |
| 5 | `immi-saved/` | ImmiAccount-style WebForms markup (`ctl00_…` ids) fills correctly. |
| 6 | `traps.html` | **See below — most fields are *supposed* to fail.** |

### `traps.html` — the safety page (read this before reporting a bug)

This page is designed so a naive filler does damage. Correct behaviour is
**three red fields and one green**:

| Field | Expected | Why |
| --- | --- | --- |
| Phone | `rejected` | the page reformats the value on blur — the engine catches it |
| Citizenship | `rejected` | no matching option in the select |
| Occupation | `filled` | no usable id/name; resolved by label text |
| Address | `rejected` | the input is readonly |

**Also verify, every time:** the page did **not** navigate, the **Declaration**
checkbox is still unticked, and **Next** / **Pay** were never clicked. That is
the product's core legal guarantee.

### Colour key

| Colour | Status | Meaning |
| --- | --- | --- |
| Green | `filled` | written and verified |
| Grey | `missing` | this person has no value for it |
| Amber | `not_found` | the field is not on the page |
| Red | `rejected` | written but the page changed or refused it |

Every mapped field always ends as exactly one of these. A silent mis-fill is the
failure this product exists to prevent — if you ever see a field change with no
status, that is a bug worth reporting.

### Other things to try

- **Pre-flight** — select *Sparse Applicant* on `plain.html`. Required values
  they lack are listed **before** you fill.
- **Undo** — fill any page, then click **Undo**. Prior values come back.
- **Unsupported page** — open any unmapped site. The panel says so and the Fill
  button stays disabled.
- **Enable on this site** — open <http://127.0.0.1:5175/plain.html>. Filling is
  blocked until you click **Enable on this site** and accept Chrome's prompt.
- **Record mode** — toggle it on, click fields on a page, assign each a payload
  path, then **Copy JSON** to get a mapping you can save to
  `data/mappings/<site>.json`. No code changes needed to support a new form.

---

## 6. Automated checks

```bash
pnpm typecheck         # wxt prepare && tsc --noEmit
pnpm test              # Vitest + jsdom unit suite
pnpm check:synthetic   # fails if data/people.json looks like real client data
pnpm build             # dev manifest
```

Current state: **72 unit tests passing**, typecheck and build clean.

---

## 7. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `ERR_PNPM_IGNORED_BUILDS` on install | `pnpm-workspace.yaml` must keep `allowBuilds: {esbuild: true}` (pnpm 11 moved it out of `package.json`). |
| Side panel is blank | Reload the extension card, then reopen the panel. Check the panel's own devtools (right-click → Inspect). |
| "Unsupported page" on a fixture | Fixtures must be served from **localhost:5174** — opening the `.html` file directly (`file://`) will not match any mapping. |
| Fill button disabled | You need both a selected person **and** a detected page. The button states the reason. |
| Nothing fills on the alt origin | Expected. Click **Enable on this site** first — that is the feature. |
| Changes not showing up | `pnpm build`, then **Reload** on `chrome://extensions`. |

## 8. Safety rules (not optional)

- The extension never submits, navigates, pays, or ticks a declaration.
- Applicant data stays in service-worker memory for one fill, then is cleared.
  It is never written to storage, logged, or printed.
- The fill report shows **field paths only — never values**.
- `data/people.json` is synthetic only. **Never put real client data in this
  repo, and never put synthetic people into a live government application.**
