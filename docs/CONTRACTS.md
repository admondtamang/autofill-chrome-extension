# ImmiFill — Frozen Contracts

Single source of truth for cross-module boundaries. **No agent may change this file
without the orchestrator's approval.** Implementations import from the modules named
here; they do not redefine these shapes locally.

Derived verbatim from `prd.md`. Where the PRD is silent, the choice below is binding.

---

## 1. Zod schemas — `lib/schema/index.ts`

All exported as both the Zod schema (PascalCase) and the inferred type (same name).

```ts
export const EntityType = z.enum([
  'lead','student','education','visa','skill-assessment','tribunal','insurance',
]);

export const ApplicantPayload = z.object({
  personRef:   z.object({ type: EntityType, id: z.number().int() }),
  name:        z.object({ given: z.string(), middle: z.string().nullable(), family: z.string() }),
  dob:         z.string().nullable(),                 // ISO yyyy-MM-dd
  contact:     z.object({ email: z.string().nullable(), phone: z.string().nullable() }),
  passport:    z.object({ number: z.string().nullable(), issued: z.string().nullable(), expires: z.string().nullable() }),
  citizenship: z.object({ code: z.string().nullable(), label: z.string().nullable() }),
  currentVisa: z.object({ type: z.string().nullable(), expires: z.string().nullable() }),
  address:     z.object({ residential: z.string().nullable() }),
  location:    z.string().nullable(),                 // 'Onshore' | 'Offshore' (free text)
  employment:  z.object({ occupation: z.string().nullable() }),
  education:   z.object({ highest: z.string().nullable() }),
  serviceTypes: z.array(z.string()),
  addressHistory: z.array(z.object({
    street: z.string().nullable(), city: z.string().nullable(),
    country: z.string().nullable(), from: z.string().nullable(), to: z.string().nullable(),
  })).default([]),                                     // drives repeatGroup
});

export const PersonSummary = z.object({
  personRef: z.object({ type: EntityType, id: z.number().int() }),
  displayName: z.string(),
  email: z.string().nullable(),
  subtitle: z.string().nullable(),                     // shown under the name in the list
});

export const FieldMapping = z.object({
  path: z.string(),
  selector: z.string(),                                // '{value}' token substituted for radios
  fallbackLabel: z.string().optional(),
  type: z.enum(['text','select','radio','checkbox','date','textarea']),
  format: z.string().optional(),                       // date-fns pattern
  waitAfterMs: z.number().int().max(5000).optional(),
  required: z.boolean().default(false),
  repeatGroup: z.string().optional(),                  // payload array path, e.g. 'addressHistory'
  addButtonSelector: z.string().optional(),            // required when repeatGroup is set
  rowSelector: z.string().optional(),                  // required when repeatGroup is set
});

export const FormMapping = z.object({
  formKey: z.string(),
  version: z.number().int(),
  pageMatch: z.object({ host: z.string(), urlIncludes: z.string(), headingText: z.string() }),
  fields: z.array(FieldMapping),
});

export const MappingIndexEntry = FormMapping.pick({ formKey: true, version: true, pageMatch: true });

export const FieldStatus = z.enum(['filled','missing','not_found','rejected']);

export const FieldResult = z.object({
  path: z.string(),
  status: FieldStatus,
  detail: z.string().optional(),                       // never contains person data
});

export const FillReport = z.object({
  formKey: z.string(),
  mappingVersion: z.number().int(),
  results: z.array(FieldResult),
  snapshot: z.array(z.object({ selector: z.string(), kind: z.enum(['value','checked']), value: z.string() })),
});

export const FillAudit = z.object({
  formKey: z.string(),
  mappingVersion: z.number().int(),
  personType: EntityType,
  personId: z.number().int(),
  counts: z.record(FieldStatus, z.number().int()),     // COUNTS ONLY — never values
  at: z.string(),                                      // ISO timestamp
});
```

**Rule:** `FillAudit.counts` and `FieldResult.detail` must never carry applicant values.

---

## 2. `DataSource` — `lib/data/types.ts`

