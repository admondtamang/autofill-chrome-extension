# CLAUDE.md — ImmiFill Chrome Extension

**TL;DR** — MV3 extension (TypeScript/WXT/Preact) that fills Australian ImmiAccount visa
forms from Success CRM person records. **Phase 1 is code-complete and green; Phase 2 is
NOT started and must not be started without the owner's explicit go-ahead.**
Verified: 72 unit tests pass, typecheck + build clean, as of 2026-09-26.

Spec: `prd.md`. **Cross-module contracts: `docs/CONTRACTS.md` — frozen, read it before
changing any boundary.**

---

## Status

| Item | State |
| --- | --- |
| Phase 1 (static JSON data, no backend) | **Complete, awaiting owner review** |
| Phase 2 (`CrmApiDataSource`, login, live mappings) | **NOT STARTED — gated on owner approval** |
| `lib/data/crm-api.ts` | Written but **dormant**. Never imported at runtime while `WXT_DATA_SOURCE=static` (the default). Do not activate it. |
| Phase 3 (prod build, live ImmiAccount, pilot) | Not started |

**Gate rule:** do not begin Phase 2 work — no login UI, no auth, no network calls, no CRM
endpoints — until the owner says so. If a task seems to require it, stop and ask.

---

## Commands

| Command | Does |
| --- | --- |
| `pnpm install` | Install (pnpm 11; `postinstall` runs `wxt prepare`) |
| `pnpm dev` | WXT dev server, dev manifest |
| `pnpm build` | Build dev manifest → `.output/chrome-mv3-dev` |
| `pnpm build:prod` / `pnpm zip` | Production manifest (fixed hosts only) |
| `pnpm typecheck` | `wxt prepare && tsc --noEmit` |
| `pnpm test` | Vitest + jsdom unit suite |
| `pnpm fixtures` | Serve `fixtures/` on <http://localhost:5174> |
| `pnpm fixtures:alt` | Same tree on <http://127.0.0.1:5175> — a *non-declared* origin, for testing runtime host grants |
| `pnpm check:synthetic` | CI guard: fails if `data/people.json` looks like real client data |

Load unpacked: `chrome://extensions` → Developer mode → Load unpacked → `.output/chrome-mv3-dev`.

---

## Architecture

Three parts talk by message. **Only the service worker touches data**, via whichever
`DataSource` the build selected.

```
Side panel (Preact)  --PanelMessage-->  Service worker  --DataSource-->  StaticDataSource
   search / Fill / undo                  background.ts                   (data/*.json)
   record mode                                |
                                    tabs.sendMessage
                                              v
                                    Content script (content.ts)
                                    detect -> fillPage -> highlight
```

| Path | Responsibility |
| --- | --- |
| `entrypoints/background.ts` | Message router, `DataSource` calls, mapping cache, payload lifetime |
| `entrypoints/content.ts` | Page detection, runs the fill engine, undo snapshot, record mode |
| `entrypoints/sidepanel/` | Preact UI: search, pre-flight, Fill, report, undo, enable-site, record |
| `lib/fill-engine/` | `fillPage`, `preflight`, `restore` + handlers, `setNative`, `waitStable`, `verify`, `safety` |
| `lib/data/` | `DataSource` interface, `StaticDataSource`, dormant `CrmApiDataSource`, selector |
| `lib/schema/` | Zod schemas — the single source of shape truth |
| `lib/page-detect.ts` | host + URL + heading → `formKey` |
| `lib/record.ts` | Pure-DOM record mode (no `chrome.*`; the entrypoint wires those) |
| `data/` | 5 synthetic people + one mapping JSON per fixture |
| `fixtures/` | 6 deliberately hostile test pages |

**The switch point is `lib/data/index.ts` and nothing else.** A PRD acceptance criterion is
that changing `WXT_DATA_SOURCE` touches no fill-engine code. Keep it that way.

---

## Non-negotiables (`docs/CONTRACTS.md` §8 — these are legal/privacy controls, not style)

1. **Never** click Next / Submit / Pay, or tick a declaration checkbox. The human attests to
   the declarations. `lib/fill-engine/safety.ts` enforces this; the only permitted click in
   the engine is a repeat-group `addButtonSelector`, and only after an `isUnsafe()` check.
2. Applicant data lives **only** in service-worker memory for one fill, cleared after the
   fill or 60s. Never `chrome.storage`, never logged, never in the console.
3. The fill report and audit carry **paths and counts only — never values**.
4. No `eval`, no remote code, no `innerHTML` from data. Mappings are Zod-validated before use.
5. `data/people.json` is synthetic only: emails end `@example.test`, passports start `PA`/`TEST`.
6. Every field ends as exactly one of `filled` / `missing` / `not_found` / `rejected`.
   Silent mis-fills are the failure mode this product exists to prevent.

---

## Gotchas (each one cost real time — do not "fix" them without reading why)

- **`tsconfig.json` deliberately does NOT extend `.wxt/tsconfig.json`.** That target doesn't
  exist until `wxt prepare` has run, so extending it deadlocks a clean clone. Cost: WXT's
  `noUncheckedIndexedAccess` / `noImplicitOverride` are not inherited.
- **`@wxt-dev/module-preact` does not exist** on npm. We use `@preact/preset-vite` as a plain
  Vite plugin instead.
- **`pnpm-workspace.yaml` carries `allowBuilds: {esbuild: true}`.** pnpm 11 moved this out of
  `package.json`; without it `pnpm install` exits 1 with `ERR_PNPM_IGNORED_BUILDS`.
- **Zod v4: `z.record(enum, v)` is exhaustive.** `FillAudit.counts` uses `z.partialRecord`;
  `ZodRecord` has no `.partial()`.
- **WXT's built-in `WXT_*` exposure reads `.env` files only, not shell vars.** `wxt.config.ts`
  adds a `vite.define` fallback so `WXT_DATA_SOURCE=api pnpm build` actually works.
- **`vitest.config.ts` includes `tests/unit/**/*.test.ts` — `.tsx` is not matched.** Component
  tests use `h()` rather than JSX. Widen the glob if you want `.tsx`.
- **The `@ts-expect-error` in `tests/unit/record.test.ts` is load-bearing**: it fails
  typecheck if anyone reintroduces the two-arg `startRecording` overload.
- **`traps.json` expects NON-`filled` statuses by design** (`docs/CONTRACTS.md` §9.3). A test
  run that shows four `rejected`/fallback results there is PASSING, not failing.
- **`react.html` renders from a CDN**, so its form is absent under jsdom. The fixture test
  skips that subtree on purpose; real coverage comes from the Playwright suite.
- **Repeat-group paths are written `addressHistory[].street`** and reported with the literal
  index (`addressHistory[0].street`). See `docs/CONTRACTS.md` §9.1 — it is binding and
  non-obvious.

---

## Working conventions

- `docs/CONTRACTS.md` is **frozen**. Changing a cross-module boundary means amending it first
  (with an explicit amendment section), then changing code — never the reverse. A call site
  that disagrees with the contract is a defect in the call site, not a reason to widen the
  signature.
- Mapping JSON is **data, not code**: fixing a broken form should mean editing
  `data/mappings/*.json`, never the engine. If the engine needs a change to support a site,
  that is a real signal — say so rather than special-casing.
- Every non-trivial change lands with a test that fails first. The radio-group undo bug was
  found exactly this way.
- Synthetic data only. Never put real client data in this repo, and never put synthetic
  people into a live government application.
