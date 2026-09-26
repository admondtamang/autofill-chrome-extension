# ImmiFill — demo and E2E suite (Phase 1 + Phase 2)

**TL;DR** — `pnpm build && pnpm demo` runs the extension against all six fixtures in a real
headed Chromium with a real Chrome side panel, and writes `demo-artifacts/` (video +
17 screenshots) plus a summary table. `pnpm e2e` is the same machinery as 36 assertions.
Verified: **36 e2e tests passed, 30/30 demo fills matched** — 2026-09-26, `.output/chrome-mv3-dev`.
Data source: `StaticDataSource` (`WXT_DATA_SOURCE` unset = `static`). No backend, no network,
no Phase 2 code involved.

**Phase 2**: `pnpm e2e:api` runs the SAME suite against `CrmApiDataSource` + the mock CRM —
**45 passed** (the 36 Phase 1 tests, unchanged and identical in outcome, + 9 §10 tests).
Verified 2026-09-26, `.output/api-mv3-dev`. See [Phase 2](#phase-2--wxt_data_sourceapi) below.

---

## Commands

| Command | Does |
| --- | --- |
| `pnpm build` | Required first — the config refuses to run without `.output/chrome-mv3-dev`. |
| `pnpm demo` | Headed, paced run → `demo-artifacts/` + summary table on stdout. ~40 s. |
| `pnpm e2e` | The Phase 1 assertion suite (36 tests, ~30 s) + `playwright-report/`. |
| `pnpm build:api` | Phase 2 build → `.output/api-mv3-dev` (a separate dir, so neither build clobbers the other). |
| `pnpm e2e:api` | `build:api`, then the same suite + `api.spec.ts` against the mock CRM (45 tests, ~35 s). |

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
| 7 | Switching `WXT_DATA_SOURCE` touches no fill-engine code | `api.spec.ts › criterion 7`: `git status --porcelain -- lib/fill-engine` is empty, **and** `content-scripts/content.js` (which is where the whole engine ships — it has no import path to `lib/data`) has the same SHA-256 in both builds | **PASS** (Phase 2) |

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
| `WXT_DATA_SOURCE=api` in **this** (`pnpm e2e`) run | By design: `pnpm e2e` stays a pure Phase 1 run and nothing in it imports `lib/data/crm-api.ts`. Phase 2 is `pnpm e2e:api`. |
| Panel pixels in the video | See the caveat above. |
| `react.html` without internet | The fixture loads React 18 from unpkg. Offline, that test fails for lack of a CDN, not because of the extension. |

## Phase 2 — `WXT_DATA_SOURCE=api`

**P2 exit criterion (`prd.md`)**: *"Same E2E suite passes with `WXT_DATA_SOURCE=api` against
staging."* No staging host exists; the contract-faithful mock CRM stands in, which
`docs/CONTRACTS.md` §10.4 specifies as the substitution.

### How to run

```bash
pnpm build      # static → .output/chrome-mv3-dev   (criterion 7 needs both builds present)
pnpm e2e        # Phase 1 — 36 passed
pnpm e2e:api    # builds .output/api-mv3-dev, boots the mock, signs in — 45 passed
```

`pnpm e2e:api` starts `pnpm mock-crm` itself as a second Playwright `webServer`
(readiness probe: `GET /immifill/mappings` → `401`, which also proves the auth gate is on
before a single test runs). The two builds live in separate `.output` dirs, so neither run
clobbers the other; `launchApp()` additionally refuses to start if the loaded build's mode
disagrees with `IMMIFILL_MODE` (probe: `LOGOUT` answers `not supported` in a static build).

### Parity result

**Identical.** `pnpm e2e:api` re-runs `fill.spec.ts`, `panel.spec.ts` and `safety.spec.ts`
**unmodified** — same 36 tests, same `expectedResults()` in `tests/e2e/harness.ts`, no forked
expectations anywhere. The only difference is how the app is reached: the harness signs in
through the real side-panel login form (`login-email` / `login-password` / `login-submit`) →
`LOGIN` → service worker → `CrmApiDataSource.login()` → `POST /auth/login`. Every subsequent
search, payload, mapping and audit is a real HTTP round trip to the mock.

```
36 passed  (pnpm e2e,     static)
45 passed  (pnpm e2e:api, api = the same 36 + 9 below)
```

### §10 behaviours → the test that proves each

All in `tests/e2e/api.spec.ts` (ignored by `playwright.config.ts` unless `IMMIFILL_MODE=api`).

| §  | Behaviour | Test | How it is proven |
| --- | --- | --- | --- |
| 10.1 | Login wall blocks filling | `no session › an api build with no session…` | No `fill-button` in the panel; `SESSION` → `signedIn:false`; a direct `FILL` message answers `{ok:false,error:'unauthorized'}` and `#given` stays empty |
| 10.1 | Bad credentials | `no session › bad credentials…` | Panel shows *Email or password not recognised.*, no `session-expired` note, and `chrome.storage.session` holds no token |
| 10.1 | **The token never crosses the port** | `the token never reaches the side panel` | Reads the real token out of the worker, then dumps everything the panel HAS — `LOGIN` reply, `SESSION` reply, `localStorage`, `sessionStorage`, full panel DOM — and asserts the token string and any `"token"` key are absent. `LOGIN` keys are exactly `user`+`expiry`; `SESSION` keys exactly `signedIn`+`user`+`expiry` |
| 10.3 | ETag → `304` | `mapping cache › a second mapping load…` | Wraps `fetch` inside the service worker before the first authenticated call, so the transition is observed, not inferred: the first `/immifill/mappings` is a cold `200`, every later one is `304`, and a `304` still yields a usable index (detection keeps working) |
| 10.3 | Bundled fallback | `mapping fallback › a 500 on the mapping routes…` | `POST /__fail/mappings?on=1`, then detection AND a full fill still succeed — asserted against the *same* `expectedResults()` the Phase 1 matrix uses, plus the final DOM value of every `filled` field |
| 10.3(4) | **A 401 is never masked by the fallback** | `401 is never masked › a revoked token…` | The fallback is armed (`__fail/mappings?on=1`) *and* the stored token is revoked. `DETECT` must answer `{ok:false,error:'unauthorized'}` — a bundled-mapping success here would be the §10.3(4) violation |
| 10.2 | `401` → login form, not a generic error | `401 is never masked › the panel falls back…` | After that 401 the worker has cleared the session; the panel's own next call (the re-detect a tab navigation triggers) puts it back on the login form showing *Your session expired* — and **not** the credential error |
| — | PRD criterion 7 | `criterion 7 — switching WXT_DATA_SOURCE…` | `git status --porcelain -- lib/fill-engine` is empty, and `content-scripts/content.js` — where the entire engine ships, with no import path to `lib/data` — has an identical SHA-256 in both builds |

Revocation is simulated by overwriting the token in `chrome.storage.session` with a bogus
value, leaving `expiry` in the future: the request really is sent, the mock really answers
`401`, and the client-side expiry shortcut is deliberately bypassed so the **server** 401 path
is the one under test.

### Harness accommodation you should know about

`ensureCrmHostPermission()` in `tests/e2e/harness.ts` adds `http://localhost:5176/*` to the
loaded api build's `manifest.json` before launch. This is **not** cosmetic:

- The dev manifest declares only `http://localhost:5174/*` plus
  `optional_host_permissions: ['<all_urls>']`; without a matching host permission every
  `CrmApiDataSource` fetch dies as `Failed to fetch` (CORS), and sign-in fails.
- The only runtime grant the product offers — *Enable on this site* — grants the **active
  tab's** origin. The CRM is never a tab, so a dev build has no in-product way to reach an
  arbitrary `WXT_CRM_BASE`.
- The production manifest already declares the CRM host
  (`https://api.successedu.com.au/*`), so the patch models production rather than papering
  over a production gap. **Open item for Phase 3**: `wxt.config.ts` should derive the dev
  manifest's CRM host permission from `WXT_CRM_BASE` so `pnpm dev:api` works by hand too.

### What the mock does NOT prove versus real staging

| Not proven | Why it matters |
| --- | --- |
| **Real CRM field names** | `CrmRow` in `lib/data/crm-api.ts` carries a `ponytail:` comment saying the `id`/`first_name`/`last_name`/`email`/`status` shape is *assumed* — no backend has ever confirmed it. The mock re-serves `data/people.json` **through that same assumed shape**, so the mapping is asserted against itself. First contact with staging is where it gets tested. |
| **Real payload shape** | `GET /immifill/payload/...` returns a verbatim `ApplicantPayload` from `data/people.json`. A real CRM will need a translation layer; none of it is exercised here. |
| **Real auth** | The mock issues an opaque token with `POST /auth/login`. No SSO, no refresh tokens, no CSRF, no cookie/session semantics, no password policy, no lockout. |
| **Real latency and failure modes** | Localhost round trips are sub-millisecond. Timeouts, slow first-byte, retries, partial responses, connection resets and mid-fill network loss are untested; only a clean `500` (`__fail/mappings`) and a clean `401` are. |
| **Real TLS** | Plain HTTP throughout. Certificate failures, HSTS, mixed-content and corporate MITM proxies are untested. |
| **Real data volume** | 5 synthetic people, 6 mappings. No pagination, no search-ranking behaviour, no large `addressHistory`, no ETag churn across many mappings. |
| **Real audit sink** | `POST /immifill/audit` is validated for shape (counts only — the mock 400s on anything payload-shaped) but goes nowhere; retention, batching and back-pressure are untested. |
| **Session expiry over time** | The `chrome.alarms` 60-s-before-expiry logout (§10.2) is covered by the unit suite, not by a wall-clock E2E run. |

## Expected-value derivation

`expectedResults()` in `tests/e2e/harness.ts` re-derives each field's expected status from the
mapping and the payload: no value → `missing`; a value → `filled`, unless the field is in
`DESIGNED_REJECTS` (only `traps.html`, transcribed from `docs/CONTRACTS.md` §9.3). It reuses
`formatValue()` from the engine for date/array formatting — the unit suite is what proves
`formatValue` itself; the E2E's job is proving the formatted value reaches the page. Statuses
come from the real `FillReport`, values from the real DOM.
