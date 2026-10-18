# ImmiFill – Architecture Decisions

## Contract Freeze (Phase 3)

All contracts in `src/shared/` are **frozen** as of Phase 3 completion.

Changes to any contract file require **Orchestrator approval** and a new entry in this file.
No agent outside `src/shared/` may edit these files.

---

## Frozen Contract Files

| File | Description | Status |
|---|---|---|
| `src/shared/config.ts` | All named constants (API_BASE_URL, AUTH_HEADER_NAME, AUTH_HEADER_PREFIX, PAGINATION, SEARCH_LIMIT, SEARCH_DEBOUNCE_MS, SEARCH_MIN_CHARS, CRM_TIMEZONE, PICK_MODE_TIMEOUT_MS, DOM_SETTLE_QUIET_MS, DOM_SETTLE_HARD_TIMEOUT_MS) | Frozen |
| `src/shared/types/applicantProfile.ts` | ApplicantProfile type with all sections (personal, passport, contact, address, visa, employment, sponsor, nomination, skillsAssessment, crm, notes, files, extras) | Frozen |
| `src/shared/contracts/fillReport.ts` | FillReport type, zod schema, emptyFillReport() factory | Frozen |
| `src/shared/contracts/fieldMap.ts` | LocatorStrategy, ControlType, TransformName, FieldEntry, FieldMap types | Frozen |
| `src/shared/contracts/filterConfig.ts` | FilterConfig type, FILTER_CONFIG = [] (empty; filter bar hidden while empty) | Frozen |
| `src/shared/contracts/recordType.ts` | RecordType union ("visaApplicant" \| "student" \| "lead"), RecordDefinition<R> generic, recordTypeSchema zod schema | Frozen |
| `src/shared/contracts/messages.ts` | All typed chrome runtime message request/response types: AuthLoginRequest, AuthLogoutRequest, AuthSessionRequest, RecordsSearchRequest, RecordsGetRequest, FillAllRequest, ClickToFillRequest, ScanPageRequest, EnterPickModeRequest, DragStartMessage, MessageResponse<T>, SessionUser, SessionData, SearchResponse<R>, FillResultMessage | Frozen |

---

## Typecheck Verification

`npm run typecheck` passes with **zero errors** (TypeScript strict mode, no `any`, no `@ts-ignore`).

---

## Rules Enforced

- Named exports only — no default exports in `src/shared/**`
- No `any` types
- No non-null assertions on external data
- No `@ts-ignore`
- TypeScript strict mode

---

## Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-10-18 | Contracts frozen after Phase 3 | All four Phase 4 engineers (API/Auth, Data, Fill Engine, UI) depend on a stable shared contract surface; changes require Orchestrator sign-off to prevent cross-team breakage |
| 2026-10-18 | `RecordsGetRequest.id` typed as `number` | CRM IDs are numeric in the sample API response |
| 2026-10-18 | `SessionUser.branchId` typed as `number \| null` | Field may be absent for some user roles |
| 2026-10-18 | `FILTER_CONFIG = []` (empty array) | Filter param names are unknown; no invented filters per Non-Goal §3.7 |
| 2026-10-18 | Field maps shipped with `verified: false` | No real ImmiAccount HTML fixtures exist; only synthetic test fixtures (Risk R1) |
| 2026-10-18 | shadcn/ui components added manually to `src/components/ui/` | WXT path aliases (`@/*`) conflict with the shadcn CLI's code-generation step; manual creation is functionally equivalent and avoids the alias resolution failure |
| 2026-10-18 | Packages `@radix-ui/react-accordion`, `@radix-ui/react-dialog`, `@radix-ui/react-switch`, `@radix-ui/react-separator`, `@radix-ui/react-label`, `class-variance-authority`, `clsx`, `tailwind-merge` added as runtime deps | Required by manually-added shadcn/ui components; all are transitive deps of the official shadcn/ui distribution |
| 2026-10-18 | `useProfile.selectClient` accepts a `transform` callback | The Data Engineer owns the record registry; passing the transform at call-site avoids a cross-ownership import from the UI layer into `src/records/` |
