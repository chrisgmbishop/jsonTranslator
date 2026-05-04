# Questionnaire translator (Azure Functions)

HTTP Azure Function that reshapes questionnaire JSON from **section-keyed objects** into a **`groups[]` array** (each group has `name` and `items[]`; each item includes `name` plus original fields) for use with **DocumentsCorePack** and similar templating in Power Automate.

## Prerequisites

- **Node.js 20+**
- **npm**
- **Azure Functions Core Tools v4** (for local run): [Install Core Tools](https://learn.microsoft.com/en-us/azure/azure-functions/functions-run-local)

## Setup

```bash
cd functions/questionnaire-translator
npm install
npm run build
```

## Tests

```bash
npm test
```

Fixtures live under [`test/fixtures/`](test/fixtures/): full sample input [`noIndexQuestionnaire.json`](test/fixtures/noIndexQuestionnaire.json) and partial expected output [`REVnoIndexQuestionnaire.json`](test/fixtures/REVnoIndexQuestionnaire.json) (three groups: `information`, `h12-car`, `conclusion`). Item keys match the source JSON (e.g. `start-inspection_3`, not a shortened name).

## Local run

```bash
npm run build
func start
```

Default local URL for this function:

- **POST** `http://localhost:7071/api/translateQuestionnaire`

### Example request

`Content-Type: application/json`

Body: the raw questionnaire object (same shape as `noIndexQuestionnaire.json`).

### Example response (200)

```json
{
  "schemaVersion": "1.0",
  "questionnaire": {
    "@ver": "f1.0",
    "@q": { },
    "groups": [
      {
        "name": "information",
        "displayName": "Information",
        "items": [
          { "name": "service-activity", "v": "...", "vl": "...", "l": "..." }
        ]
      }
    ]
  },
  "warnings": [],
  "meta": {
    "requestId": "…",
    "elapsedMs": 12,
    "groupCount": 1,
    "itemCount": 1
  }
}
```

Use **`questionnaire`** (or the whole body, depending on your action) as the JSON payload for DocumentsCorePack.

### Errors

| Status | Meaning |
|--------|---------|
| **400** | Invalid JSON body, or root is not a plain object (see `error`, `warnings`, `requestId`). |
| **401** | Shared secret required and header missing/incorrect (see below). |
| **404 / 405** | Non-POST methods are rejected by the Functions host before this handler runs (response body is from the runtime, not the JSON errors above). Use **POST**. |

## Optional shared secret (recommended before production)

In [`local.settings.json`](local.settings.json) (or App Settings in Azure), set:

- **`TRANSLATE_SHARED_SECRET`**: non-empty string.

When set, callers must send header:

- **`x-shared-secret`**: same value as `TRANSLATE_SHARED_SECRET`.

If `TRANSLATE_SHARED_SECRET` is empty or unset, the function does not enforce this check (prototype / dev only).

## Power Automate integration

1. Add an **HTTP** action (or **Invoke an HTTP request** if using a connector that wraps it): method **POST**, URI = your Function URL + `/api/translateQuestionnaire`.
2. Body = your questionnaire JSON string (from Dataverse, Compose, etc.).
3. Parse the response JSON (use **Parse JSON** with a schema derived from the example above, or parse `body('HTTP')` in an expression).
4. Pass **`questionnaire`** into the DocumentsCorePack action’s JSON/data input (exact property name depends on the DCP action you use).

### Customer tenants calling your subscription

Flows in another tenant POST to your Function’s **public HTTPS** URL (after deployment). Without APIM, rely on **HTTPS**, **Function keys** (if you switch `authLevel` later), or **shared secret** / Entra app auth for a first line of defense. Plan to move to **API Management** or **Entra ID** app-only auth when you scale.

## Transform rules (summary)

- Copies **`@ver`** and **`@q`** onto `questionnaire` when present.
- Every other top-level key that is a **plain object** becomes one **group** named after that key; key order is preserved.
- A top-level key whose value is an **array** of plain objects becomes **one group per row**, named **`sectionKey[index]`** (zero-based), in array order (e.g. `dhw-mixing-valve[0]`). An **empty array** yields no groups for that key.
- Each **group** includes **`name`** (technical key, or `sectionKey[index]` for array rows), **`displayName`** (from `@props.l` when it is a non-empty string after trim; otherwise **`displayName` equals `name`**), then **`items`**.
- Each property inside a section row becomes an **item** with **`name`** = the source key and remaining fields copied; a conflicting `name` on the item is replaced by the source key.
- Top-level keys starting with **`@`** other than `@ver` / `@q` are skipped with a **warning**.
- Top-level values that are neither a plain object nor an array are skipped with **`SECTION_SKIPPED`**.
- An array row that is not a plain object is skipped with **`SECTION_ROW_SKIPPED`** (path = `sectionKey[index]`).
- Non-object item values are skipped with a **warning** (`ITEM_SKIPPED`).
- **`@props`** is not included in **`items`**; its **`l`** is surfaced only as **`displayName`**.

## Project layout

| Path | Purpose |
|------|---------|
| [`src/index.ts`](src/index.ts) | Loads function registrations. |
| [`src/functions/translateQuestionnaire.ts`](src/functions/translateQuestionnaire.ts) | HTTP trigger. |
| [`src/lib/transform.ts`](src/lib/transform.ts) | Core mapping logic. |
| [`src/lib/types.ts`](src/lib/types.ts) | Shared types. |

## Deploy (outline)

1. Create a Function App (Node 20, Functions v4).
2. Configure app settings (`AzureWebJobsStorage`, `FUNCTIONS_EXTENSION_VERSION`, optional `TRANSLATE_SHARED_SECRET`).
3. Deploy `dist/` and `host.json`, `package.json`, `package-lock.json` (e.g. GitHub Actions, Azure DevOps, or `func azure functionapp publish`).
4. Run `npm run build` in CI before deploy so `main` points at compiled `dist/index.js`.