Exactly the PRD interface. `StaticDataSource` (`lib/data/static.ts`) and
`CrmApiDataSource` (`lib/data/crm-api.ts`) both implement it; `lib/data/index.ts`
selects on `import.meta.env.WXT_DATA_SOURCE`.

Errors: `NotFoundError`, `UnauthorizedError` exported from `lib/data/errors.ts`.

---

## 3. Message protocol — `lib/messages.ts`

Every message is `{ kind, ...payload }`. Every response is a discriminated result:
`{ ok: true, data: T } | { ok: false, error: string }`. **Never throw across a port.**

### Side panel → service worker

| kind | payload | response `data` |
| --- | --- | --- |
| `SEARCH` | `{ type, q, limit? }` | `PersonSummary[]` |
| `DETECT` | `{}` | `{ formKey, mappingVersion } \| null` |
| `PREFLIGHT` | `{ type, personId }` | `{ formKey, missingRequired: string[] } \| null` |
| `FILL` | `{ type, personId }` | `FillReport` |
| `UNDO` | `{}` | `{ restored: number }` |
| `ENABLE_SITE` | `{}` | `{ granted: boolean, origin: string }` |
| `RECORD_MODE` | `{ on: boolean }` | `{ on: boolean }` |
| `RECORD_GET` | `{}` | `FormMapping` (draft, assembled from captures) |
| `PAYLOAD_PATHS` | `{}` | `string[]` (dot paths available on ApplicantPayload) |

### Service worker → content script (`chrome.tabs.sendMessage`)

| kind | payload | response `data` |
| --- | --- | --- |
| `DETECT_PAGE` | `{ index: MappingIndexEntry[] }` | `{ formKey } \| null` |
| `FILL_PAGE` | `{ mapping, payload }` | `FillReport` |
| `UNDO_PAGE` | `{}` | `{ restored: number }` |
| `RECORD_MODE` | `{ on, paths }` | `{ on: boolean }` |
| `RECORD_GET` | `{}` | `FieldMapping[]` |

### Content script → side panel (broadcast via `chrome.runtime.sendMessage`)

| kind | payload |
| --- | --- |
| `RECORD_FIELD_CAPTURED` | `{ field: FieldMapping }` |

---

## 4. Page detection — `lib/page-detect.ts`

```ts
export function detectFormKey(
  index: MappingIndexEntry[],
  ctx: { host: string; url: string; headings: string[] },
): string | null;
```

Score each entry; highest non-zero score wins, ties broken by first in index order.
- `host` must match exactly (`ctx.host === pageMatch.host`) → else score 0 (hard fail).
- `+2` if `ctx.url` includes `pageMatch.urlIncludes` (empty `urlIncludes` scores 0, not a fail).
- `+1` if any heading, case-insensitively trimmed, includes `pageMatch.headingText`
  (empty `headingText` scores 0, not a fail).
- Score 0 after a host match still counts as a match with score 0 **only if** both
  `urlIncludes` and `headingText` are empty strings; otherwise 0 means no match.

Headings collected from `h1,h2,h3,legend,[role=heading]`.

---

## 5. Fill engine — `lib/fill-engine/`

Public surface (nothing else is imported from outside the folder):

```ts
// index.ts
export async function fillPage(m: FormMapping, data: ApplicantPayload): Promise<FillReport>;
export function preflight(m: FormMapping, data: ApplicantPayload): string[];  // missing required paths
export function restore(snapshot: FillReport['snapshot']): number;            // returns count restored
// format.ts
export function formatValue(raw: unknown, field: FieldMapping): string | null;
// dom.ts
export function setNative(el, v: string): void;
export function waitStable(quietMs?: number, maxMs?: number): Promise<void>;
```

Binding behaviour:
- Fields are processed **in mapping order**, sequentially, awaited.
- `checkbox`: truthy value (`true`, `'true'`, `'yes'`, `'1'`, non-empty for arrays) → checked.
- `radio`: `selector` has `{value}` replaced by the formatted value before querying.
- `select`: match `option.value` exactly first; then `option.label/textContent`
  case-insensitively and trimmed. No match → `rejected`.
