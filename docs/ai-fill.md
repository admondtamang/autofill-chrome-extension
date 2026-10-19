# ImmiFill — AI Fill

## Overview

AI Fill automatically completes ImmiAccount form fields by scanning the page, reasoning over the applicant's profile, and injecting values — without the user having to map fields manually.

---

## How It Works

```
╔══════════════════════════════════════════════════════════════════╗
║                   ImmiFill AI Fill — Full Flow                   ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Side Panel          Background SW        Active Tab (Page)      ║
║      │                    │                     │                ║
║  [AI Fill clicked]         │                     │                ║
║      │──fill.scan─────────>│                     │                ║
║      │                    │──executeScript()────>│                ║
║      │                    │                     │ Scan DOM:       ║
║      │                    │                     │  text inputs   ║
║      │                    │                     │  selects       ║
║      │                    │                     │  radio groups  ║
║      │                    │                     │  + labels      ║
║      │                    │<──ScannedField[]─────│                ║
║      │<──ScannedField[]───│                     │                ║
║      │                    │                     │                ║
║  Build Prompt             │                     │                ║
║  fields JSON +            │                     │                ║
║  profile JSON             │                     │                ║
║      │                    │                     │                ║
║      │──POST /messages──────────────────────────────> AI API     ║
║      │                    │                     │       │        ║
║      │                    │                     │  Reasons over  ║
║      │                    │                     │  field labels  ║
║      │                    │                     │  + profile     ║
║      │<─── {"id":"val"} ────────────────────────────── JSON      ║
║      │                    │                     │                ║
║      │──fill.byIds────────>│                     │                ║
║      │                    │──executeScript()────>│                ║
║      │                    │                     │  text → .value ║
║      │                    │                     │  radio → click ║
║      │                    │                     │  select → val  ║
║      │                    │<──FillReport─────────│                ║
║      │<──FillReport───────│                     │                ║
║  Show summary sheet       │                     │                ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## Step-by-Step

### 1. Scan Page (`fill.scan`)

Runs inside the active tab via `chrome.scripting.executeScript` — no content script required.

Collects every interactive form control:

| Field type | How label is found |
|---|---|
| Text / date input | `<label for="${id}">` or `<label for="${name}_input">` (WC pattern) |
| Select / combobox | Same label lookup; includes all `<option>` values |
| Radio group | One entry per `name` group; label from `<fieldset><legend>` |

Returns `ScannedField[]`:
```ts
type ScannedField = {
  id: string;
  name: string;
  tag: string;
  type: string;           // "text" | "select" | "radio" | …
  placeholder: string;
  label: string;          // human-readable question text
  ariaLabel: string;
  value: string;          // current value
  options?: Array<{ value: string; label: string }>; // for radio/select
};
```

### 2. Build Prompt

**Does NOT send raw HTML.** Sends a compact JSON summary:

```
FORM FIELDS:
[
  { "id": "_abc_input", "name": "_abc", "type": "text",
    "label": "Family name" },

  { "id": "", "name": "_def", "type": "radio",
    "label": "Sex",
    "options": [{"value":"F","label":"Female"},
                {"value":"M","label":"Male"},
                {"value":"U","label":"Other"}] },

  { "id": "_ghi_input", "name": "_ghi", "type": "select",
    "label": "Country of passport" }
]

APPLICANT PROFILE:
{ "personal": { "familyName": "Smith", "givenNames": "John" },
  "passport": { "number": "PA1234567", "country": "Australia" }, … }
```

AI instruction: return a JSON object mapping each field's `id` (or `name` if id is empty) to the correct value. For radio/select fields, value must be one of the listed option values.

### 3. AI Call

The prompt is sent to whichever provider is configured in Settings:

| Provider | Endpoint | Auth |
|---|---|---|
| Claude (Anthropic) | `api.anthropic.com/v1/messages` | `x-api-key` header |
| ChatGPT (OpenAI) | `api.openai.com/v1/chat/completions` | `Authorization: Bearer` |
| OpenRouter | `openrouter.ai/api/v1/chat/completions` | `Authorization: Bearer` |
| Gemini (Google) | `generativelanguage.googleapis.com/v1beta/…` | `?key=` query param |

AI returns:
```json
{
  "_abc_input": "Smith",
  "_def": "F",
  "_ghi_input": "13"
}
```

### 4. Fill Fields (`fill.byIds`)

Also runs via `executeScript` in the active tab. For each field in the AI mapping:

```
text / date / textarea
  → set .value (via native React setter if React page, direct assign otherwise)
  → dispatch: input → change → blur

select / combobox
  → set .value
  → dispatch: change → blur

radio / checkbox
  → find input[type=radio][name=…][value=…]
  → .click()  (fires all native change events)
  → falls back to case-insensitive label match if value not found
```

All filled fields get a 3-second green outline highlight.

Returns a `FillReport`:
```ts
type FillReport = {
  filled:   string[];  // profile paths that were filled
  skipped:  string[];  // had value, overwrite was off
  notFound: string[];  // field not found on page
  failed:   string[];  // threw an error
};
```

---

## Why Not Send Raw HTML?

| | Raw HTML | Structured fields JSON |
|---|---|---|
| Typical size | ~200 KB | ~3–5 KB |
| Tokens used | 50 000+ | 1 000–2 500 |
| Includes PII from page | Yes | No |
| Cost per run | ~$0.20+ | ~$0.002 |

The structured approach is ~25× cheaper and keeps unrelated page content out of the AI request.

---

## ImmiAccount WC Form Compatibility

ImmiAccount uses a proprietary server-rendered WC (Web Components / RequireJS) framework. Key differences from React/Vue forms:

| | React form | ImmiAccount WC form |
|---|---|---|
| Input IDs | Meaningful | Opaque: `_2a0b0a0a0e0a0a2a5h1b0b0a` |
| Labels | `<label for="…">` | `<label for="${name}_input">` |
| Radio labels | `<label for="…">` | `<fieldset><legend>` |
| Events needed | `input` | `input` + `change` + `blur` |
| React setter trick | Required | Not needed; direct `.value` works |

The scanner handles both patterns automatically.

---

## Usage Tracking

Every successful AI fill increments a counter stored in `chrome.storage.local` under `immifill_ai_usage`. Visible in **Settings → Usage**.

---

## Files

| File | Role |
|---|---|
| `src/entrypoints/sidepanel/hooks/useAiFill.ts` | Orchestrates scan → prompt → AI call → fill |
| `src/entrypoints/sidepanel/hooks/useAiSettings.ts` | Stores provider, API key, model, usage count |
| `src/entrypoints/sidepanel/screens/SettingsScreen.tsx` | UI for provider/key/model + usage display |
| `src/entrypoints/background.ts` | `scanPageWithScripting` + `fillByIdsWithScripting` |
| `src/shared/contracts/messages.ts` | `ScannedField`, `FillByIdsRequest` types |
| `scripts/test-fill.ts` | Playwright script to test fill on sample.html |
