# ImmiFill — Phase 1 demo and E2E suite

**TL;DR** — `pnpm build && pnpm demo` runs the extension against all six fixtures in a real
headed Chromium with a real Chrome side panel, and writes `demo-artifacts/` (video +
17 screenshots) plus a summary table. `pnpm e2e` is the same machinery as 36 assertions.
Verified: **36 e2e tests passed, 30/30 demo fills matched** — 2026-09-26, `.output/chrome-mv3-dev`.
Data source: `StaticDataSource` (`WXT_DATA_SOURCE` unset = `static`). No backend, no network,
no Phase 2 code involved.

---

## Commands

| Command | Does |
| --- | --- |
| `pnpm build` | Required first — the config refuses to run without `.output/chrome-mv3-dev`. |
| `pnpm demo` | Headed, paced run → `demo-artifacts/` + summary table on stdout. ~40 s. |
| `pnpm e2e` | The assertion suite (36 tests, ~30 s) + `playwright-report/`. |

The fixture server starts itself (Playwright `webServer` → `pnpm fixtures`); nothing has to be
started by hand. Both need a display: MV3 service workers do not run in headless Chromium.
`DISPLAY` must be set; on a headless CI box use `xvfb-run -a pnpm e2e`.

`demo-artifacts/` is regenerated from scratch on every `pnpm demo`. It is **not** in
`.gitignore` — add it there before committing, or delete it after reviewing.

## What the artifacts show

| File | Shows |
| --- | --- |
| `00-run.webm` | Video of the whole run — fixture tab only (see *Not covered*). |
| `01`–`02` | Side panel: person search results; pre-flight missing list for Sparse Applicant. |
| `03`–`15` | Each fixture before → after, with the `immifill-*` outlines: green `filled`, amber `missing`, purple `not_found`, red `rejected`. |
| `05`, `16` | The fill report grouped by status — **paths and counts only, never values**. |
| `15`, `16` | `traps.html` after a fill: three red, one green, declaration checkbox still unticked. |
| `17` | Record mode: two captured selectors with payload paths assigned. |

## Phase 1 acceptance criteria (`prd.md`) → proof

| # | Criterion | Proven by | Observed |
| --- | --- | --- | --- |
| 1 | With the backend off, the extension searches, fills and reports using only bundled data | `panel.spec.ts` (search → select → Fill → report, no network) + the whole matrix | **PASS** |
| 2 | Every mapped field ends `filled`/`missing`/`not_found`/`rejected`, no silent writes | `fill.spec.ts` matrix asserts the exact `path=status` list against `expectedResults()`, and the final DOM value of every `filled` field | **PASS** (30/30 fills) |
| 3 | Dates render in each mapping's `format`; selects match by value or label | `plain` (`dd/MM/yyyy`, `#country` by label, `#visaType` by value), `postback` (`dd MMM yyyy`), `repeat` (`yyyy-MM-dd`), `immi-saved` (`dd/MM/yyyy`, select by label `NEPAL`) | **PASS** |
| 4 | Postback and React fixtures keep filled values after re-render | `fill.spec.ts › postback.html …` (regression guard on `waitStable`) and `› react.html — the value reaches React state` (asserts the `#state` dump, not the DOM) | **PASS** |
| 5 | A new site can be enabled at runtime and mapped with Record mode without editing code | Record mode: demo step 17 captures two fields and assigns payload paths. **Runtime host grant is NOT proven** — see below | **PARTIAL** |
| 6 | The extension never triggers navigation or submission | `safety.spec.ts`: exact §9.3 statuses, `#declaration` unchecked, click listeners on `#next`/`#pay`/`#declaration` and `submit` never fire, `framenavigated` count 0, no dialog (the form's submit handler alerts) | **PASS** |
| 7 | Switching `WXT_DATA_SOURCE` touches no fill-engine code | **Not proven here** — out of Phase 1 scope for this suite | **NOT TESTED** |

Demo summary, as printed (counts are `filled / missing / not_found / rejected`):

```
30 fills, 30 matched the expected statuses exactly.
RESULT: PASS — every mapped field ended filled / missing / not_found / rejected as expected.
```

## How the side panel is driven (and the honest caveat)

`chrome.sidePanel` cannot be opened by Playwright, and the obvious workaround is a trap:

- Opening `chrome-extension://<id>/sidepanel.html` as a **plain tab** makes the panel inert.
  `entrypoints/background.ts` drops any message whose `sender.tab` is set, so every request
  answers `undefined`. Even if it did route, `chrome.tabs.query({active:true,currentWindow:true})`
  would resolve to the panel's own tab and the fill would target the wrong page.

The suite avoids both by opening the **genuine** side panel: a throwaway extension tab adds a
button, a Playwright click on it is a trusted user gesture, and its handler calls
`chrome.sidePanel.open({ tabId })` for the fixture tab; the throwaway tab then closes. The real
side panel has no tab, so the router accepts it and `activeTab()` resolves to the fixture tab —
the exact path a human exercises. No `entrypoints/` file was changed to make this work.

Playwright does not attach to the side-panel target, so it is driven over raw CDP
(`PanelClient` in `tests/e2e/harness.ts`): `Runtime.evaluate` for clicks and reads,
`Page.captureScreenshot` for the panel screenshots.

**Caveat:** because the panel is not a Playwright page, it is **absent from `00-run.webm`** —
the video records the fixture tab only. Panel state lives in the numbered PNGs instead.

## Not covered

| Gap | Why |
| --- | --- |
| Fixture #6 — the real Google Form | Needs a Google account and a live third-party page. Manual, per `prd.md`. `traps.html` reproduces its hostile pattern (unnamed input, label-only resolution) and that *is* asserted. |
| Live ImmiAccount | Phase 3. `fixtures/immi-saved/` is a synthetic WebForms replica, not a saved government page. |
| **Enable on this site** (runtime host grant on `127.0.0.1:5175`) | `chrome.permissions.request()` raises a native Chrome dialog that Playwright cannot accept. Manual test only — README §5. |
| `WXT_DATA_SOURCE=api` (acceptance criterion 7) | Phase 2, gated. Nothing in this suite imports or activates `lib/data/crm-api.ts`. |
| Panel pixels in the video | See the caveat above. |
| `react.html` without internet | The fixture loads React 18 from unpkg. Offline, that test fails for lack of a CDN, not because of the extension. |

## Expected-value derivation

`expectedResults()` in `tests/e2e/harness.ts` re-derives each field's expected status from the
mapping and the payload: no value → `missing`; a value → `filled`, unless the field is in
`DESIGNED_REJECTS` (only `traps.html`, transcribed from `docs/CONTRACTS.md` §9.3). It reuses
`formatValue()` from the engine for date/array formatting — the unit suite is what proves
`formatValue` itself; the E2E's job is proving the formatted value reaches the page. Statuses
come from the real `FillReport`, values from the real DOM.