- `verify()` re-reads the element after the write. Mismatch → `rejected`, and the
  highlight is `rejected` (not `filled`).
- Highlight classes: `immifill-filled`, `immifill-missing`, `immifill-not_found`,
  `immifill-rejected`, injected via a `<style>` element the content script owns.
  Never `innerHTML` from data.
- **Never** click, focus-navigate, or dispatch events on any element matching
  submit/next/pay/declaration semantics. The engine only touches elements resolved
  from the mapping, plus `addButtonSelector` for repeat groups.
- Undo snapshot is captured **before** the first write, from the same resolved
  selectors, and stored in the content script for `UNDO_PAGE`.

---

## 6. Build flags

`wxt.config.ts` exposes, via Vite `define`/env:
- `WXT_DATA_SOURCE`: `'static' | 'api'` (default `'static'`)
- `WXT_CRM_BASE`: string (default `''`)

Dev manifest: `optional_host_permissions: ['<all_urls>']`,
`host_permissions: ['http://localhost:5174/*', 'http://127.0.0.1:5174/*']`.
Prod manifest: `host_permissions: ['https://online.immi.gov.au/*','https://api.successedu.com.au/*']`
and no `optional_host_permissions`.

Permissions both modes: `['storage','sidePanel','activeTab','scripting','alarms']`.

---

## 7. Fixture ports

`pnpm fixtures` serves `fixtures/` on **http://localhost:5174**.
A second origin **http://127.0.0.1:5175** serves the same tree for testing the
runtime host-permission grant path (a non-declared origin).

## 8. Non-negotiables (from PRD security section)

1. Person data never written to `chrome.storage`, never logged, never console-printed.
2. Service worker clears the in-memory payload after a fill or after 60s, whichever first.
3. No `eval`, no remote code, no `innerHTML` from data.
4. `data/people.json`: emails must end `@example.test`; a CI check enforces this.
5. The extension never submits, navigates, or ticks declarations.

---

## 9. Amendments (orchestrator, post-Stage-1)

### 9.1 Repeat-group path convention — BINDING
A `FieldMapping` inside a `repeatGroup` writes its `path` as the **full payload path
with `[]` marking the array index**, e.g. `addressHistory[].street` for
`repeatGroup: 'addressHistory'`.

Engine resolution for a repeat-group field:
1. Read the array at the `repeatGroup` path (`addressHistory`). Absent/empty → every
   field of that group is `missing`; do NOT click the add button.
2. For each item index `i`, ensure a row exists: if
   `document.querySelectorAll(rowSelector).length <= i`, click `addButtonSelector`
   and `await waitStable()`. Clicking the add button is the ONLY click the engine may
   perform, and only when `repeatGroup` is set.
3. Resolve the field **scoped to row `i`**: `rows[i].querySelector(selector)`.
4. The value comes from `item[<suffix after '[].'>]`.
5. Report one `FieldResult` per (field, row), with `path` rendered as
   `addressHistory[0].street` — the literal index, not `[]`.

### 9.2 Mapping validity rule — BINDING (enforced in CI)
A mapping field is valid if its `selector` resolves in the fixture **or** it declares a
`fallbackLabel` whose text is present. `traps.json` intentionally relies on the
fallback path for `employment.occupation`; that is a pass, not a warning.

### 9.3 `traps.json` expected outcomes — BINDING (E2E asserts these exactly)
| path | expected status | why |
| --- | --- | --- |
| `contact.phone` | `rejected` | page reformats on blur, `verify()` must catch it |
| `citizenship.label` | `rejected` | `<select>` has no matching option |
| `employment.occupation` | `filled` | resolved via `fallbackLabel` |
| `address.residential` | `rejected` | input is readonly/disabled, write does not take |

And: after a fill of `traps.html`, `#declaration` must be unchecked, no navigation
must have occurred, and `#next` / `#pay` must never have been clicked.
