# Testing

Verification notes for this package, kept alongside the code so each phase of
the build plan (`integrations/plans/n8n.md`) can record how it was checked.

Three layers:

- **Automated unit tests** (`test/`, Vitest) cover the pure logic that has no
  business being verified by hand: payload building, JSON validation, the
  polling backoff and API error extraction. Run them with `npm test`.
- **A live end-to-end pass** against the production JSON2Video API, run
  2026-07-30 — see [Live end-to-end pass](#live-end-to-end-pass--2026-07-30).
  All 21 operations, the credential and all 6 dynamic dropdowns that existed
  then were driven through the *compiled* handlers in `dist/` with a mock
  `IExecuteFunctions` that performs real HTTP requests. This is what closed the
  "pending live check" sections of Phases 3–6. The template variables UI, changed
  afterwards, has its own section:
  [Template variable mapper](#template-variable-mapper--2026-07-30-supersedes-the-030-dropdown).
- **Manual checks** in n8n's own dev sandbox (`npm run dev`) for the handful of
  things only a browser and a human can confirm (the credential modal, the
  parameter panel, item linking).

## Live end-to-end pass — 2026-07-30

Run against `https://api.json2video.com/v2` with a real account key
(101 templates, 52 movies in history, 200 MB in the Drive). Method: a harness
imported the compiled node from `dist/nodes/Json2Video/` and called
`Json2Video.execute` / `Json2Video.methods.*` through a mock
`IExecuteFunctions` / `ILoadOptionsFunctions` whose
`helpers.httpRequestWithAuthentication` performed real requests with the
`x-api-key` header, and whose `helpers.httpRequest` performed the unauthenticated
presigned S3 `PUT`. Driving the node's own code — rather than curl — is what
makes the result meaningful: every parameter default, every `extractValue`,
every response shaping step and every error path is the shipped one.

Ground rules that were followed: only new resources were created, all named with
an `n8n-e2e-` prefix; nothing pre-existing was read-modify-written; every created
resource was deleted and the deletion re-verified; renders were capped at 3 s of
output at `sd`.

### Result: 21/21 operations PASS

| Resource | Operation | Result |
|---|---|---|
| Credential | valid key → 200 | PASS |
| Credential | invalid key → `400` → friendly message | PASS (`{"success":false,"message":"Error: Invalid API Key"}` → "Invalid JSON2Video API key — check the credential.") |
| Movie | Create | PASS — returns exactly `{ success, project, timestamp }` |
| Movie | Get Status | PASS — Simplify on/off, *Include Movie JSON* both ways |
| Movie | Get Many | PASS — Limit, Return All (52 movies, server-side paging), date range |
| Movie | **Render and Wait** | PASS — template mode, reached `done` in 8.1 s, emitted `url` (HTTP 200, `video/mp4`), `duration: 2`, `size`, `width`/`height`, `remaining_quota` |
| Movie | Delete | PASS — soft delete, idempotent, history entry keeps `deleted_at` with `url: null` |
| Template | Get Many | PASS — 101 templates, `updated_at` desc, Limit 3 → exactly 3, Tag filter (client-side, B10) |
| Template | Get | PASS — Simplify on/off, `movie` verbatim as a string, `format=jsonschema` |
| Template | Create | PASS — 20-char ID, `id` **and** `templateId` (B8), tags + prompt stored |
| Template | Update | PASS — name-only update left tags/prompt/movie untouched; empty Update Fields fails client-side with **zero** requests |
| Template | Duplicate | PASS — variables deep-merged into the copy, dual ID (B8) |
| Template | Delete | PASS — node adds `templateId`/`deleted` the API omits; re-read then 400s |
| Template | Get Library | PASS — 19 published; `tags=real estate` → 21 (server-side union, as documented); no `movie` field |
| Media | Upload File | PASS — see [the two-step upload](#the-two-step-upload-phase-6s-open-risk) below |
| Media | Get File | PASS — Simplify on/off; missing path → `File not found` |
| Media | List Folder | PASS — root, Limit, Return All, `type` and `q` filters, and the informational single item for an empty folder |
| Media | Get Folder Tree | PASS — 7 folders, cross-checked against Get Storage Usage |
| Media | Move File | PASS — including **to the root with an empty `destination`**, the case that breaks if the key is omitted |
| Media | Delete File | PASS — node adds the fields the bare `{ success, timestamp }` omits |
| Media | Create Folder | PASS — idempotent second call → `created: false`, `message: "Folder already exists"` |
| Media | Delete Folder | PASS — refuses non-empty and `temp`; root refused client-side |
| Media | Get Storage Usage | PASS — `used_bytes`, `free_allowance: 52428800`, `blocked: false` |
| Dropdowns | `searchTemplates` (101), `searchLibraryTemplates` (19), `getTemplateTags` (7), `getMediaFolders` (7), `getMediaFiles` (16), `getMediaFileNames` (16) | PASS — real, well-labelled options; all six return an **empty** list (never throw) with a bad key |

Other behaviours confirmed in the same pass:

- **Polling cadence.** First status check 5.0 s after the `POST`, never faster
  than the 5 s floor. The render finished on the first poll, so the 5 → 8 → 11 →
  17 → 25 → 30 backoff tiers remain covered by `polling.test.ts` only.
- **The `POST` is never retried** — one `POST` per Render and Wait, verified from
  the harness's HTTP log.
- **Render failure path.** A movie whose image `src` 404s produced
  `Scene #1, element #1: Failed to download '…' (404)` as the error message and
  `Render failed for project <16-char id>: …` as the description, with the
  project ID attached. With *Fail On Render Error* off, the same movie came back
  as a normal item with `status: "error"`.
- **Client-side validation costs no request.** `{"scenes": [}` failed with
  `Movie JSON is not valid JSON: …` and **0** HTTP requests; likewise the empty
  Update Fields guard and the missing-upload-name guard.
- **Continue On Fail** emitted `{ error: "…" }` with `pairedItem` intact.
- **Multiple input items.** Three binary items through one Upload File node
  produced three uploads and `pairedItem` `0,1,2`; three items through Get Many
  likewise.

### The two-step upload (Phase 6's open risk)

This was the one implementation contract nobody could verify without a live key,
so it was checked in detail. A 70-byte PNG was uploaded into `n8n-e2e-folder`:

- The `PUT` went to `json2video-media.s3.us-east-1.amazonaws.com` and carried
  **exactly two headers: `Content-Type: image/png` and `Content-Length: 70`**.
  No `x-api-key`, no `Authorization` — which is the requirement, since an extra
  header invalidates the presigned signature. HTTP 200.
- `Content-Type` on the `PUT` matched the `contentType` sent in step 1, as S3
  signs it.
- The stored object was **byte-identical**: downloading the emitted `url` and
  comparing SHA-256 against the source buffer matched.
- The emitted item was
  `{ success, name, folder, path, contentType, size, url }` with **no
  `uploadUrl`** — the signed secret never reaches the output or the logs.
- Client-side name sanitisation agrees with the server: `mi vídeo (final).png`
  was stored as `mi_v_deo__final_.png`, and `Get File` on the sanitised path
  found it.
- A second upload of the same name failed with the API's
  `A file with this name already exists. Delete it first.` plus the appended hint.

### Bugs found and fixed

Three, all found only because the node's own code was driven end-to-end.

1. **Every appended error hint in the Media resource was dead code.**
   n8n's `NodeApiError` stores the API payload under `errorResponse`, which
   `getErrorResponseBody` did not inspect. Since the shared transport already
   wraps failures in a `NodeApiError`, the *second* look that
   `deleteFolder.ts` and `upload.ts` take at the same error re-extracted
   `"The JSON2Video API returned HTTP 400"` instead of the API's message — so
   `describeUploadRegistrationError` / `describeDeleteFolderError` matched
   nothing and silently appended no hint. Every unit test still passed, because
   they call those builders with the raw message. Fixed by adding
   `errorResponse` to the candidate list; the 409-duplicate, non-empty-folder
   and `temp`-folder hints now all appear. Regression test:
   `errors.test.ts` → "re-extraction from an already-wrapped NodeApiError".
2. **Get Many's *Include Movie JSON* was a no-op.** `GET /v2/movies` in list
   mode ignores `format=simple` and always returns each movie's submitted
   document, so items carried a multi-kilobyte `json` string regardless of the
   option (`operations.md` B13). Fixed with a client-side `stripMovieJson`;
   item size dropped from 558 to 375 bytes on this account's short documents,
   and by kilobytes on real ones. Regression test: `movie.test.ts` →
   `stripMovieJson`.
3. **An unknown project ID surfaced a leaked server-side `TypeError`.**
   `GET /v2/movies?project=<unknown>` answers `400` with
   `{"success":false,"message":"TypeError: Cannot read properties of null (reading 'success')"}`
   — not the `200` + `status: "error"` the contract claimed (`operations.md`
   B14). The node showed that verbatim as the headline error. Fixed with
   `toMovieLookupError`, which maps a `400` carrying a leaked runtime error onto
   `No movie found with project ID <id>` and keeps the API's raw text in the
   description. Applied to Get Status, Delete and the Render and Wait 4xx abort.
   Regression tests: `errors.test.ts` → `isInternalApiErrorMessage`,
   `toMovieLookupError`.

`operations.md` was corrected in the same pass: B13–B18 added, the "unknown
project returns 200" claim replaced, the `404` rows flagged as never actually
used, and the deferred element validation documented.

### Still not verifiable without more than an API key

- **Role gating** (a `render`-only key must fail Template Create/Update/
  Duplicate/Delete). Only one key was available, and it has full permissions.
- **Webhook delivery.** The flat *Webhook URL* → `exports[].destinations[]`
  expansion is unit-tested (`movie.test.ts`), but no live callback was received
  because that needs a publicly reachable endpoint.
- **n8n-runtime behaviours**: the credential modal's masking and Test button,
  "Retry On Fail" not retrying the `POST` (n8n's own behaviour), the Item
  Linking panel, and the interaction with n8n Cloud execution timeouts.

### Cost and cleanup

Five movies were submitted; four rendered 2 s each at `sd` (**≈ 8 credits**),
and the fifth — the deliberately invalid document from B15 — failed instantly
with `consumed_credits: []`.

Everything created was deleted and the deletion re-verified by re-querying:
6 templates, 5 movies (soft-deleted; history rows keep `deleted_at` and
`url: null`), 4 folders (`n8n-e2e-folder`, `-hints`, `-multi`, `-race`) and 10
files. The account finished the pass with its original 101 templates, 7 folders
and 30 files — **no leftover template, movie, folder or file**, confirmed by
walking every folder in the Drive.

One accounting residue, worth knowing about: `used_bytes` ended **70 bytes**
above the starting `200190943`. During a repeat run, `Move File` on a file that
had just been uploaded (still `status: "pending"`) reported `success: true`, and
the file record then disappeared — `Get File` returned `File not found`, `List
Folder` showed nothing, the parent folder deleted as empty, and both candidate
S3 URLs answered `403`. So the object and the record are gone, but the 70 bytes
had already been added to the storage counter (the counter increments on the
`pending` → `uploaded` transition, verified separately) and were never
decremented. A deliberate reproduction of the same sequence afterwards was
clean (delta 0), so this is a **non-deterministic API-side race in `PUT
/v2/media/file`, not node behaviour** — but it can silently lose a file that
`Move File` just said it moved, which is worth raising with the API team. There
is no public endpoint that can correct the counter; 70 bytes out of 200 MB.

## Phase 3 — Credentials (`Json2VideoApi`)

### How to run the dev sandbox

```bash
cd integrations/n8n
npm run dev
```

This starts n8n on `http://localhost:5678` with this package linked in as a
custom node (via `n8n-node dev`, using `~/.n8n-node-cli/.n8n/custom`).

### Steps to verify the credential

1. Open `http://localhost:5678` in a browser, sign in / create the local
   owner account if this is the first run.
2. Go to **Credentials → Add Credential** and search for **"JSON2Video API"**.
3. Confirm the UI shows:
   - A single **API Key** field, masked (dots instead of plaintext).
   - A documentation link pointing at
     `https://json2video.com/docs/v2/guides/dashboard/api-keys`.
4. **Valid key path** (needs a real JSON2Video API key — see below):
   - Paste a real, active API key (any role — `render` is enough).
   - Click **Test**. Expected: a green success indicator. n8n runs the
     configured `test.request` (`GET https://api.json2video.com/v2/templates`
     with the `x-api-key` header injected by `authenticate`) and treats any
     `2xx` as success.
5. **Invalid key path** (no real key needed — any string works):
   - Paste an arbitrary string, e.g. `not-a-real-key`.
   - Click **Test**. Expected: a **red failure** indicator showing
     `Invalid API key. Check that you copied it correctly and that it has not
     been revoked or expired.` — **not** a raw `400 Bad Request`.
   - This is the important case to check carefully: the JSON2Video API
     returns HTTP **400** (not 401) for an invalid or missing API key (see
     `integrations/shared/operations.md`, "Global conventions" → HTTP status
     codes, and Appendix B / item B11). Left to n8n's default credential-test
     handling, a non-2xx response only produces a generic failure; the
     `rules: [{ type: 'responseCode', value: 400, message: '...' }]` entry on
     the credential's `test` is what turns that specific case into the
     human-readable message above. If this step ever shows a bare "400 Bad
     Request" instead of the friendly message, the `rules` array regressed —
     check it did not get dropped in a refactor.
6. **Empty key path**: leave the field blank and click Test/Save. The field is
   `required: true`, so the UI should refuse to save with an empty value
   before it ever reaches the API.
7. While testing, watch the n8n server console/logs (the terminal running
   `npm run dev`) and confirm the API key value never appears in any log
   line, even on the failure path.

### Phase 3 live check — DONE 2026-07-30

Steps 4 and 5 are **confirmed against the production API**:

- **Valid key** → `GET /v2/templates` returns `200` with the account's 101
  templates. The credential's `test.request` is exactly this call, so a real key
  produces the green indicator.
- **Invalid key** (`not-a-real-key`) → HTTP **`400`** with
  `{"success":false,"message":"Error: Invalid API Key"}`. This is the premise the
  credential's `rules: [{ type: 'responseCode', value: 400, … }]` entry rests on,
  and it holds — the entry is correct and must not be dropped in a refactor
  (`operations.md` B11). Through the node's own error path the same response
  becomes "Invalid JSON2Video API key — check the credential.", never a bare
  "400 Bad Request".
- The key never appeared in any emitted item, error payload or log line, on
  either path.

Steps 1–3 and 6 (masked field, documentation link, `required: true` refusing an
empty value) are pure n8n UI behaviour driven by the credential definition and
still want a human eyeball in `npm run dev` before submission — they cannot fail
in a way the API can reveal.

---

## Phase 4 — Movie resource

Operations implemented: **Create**, **Get Status**, **Get Many**,
**Render and Wait**, **Delete**. Contract:
`integrations/shared/operations.md` → "Resource: Movie".

### Automated checks (done, no API key needed)

```bash
cd integrations/n8n
npm run lint    # clean
npm run build   # clean
npm test        # 49 tests, 4 files
```

What the unit tests lock down (`test/`):

| File | Covers |
|---|---|
| `movie.test.ts` | Movie JSON client-side validation (parse position surfaced, empty/non-object rejected), the flat **Webhook URL → `exports[].destinations[]`** expansion (Appendix B / B3, including the full `application/json` MIME string), Additional Options → API property mapping, Width/Height only for `resolution=custom`, `exports` winning over Webhook URL, 16-character project ID validation, response simplification |
| `polling.test.ts` | The backoff tiers **5 / 8 / 11 / 17 / 25 / 30** for a 5 s interval, the 5 s hard floor, the 5–300 s and 30–3600 s clamps |
| `errors.test.ts` | Error extraction from B7-shaped bodies (`{ message }` / `{ message, code }` with **no `success` field**), `body.error` and status-text fallbacks, the invalid-API-key 400 → actionable message mapping (B11), status-code discovery, project ID round-trip on errors |
| `movieRequestBody.test.ts` | End-to-end parameter → request body for both input modes, including variables as fields vs JSON, and the "no template selected" guard |

### Live checks — DONE 2026-07-30

All of the below were run against the production API; see
[Live end-to-end pass](#live-end-to-end-pass--2026-07-30) for the evidence.
Outcome per item:

| # | Item | Result |
|---|---|---|
| 1 | Template render via Render and Wait | **PASS** — `From List` listed all 101 templates; render reached `done` in 8.1 s with a playable `url`, `duration: 2`, `size: 5262`, `640x480`, `remaining_quota`. First poll 5.0 s after the `POST`. |
| 2 | Raw-JSON render + Create | **PASS** — Create returns `{ success, project, timestamp }` and nothing else. |
| 3 | Broken movie surfaces the real message | **PASS with a contract correction** — the client-side case behaves as described (0 requests). The *server-side* case does **not**: `POST` accepts an element without `src` with HTTP 200 and a project ID, and the error only appears at render time (`operations.md` B15). The render-failure path itself is confirmed: `Render failed for project <id>: Scene #1, element #1: Failed to download '…' (404)`, and *Fail On Render Error* off emits the item with `status: "error"`. |
| 4 | Delete | **PASS** — `{ success, project, deleted_at, timestamp }`, idempotent, history row keeps `deleted_at` with `url: null`. |
| 5 | Get Status, Simplify + Include Movie JSON | **PASS** both ways. |
| 6 | Bad project IDs | **PASS with a bug fixed** — 15 chars fails client-side. A well-formed unknown ID returns `400` with a leaked `TypeError`, not `200`/`status: "error"` as this file previously claimed; the node now maps it to `No movie found with project ID <id>` (`operations.md` B14). |
| 7 | Get Many, Limit / Return All / date range | **PASS with a bug fixed** — *Include Movie JSON* off was a no-op because the list endpoint ignores `format=simple`; now stripped client-side (`operations.md` B13). |
| 8 | Webhook URL callback | **NOT VERIFIED** — needs a publicly reachable endpoint. The expansion into `exports[].destinations[]` stays unit-tested only. |
| 9 | Continue On Fail | **PASS** — `{ error: "…" }` with `pairedItem` intact. |
| 10 | Timeout path | **NOT VERIFIED** live — every test render finished in seconds, and forcing a timeout means paying for a long render. Clamps and messages are unit-tested. |
| 11 | Never retry the `POST` | **PASS** — one `POST` per Render and Wait in the HTTP log. n8n's own "Retry On Fail" behaviour still needs the sandbox. |

The original instructions, kept for anyone re-running the pass by hand in
`npm run dev`:

1. **Template render end-to-end via Render and Wait.**
   Movie → *Render and Wait*, Input Mode *Template*. Check first that the
   **Template** resource locator's *From List* mode actually lists the
   account's templates (it calls `GET /v2/templates`; an empty list means the
   key's role is below `render`, or the list search silently failed — the
   *By ID* mode must keep working either way). Pick a template, fill its
   variables, execute. Expect: the node blocks for the length of the render,
   then emits one item with `status: "done"`, a playable `url`, `duration`
   (seconds), `size` (bytes), `width`/`height` (pixels) and `remaining_quota`.
   While it waits, confirm in the n8n/API logs that the first status check
   happens ~5 s after the POST and that the interval widens on long renders
   (5 → 8 → 11 …), never faster than 5 s.
2. **Raw-JSON render.** Same operation, Input Mode *Movie JSON*, leaving the
   pre-filled example document. Expect a rendered video with the text
   "Hello from n8n". Then repeat with Movie → *Create* and confirm it returns
   immediately with `{ success, project, timestamp }` and nothing else.
3. **A deliberately broken movie surfaces the API's message.** Two sub-cases,
   they exercise different code paths:
   - *Client-side*: type `{"scenes": [}` into Movie JSON. Expect the node to
     fail **without making a request**, with `Movie JSON is not valid JSON: …`
     naming the parse position.
   - *Server-side*: send valid JSON the renderer rejects, e.g.
     `{"scenes":[{"elements":[{"type":"video"}]}]}` (a `video` element with no
     `src`). Expect the JSON2Video message verbatim in the n8n error panel
     ("Scene #1 Element #2: The element type 'video' requires a 'src'
     property." or similar) — **not** a generic "400 - Bad Request".
   - Also confirm the render-failure path: with Render and Wait, a movie that
     starts and then fails must produce an error whose description reads
     `Render failed for project <16-char id>: <API message>`, and whose
     project ID is present. Then flip *Wait Options → Fail On Render Error*
     off and confirm the same movie is emitted as a normal item with
     `status: "error"` instead of throwing.
4. **Delete.** Movie → *Delete* with the project ID from step 1. Expect
   `{ success: true, project, deleted_at }`, the video URL to stop resolving,
   and the movie to still appear in *Get Many* with `deleted_at` set and
   `url: null`. Delete it a second time and confirm it still succeeds (the
   operation is idempotent).

Additional live checks worth doing in the same session:

5. **Get Status** with a real project ID, *Simplify* on (default) → the movie
   object plus `remaining_quota`; *Simplify* off → the raw envelope. Turn
   *Include Movie JSON* on and confirm the `json` field appears (it is
   suppressed by `format=simple` by default).
6. **Get Status with a bad ID**: 15 characters must fail client-side with
   `Project ID must be a 16-character string…`; a well-formed but unknown
   16-character ID returns HTTP 200 with `status: "error"` — confirm the node
   does not mistake it for a success.
7. **Get Many** with *Return All* off (limit 5) and on, plus a Start/End Date
   range. Expect one n8n item per movie.
8. **Webhook URL option**: set it to a Webhook Trigger URL in another
   workflow, run Movie → *Create*, and confirm the callback arrives — this is
   what the flat field's expansion into `exports[].destinations[]` is for.
9. **Continue On Fail**: enable it on a node configured to fail (e.g. bad
   project ID) and confirm the output item is `{ error: "…" }`, and that after
   a Render and Wait timeout the item also carries `project`.
10. **Timeout path**: set *Wait Options → Timeout* to 30 s on a movie that
    takes longer. Expect a failure quoting the project ID and pointing at
    Get Status — and confirm the render still completes on the JSON2Video
    side afterwards.
11. **Never retry the POST**: with n8n's "Retry On Fail" enabled on a Create
    node, confirm nothing in this node retries the submission itself (each
    retry is a new paid render — that is n8n's own behaviour and the reason
    the README must warn about it).

---

## Phase 5 — Template resource

Operations implemented: **Get Many**, **Get**, **Create**, **Update**,
**Duplicate**, **Delete**, **Get Library**. Contract:
`integrations/shared/operations.md` → "Resource: Template" + Appendix B
(B8, B10) + Appendix C.

### Automated checks (done, no API key needed)

```bash
cd integrations/n8n
npm run lint    # clean
npm run build   # clean
npm test        # 70 tests, 6 files
```

What `test/template.test.ts` locks down:

| Area | Covers |
|---|---|
| `withDualTemplateId` (B8) | `templateId` → also emits `id`; `id` → also emits `templateId`; a Duplicate response's extra `name` field survives; a response with neither key is untouched |
| `parseTagsParameter` | Comma-split + trim, empty segments dropped, arrays passed through trimmed, empty/non-string input → `[]` |
| `applyClientSideLimit` (B10) | Return All ignores Limit; Limit slices when Return All is off; a Limit larger than the list or non-positive/NaN falls back to the full list |
| `templateHasTag` | Case-insensitive match, absent tag, empty needle matches everything |
| `collectSortedTags` | Union + dedupe + sort across templates, empty when nothing has tags — backs the Get Many → Tag dropdown |
| `buildTemplateBody` | Create shape with all fields; Update sends only what changed; empty name/prompt/tags array are omitted, not sent as empty strings |
| `buildDeleteTemplateResponse` | The node echoes the deleted template ID that the raw `DELETE /templates` response omits |

`test/movie.test.ts`, `movieRequestBody.test.ts`, `polling.test.ts` and
`errors.test.ts` are unchanged and still green (Phase 4 regression guard).

### Live checks — DONE 2026-07-30

| # | Item | Result |
|---|---|---|
| 1 | Get Many + Tag dropdown | **PASS** — 101 templates, `updated_at` desc, Limit 2 → exactly 2 (client-side, B10), Return All → all 101. `getTemplateTags` returned the account's 7 real tags, deduplicated and sorted; filtering on one narrowed 101 → 1. |
| 2 | Get | **PASS** — `From List` lists the account's templates; `movie` came back as a **string**, left verbatim; Simplify off gives `{ success, template, timestamp }`; `format=jsonschema` drops `movie` and returns a JSON Schema in `variables`. Two undocumented fields recorded in `operations.md`: `owner` (boolean) and `prompt` (a boolean **flag**, not the prompt text). |
| 3 | Create | **PASS** — `{ success: true, templateId: <20 chars>, id: <same>, timestamp }` (B8). Tags `n8n-e2e, n8n-e2e-two` and the AI prompt both landed. The new template appeared immediately in `searchTemplates`. |
| 4 | Update | **PASS** — name-only update left tags, prompt and movie untouched; empty Update Fields failed client-side with **0** requests. |
| 5 | Duplicate | **PASS** — dual ID (B8); variables supplied through the key/value fields were deep-merged into the copy's `movie` (verified by reading the copy back). |
| 6 | Delete | **PASS** — `{ success: true, templateId: <id>, deleted: true }`, fields the raw API response omits. A subsequent Get returns `Template <id> not found` (HTTP **400**, not 404 — `operations.md` B16). |
| 7 | Get Library | **PASS** — 19 published templates with `video_url`/`thumbnail_url` and **no** `movie`; `tags=real estate` returned 21, confirming the documented server-side union rather than a filter; Limit slices client-side. |
| 8 | Role gating | **NOT VERIFIED** — only one, fully-permissioned key was available. |
| 9 | Continue On Fail | **PASS** (verified on Movie; same code path in `Json2Video.node.ts`). |
| 10 | Movie → Create not regressed | **PASS** — the Movie resource's template locator rendered successfully in the same pass. |

The original instructions, kept for anyone re-running the pass by hand:

1. **Get Many.** With no Additional Options, expect one item per template,
   sorted by `updated_at` descending. Set *Return All* off with *Limit* 2 on
   an account with more than 2 templates and confirm exactly 2 items come
   back (client-side slicing — the API has no server-side pagination here,
   Appendix B / B10). Then set *Return All* on and confirm every template
   appears. Open Additional Options → **Tag**: confirm the dropdown lists
   the account's own tags (deduplicated, sorted, backed by
   `getTemplateTags`), pick one, and confirm only matching templates are
   returned.
2. **Get.** Pick a template via the **Template** resource locator's *From
   List* mode (must call `GET /templates` and list the account's templates —
   an empty list without erroring means the key's role is too low or the
   list search silently failed; *By ID* must keep working either way).
   Confirm the response contains `movie` verbatim (as a string or object,
   whichever the template was stored as — do not expect it pre-parsed).
   Toggle *Simplify* off and confirm the raw envelope (`{ success, template,
   timestamp }`) appears instead. Set *Variables Format* to **JSON Schema**
   and confirm `template.movie` is absent and `template.variables` holds a
   JSON Schema document instead.
3. **Create.** Fill *Name* and leave the pre-filled example Movie JSON.
   Execute and expect `{ success: true, templateId: "<20-char id>", id:
   "<same 20-char id>", timestamp }` — both keys must carry the same value
   (Appendix B / B8). Add *Tags* (`demo, showcase`) and an *AI Prompt* in
   Additional Options and confirm they land on the template (check with Get).
   Confirm the new template now appears in the **Template** resource
   locator's *From List* mode on this same node (Movie → Create's template
   picker too).
4. **Update.** Pick the template created in step 3, set *Update Fields →
   Name* only, leave Movie JSON/Tags/AI Prompt empty. Execute and confirm
   with Get that only the name changed — tags, prompt and movie body must be
   untouched. Then update *Movie JSON* alone and confirm with Get that it
   was replaced wholesale (not merged). Try Update with *Update Fields*
   completely empty and confirm the node fails client-side with "Update
   Fields must include at least one field to change" — no request should
   reach the API.
5. **Duplicate.** Use the **Source Template ID** resource locator's *From
   Library* mode (must call `GET /templates/library` and list public
   templates labelled `Name (WxH)`) to copy a library template into the
   account with no *Name* override. Confirm the response's `name` ends in
   " (custom)" and that `templateId`/`id` both appear (B8). Repeat with
   *From List* against one of the account's own templates, an explicit
   *Name*, and *Variables* filled in via both the key/value fields and the
   JSON toggle — confirm the variables were deep-merged into the copy (Get
   the new template and inspect `movie`).
6. **Delete.** Delete the template created in step 3. Expect `{ success:
   true, templateId: "<id>", deleted: true }` (the raw API response has
   neither `templateId` nor `id` — confirm the node is the one adding it).
   Confirm the template no longer appears in Get Many, and that Get on the
   deleted ID now 404s with "Template `<id>` not found".
7. **Get Library.** Run with default options and confirm items come back
   sorted by `updated_at` descending, each with `video_url` and
   `thumbnail_url`, and **no** `movie` field (the library never returns it —
   confirm the description's guidance to Duplicate-then-Get holds). Set
   *Additional Options → Tags* to a tag combination and confirm the result
   always includes every published template plus any carrying one of the
   given tags (a genuine server-side filter, unlike Get Many's client-side
   Tag). Test *Return All* off with a small *Limit* and confirm client-side
   slicing again.
8. **Role gating.** With a `render`-only API key, confirm Create, Update,
   Duplicate and Delete all fail with "This API key needs the Editor role to
   manage templates" (or the verbatim `Insufficient permissions` API
   message), while Get Many, Get and Get Library keep working.
9. **Continue On Fail.** Enable it on a Get with a non-existent template ID
   and confirm the output item is `{ error: "Template <id> not found" }`
   instead of the node throwing.
10. **Movie → Create still works.** Confirm the Movie resource's Template
    resourceLocator (unchanged by this phase) still lists templates and
    renders successfully — Phase 5 must not regress Phase 4.

---

## Phase 6 — Storage resource (internally `media`)

Operations implemented: **Upload File**, **Get File**, **List Folder**,
**Get Folder Tree**, **Move File**, **Delete File**, **Create Folder**,
**Delete Folder**, **Get Storage Usage**. Contract:
`integrations/shared/operations.md` → "Resource: Media" + Appendix B (B12) +
Appendix C.

### Automated checks (done, no API key needed)

```bash
cd integrations/n8n
npm run lint    # clean
npm run build   # clean
npm test        # 130 tests, 6 files
```

What `test/media.test.ts` locks down:

| Area | Covers |
|---|---|
| `normalizeMediaPath` / `toListFolderPath` / `joinMediaPath` | Leading, trailing and repeated slashes stripped; every spelling of the root folder (`''`, `'/'`, `undefined`) collapsed to the empty string; `GET /media/folder` alone gets `/` back |
| `sanitizeMediaFileName` | Characters outside `a-z A-Z 0-9 . _ -` become `_`, so the emitted `path`/`url` match what the API really stored |
| `resolveUploadFileName` / `resolveUploadContentType` | Override wins over the binary's own values; missing name → `undefined` (the operation must fail, `name` is required); missing MIME type → `application/octet-stream` |
| `buildUploadBody` | Step 1 body shape; `folder` omitted at the root |
| `validateUploadSize` | Empty binary rejected; the 500 MB (524288000 bytes) ceiling checked client-side, before the round trip |
| `extractPresignedUpload` | `uploadUrl`/`fileUrl` read, `expiresIn` defaulted to the documented 120 s, missing `uploadUrl` → step 2 never attempted |
| `buildUploadOutput` | Emits `url` + `path`, and **never** `uploadUrl` (a signed secret that must not reach execution logs) |
| `describeUploadRegistrationError` (step 1) | 409 → "use Delete File / a different name", 413 → the 500 MB ceiling, 403 split between blocked storage and an insufficient role, and nothing added when the API message already stands alone |
| `describeUploadTransferError` (step 2) | 403 → the 120-second presigned-URL expiry, other codes named, readable without a status code |
| `buildMoveFileBody` | `destination` is **always** sent, empty string included — omitting it makes the API answer `destination is required` |
| `buildMoveFileOutput` / `buildDeleteFileOutput` / `buildDeleteFolderOutput` | The node echoes what the bare `{ success, timestamp }` responses omit |
| `buildCreateFolderOutput` | The idempotent `message: "Folder already exists"` passed through and turned into a `created` flag |
| `describeDeleteFolderError` | The empty-folder rule, the undeletable root and `temp` folders, and the role failure |
| `buildListFolderQuery` | Root sent as `/`, zero-based `page` + `page_size`, `type`/`q` added only when set |
| `extractListFolderMeta` / `buildListFolderItems` | One item per file with the sub-folder names attached to the first; an empty folder still emits one informational item instead of nothing; inputs never mutated |
| `buildFolderOptions` / `buildFileOptions` | Appendix C dropdowns: folder labels with file counts and an empty value for the root; file values as a full `path` (Get File) or a bare `name` (Move / Delete File) |
| `appendErrorHint` | Hints land on the error *description*, never on the API's `message`; existing descriptions are appended to, not replaced; plain `Error`s are left alone |

`test/movie.test.ts`, `movieRequestBody.test.ts`, `polling.test.ts`,
`errors.test.ts` and `template.test.ts` are unchanged and still green
(Phase 4 + 5 regression guard).

### Live checks — DONE 2026-07-30

| # | Item | Result |
|---|---|---|
| 1 | Upload a real binary end-to-end | **PASS** — see [the two-step upload](#the-two-step-upload-phase-6s-open-risk). Emitted `{ success, name, folder, path, contentType, size, url }`, no `uploadUrl`; stored bytes byte-identical (SHA-256 match); `mi vídeo (final).png` → `mi_v_deo__final_.png` with the server agreeing. |
| 2 | Upload failure paths | **PASS** — no file name → client-side failure with **0** requests; duplicate → the API's 409 message verbatim **plus** the Delete File hint (this hint was broken until this pass, see bug 1). Oversized (>500 MB) is unit-tested only. Step 2 was never observed failing. **The `PUT` carried no `x-api-key` and the correct `Content-Length`/`Content-Type`** — Phase 6's open risk, now closed. |
| 3 | Get File | **PASS** — Simplify on/off; a missing path returns `File not found` (HTTP 400, B16). **Note:** right after a successful upload the record reads `status: "pending"` for a few seconds before flipping to `uploaded`, so `pending` is not proof that step 2 failed (`operations.md` B17). |
| 4 | List Folder | **PASS** — root emits one item per file with `folders` on the first item only; an empty folder emits the single informational item; Limit 3 → exactly 3; Return All → all 16; `type=video` → 2, `q=zillow` → 2. The `total` (filtered) vs `total_files` (whole folder) distinction exists in the raw response and is confirmed, but the node only surfaces the counters on the empty-folder item — by design, so the non-empty output schema stays "one item per file". |
| 5 | Get Folder Tree | **PASS** — 7 folders including `/` and `temp`, with `files` and `size`; consistent with Get Storage Usage. |
| 6 | Create Folder | **PASS** — idempotent second call → `created: false` + `message: "Folder already exists"`; empty path refused client-side. |
| 7 | Move File | **PASS** — including the important case: moving to the **root** with an empty `destination` works, so the "always send `destination`" rule is confirmed. Round-tripped back into the folder and verified with Get File. |
| 8 | Delete Folder | **PASS** — non-empty → `Folder is not empty. Delete all files first.` **plus** the hint; `temp` → `Cannot delete the temp folder` **plus** the hint; root refused client-side. Both hints were dead code before this pass (bug 1). |
| 9 | Delete File | **PASS** — `{ success, name, folder, path, deleted: true }`, all added by the node; a second delete returns the API's `File not found`. |
| 10 | Get Storage Usage | **PASS** — `used_bytes`, `free_allowance: 52428800`, `credits_per_week`, `blocked: false`, `blocked_at: null`; Simplify off gives the envelope. |
| 11 | Dropdown degradation | **PASS** — with a deliberately wrong key all six dropdowns returned an **empty** list and none threw. |
| 12 | Continue On Fail | **PASS**. |
| 13 | Multiple input items | **PASS** — three binary items → three uploads, three output items, `pairedItem` 0/1/2. |
| 14 | Phases 4 and 5 not regressed | **PASS** — a Render and Wait and a Template Get Many ran in the same pass. |

The original instructions, kept for anyone re-running the pass by hand:

1. **Upload a real binary from a previous node and see it in the dashboard
   Drive.** Build `HTTP Request` (GET a small MP4 or PNG, *Response Format*
   **File**) → **JSON2Video → Media → Upload File**, *Input Binary Field*
   `data`. Execute and expect one item
   `{ success, name, folder, path, contentType, size, url }` — and **no
   `uploadUrl`** anywhere in the output or in the execution log. Open
   <https://json2video.com/dashboard> → Drive and confirm the file is there
   with the right size and preview. Paste the emitted `url` into a
   Movie → Create element `src` and render, to prove the URL is usable
   downstream. Repeat with *Additional Options → Folder* set to a real folder,
   then with *File Name* set to something containing spaces and accents (e.g.
   `mi vídeo (final).mp4`) and confirm the stored name is `mi_v_deo__final_.mp4`
   and that the emitted `path` matches it — this is the client-side
   sanitisation agreeing with the server.
2. **Upload failure paths.**
   - *No file name*: feed binary data with no `fileName` (e.g. from a Code
     node) and leave *File Name* empty. Expect a client-side failure "The file
     to upload has no name" with **no** request made.
   - *Duplicate*: upload the same file twice into the same folder. The second
     run must show the API's 409 message verbatim plus the appended hint
     pointing at Media → Delete File.
   - *Oversized*: a file over 500 MB must fail client-side ("…over the
     JSON2Video limit of 500 MB…") before any request.
   - *Step 2*: hard to force deliberately; if it ever happens, the error must
     read "Storage rejected the upload of …: the presigned upload URL expired…"
     with the pending-state description — **not** raw S3 XML. Check afterwards
     with Get File that the record is `status: "pending"`, delete it, and
     confirm the re-upload then succeeds.
   - Watch the network/console: the `PUT` to the presigned URL must **not**
     carry `x-api-key` (it would break the S3 signature), and its
     `Content-Type` must equal the `contentType` sent in step 1.
3. **Get File.** Pick the folder in *Folder*, then the file in *File* — confirm
   the file dropdown repopulates when the folder changes
   (`loadOptionsDependsOn`). Expect `name`, `folder`, `type`, `contentType`,
   `size` (bytes), `url`, `status: "uploaded"`, `temporary`, `created_at`.
   Toggle *Simplify* off and confirm the raw `{ success, file, … }` envelope.
   Try a path that does not exist and confirm the API's `File not found`.
4. **List Folder.** Root first (leave *Folder* empty): expect one item per
   file, with `folders` (the sub-folder names) on the **first** item only. On
   an empty folder, confirm a single informational item comes back
   (`{ path, folders, files: [], total, total_files, total_size }`) rather than
   nothing. Set *Limit* 2 on a folder with more files and confirm exactly 2
   items; then *Return All* on and confirm every file appears (server-side
   paging, 100 per request). Set *Additional Options → File Type* to **Video**
   and *Search* to a substring and confirm both filters apply, and that
   `total` reflects the filtered count while `total_files` counts the folder.
5. **Get Folder Tree.** Expect one item per folder with `path`, `files`,
   `size` — including `/` for the root and `temp`. Cross-check the numbers
   against Get Storage Usage.
6. **Create Folder.** Create `n8n-test/nested` in one call and confirm both
   levels appear in Get Folder Tree. Run it a second time and confirm it
   succeeds with `created: false` and `message: "Folder already exists"`
   (idempotent). Try a name full of invalid characters and confirm the API's
   `Invalid folder name`.
7. **Move File.** Move the uploaded file from its folder into `n8n-test`,
   using the *Source Folder* / *File* / *Destination Folder* dropdowns. Expect
   `{ success, name, folder: "n8n-test", path: "n8n-test/<name>", moved: true }`
   and confirm with Get File. Then move it to the **root** by leaving
   *Destination Folder* empty — this is the case that breaks if `destination`
   is omitted instead of sent as `""`; the API must not answer
   `destination is required`. Move it into `temp` and confirm Get File now
   reports `temporary: true` and that Get Storage Usage `used_bytes` drops.
   Finally, provoke a 409 by moving a file into a folder that already has a
   file of that name.
8. **Delete Folder.** Try deleting `n8n-test` while it still holds the file:
   expect the API's `Folder is not empty. Delete all files first.` **plus** the
   appended hint about deleting the files first. Delete the file, retry, and
   expect `{ success: true, folder, deleted: true }`. Then try deleting the
   root (leave the field empty → client-side "No folder selected") and `temp`
   (expect `Cannot delete the temp folder` with its hint).
9. **Delete File.** Delete the uploaded file with the *Folder* + *File*
   dropdowns. Expect `{ success, name, folder, path, deleted: true }` — the raw
   API response has none of those fields, so confirm the node is adding them.
   Confirm the file is gone from the dashboard Drive and that Get Storage Usage
   `used_bytes` decreased. Delete it again and confirm the API's `File not
   found`.
10. **Get Storage Usage.** Expect `used_bytes`, `free_allowance` (52428800 =
    50 MB), `credits_per_week`, `blocked: false`, `blocked_at: null`. Toggle
    *Simplify* off for the `{ success, storage, … }` envelope.
11. **Dropdown degradation (Appendix C).** With a deliberately wrong API key,
    open the Folder and File dropdowns: they must render **empty** and must not
    break the parameter panel or throw. Confirm every one of them can still be
    switched to an expression and driven from a previous node's data — that is
    the escape hatch for folders that do not exist yet.
12. **Continue On Fail.** Enable it on a Delete File pointed at a missing file
    and confirm the output item is `{ error: "File not found" }` instead of the
    node throwing, with `pairedItem` intact.
13. **Multiple input items.** Feed three binary items into one Upload File node
    and confirm three uploads, three output items, and correct `pairedItem`
    mapping (n8n's *Item Linking* view).
14. **Phases 4 and 5 not regressed.** Re-run one Movie → Render and Wait and
    one Template → Get Many in the same workflow.

## Phase 8 — CI/CD: provenance publishing

### Automated checks (done)

- `.github/workflows/ci.yml` — lint + build + `npm test` (175 tests since the
  2026-07-30 live pass added 9 regression tests; 166 before) on every
  push/PR to `main`. Green on GitHub Actions.
- `.github/workflows/publish.yml` — scaffolded via
  `n8n-node release --init-workflow` (`@n8n/node-cli` 0.41.2), cross-checked
  against `n8n-io/n8n-nodes-starter`. Fixed a template bug where Handlebars
  swallowed the literal `${{ secrets.NPM_TOKEN }}` GitHub Actions expression
  (rendered as a bare `$`) because the raw template already uses
  double-brace syntax that Handlebars itself parses. Triggers on tag push
  matching `*.*.*`, requests `id-token: write`, runs on Node `lts/*`
  (resolved to Node 24 at time of release — satisfies the ≥20 requirement),
  and publishes with `NPM_CONFIG_PROVENANCE=true` via `npm run release`
  (`n8n-node release`, which detects `GITHUB_ACTIONS` and runs
  lint → build → `npm publish` in that mode).
- **`0.2.0` released 2026-07-29 as the pipeline-validation release** — the
  first version ever published through this GitHub Actions workflow with npm
  provenance (npm trusted publisher, OIDC, no `NPM_TOKEN` secret configured
  or needed). `0.0.1` was a manual `--ignore-scripts` placeholder publish used
  only to reserve the package name on npm; it was never a real release and
  has no provenance. Verified:
  - `npm view n8n-nodes-json2video@0.2.0` shows `published ... by GitHub
    Actions <npm-oidc-no-reply@github.com>`.
  - `curl https://registry.npmjs.org/-/npm/v1/attestations/n8n-nodes-json2video@0.2.0`
    returns a sigstore attestation bundle with a Rekor transparency-log entry.
  - `npm audit signatures` after installing the package in a scratch
    directory reports the package among those with "verified attestations".
  - `dist-tags.latest` is `0.2.0`.
  - GitHub release `0.2.0` published at
    <https://github.com/JSON2Video/n8n-nodes-json2video/releases/tag/0.2.0>.

### Not done yet

- **`1.0.0`** was gated on the live end-to-end pass, which is now **done and
  green** (2026-07-30, three bugs found and fixed — see
  [Live end-to-end pass](#live-end-to-end-pass--2026-07-30)). What remains before
  cutting it is not API-related:
  - a sandbox run of `npm run dev` for the credential modal and parameter panel
    (Phase 3 steps 1–3 and 6);
  - the clean-install test below.
- Install test on a clean self-hosted n8n instance (`Settings → Community
  Nodes → n8n-nodes-json2video`) — still pending, tracked for Phase 8's
  acceptance criteria / Phase 9 submission prep.
- **Not verifiable with one API key**: role gating (needs a second,
  `render`-only key) and live webhook delivery (needs a publicly reachable
  endpoint).
## Template variable mapper — 2026-07-30 (supersedes the 0.3.0 dropdown)

The Variables section of Movie → Create / Render and Wait is a
[`resourceMapper`](https://docs.n8n.io/integrations/creating-nodes/build/reference/ui-elements/)
parameter: n8n asks the node for the variables of the selected template and
renders **one labelled, typed input per variable**. It replaces the 0.3.0
name/value collection whose *Name* side was a `loadOptions` dropdown, so the
seventh dynamic dropdown of the live pass above no longer exists — the same data
source (`GET /templates?id=…&format=make`) now feeds
`methods.resourceMapping.getTemplateVariableFields`.

### How the template dependency works

`type: 'resourceMapper'` has no dependency mechanism of its own. n8n's
`ResourceMapper` component is handed a `dependentParametersValues` prop that
`ParameterInputList` computes from **`typeOptions.loadOptionsDependsOn`** — the
same key a plain `options` dropdown uses — by resolving each listed path against
the current node parameters and joining the results. The component watches that
string and, when it changes, clears the mapped values and refetches the schema:

```ts
// editor-ui ResourceMapper.vue — "Reload fields to map when dependent parameters change"
watch(
  () => props.dependentParametersValues,
  async (currentValue, oldValue) => {
    if (oldValue !== null && currentValue !== null && oldValue !== currentValue) {
      state.paramValue = { ...state.paramValue, value: null, schema: [] };
      emitValueChanged();
      await initFetching();
      setDefaultFieldValues(true);
    }
  },
);
```

So the property carries `loadOptionsDependsOn: ['templateId.value']` — the
resource locator's **inner value**, because the resolved path is read with
`get(resolvedNodeParameters, 'templateId.value')`; depending on `['templateId']`
would compare two object references and never fire. Verified against the n8n
sources for the installed line (`n8n-workflow@2.32.1`):
`INodePropertyTypeOptions` declares `loadOptionsDependsOn` and `resourceMapper`
side by side, `ParameterInputList.getDependentParametersValues()` reads the
former, and `ResourceMapper.vue` holds the watcher above. The node's own
`.agents/properties.md` documents the same pairing.

Server-side, `getResourceMappingFields` builds the very same `LoadOptionsContext`
that `loadOptions` gets, so `getCurrentNodeParameter('templateId')` returns the
`{ mode, value }` locator and `extractTemplateId` still applies.

### Automated checks

`test/template.test.ts` locks the pure mapping down:

| Area | Covers |
|---|---|
| `extractTemplateId` | Reads the ID out of a `{ mode, value }` resourceLocator (list and ID mode, trimmed), accepts the bare string an expression produces, and returns `''` for nothing-selected-yet / non-object / non-string input |
| `templateVariableFieldType` | `text`→`string`, `number`→`number`, `select`→`options`, `boolean`→`boolean`, `array`→`array`, `collection`→`object`; anything unknown (`url`, `colorpicker`, missing) → `string`, so a new API type never hides a variable |
| `coerceVariableDefault` | `format=make` stringifies every default: `"600"`→`600`, `"false"`→`false` (a truthy string would switch the toggle on), text kept, empty dropped, `"[object Object]"` dropped, and JSON-editor types never pre-filled |
| `buildVariableSelectOptions` | `{ label, value }` → `{ name, value }`; numeric-looking values stay strings; label falls back to the value; unusable entries skipped |
| `buildTemplateVariableFields` | One field per variable, `id` = raw name and `displayName` = the template's label (falling back to the name); `make_webhook_url` and `client_data` filtered **by exact name**; an `advanced` user variable is **kept**; `select` becomes a dropdown carrying its choices and degrades to a text box when it has none; `array`/`collection` get a JSON editor and no junk default; the rare `required: true` is honoured; `defaultMatch`/`canBeUsedToMatch` always `false`; the template's declared order preserved; malformed payloads → `[]` |
| `extractMappedVariables` | `defineBelow` sends the filled values with their types intact and skips the `null`s n8n uses for "left empty"; `autoMapInputData` takes the incoming item's keys that match a schema field and ignores the rest; an unloaded schema sends nothing rather than guessing; malformed input → `{}` |

`test/descriptions.test.ts` additionally asserts the whole `resourceMapper`
configuration (method name, `mode: 'add'`, `fieldWords`, `addAllFields`,
`multiKeyMatch`, `supportAutoMap`, `hideNoDataError`, the `loadOptionsDependsOn`
path, the `{ mappingMode: 'defineBelow', value: null }` default), that the method
is registered under `methods.resourceMapping`, that the raw-JSON mode is the only
other way to provide variables, and that the 0.3.0 `variablesUi` collection and
`getTemplateVariables` handler are gone from the Movie resource.

### Live checks — DONE 2026-07-30

The **compiled** `getTemplateVariableFields` in `dist/` was driven with a mock
`ILoadOptionsFunctions` making real HTTP requests, over an account with 101
templates / 628 declared variables. Read-only: 11 `GET`s, no write, no render.

| # | Item | Result |
|---|---|---|
| 1 | Text-only template ("Simple quote of the day") | **PASS** — `Quote` → `string`, default `"This is my quote today"`; `Author` → `string`, default `"John Doe"` |
| 2 | `select` + `array` + `collection` ("Social Media - General Template") | **PASS** — 10 fields. `Render Mode` → `options` with `Test (image slideshow):slideshow \| Final video (avatar video):video`, default `"video"`; `Scenes` → `array`; `Avatar`, `Voice1`, `Subtitles`, `Music`, `Brand` → `object`; no `[object Object]` default anywhere |
| 3 | `select` with numeric values + `url` + `required` ("Holger merge audio-video") | **PASS** — `Video URL` → `string`, **required**; `Start point` → `number` default `0`; `Video volume` → `options` `Muted:0 … Normal:1` default `"0"`; `Trim audio` → `options` `Yes:-2 \| No:-1` |
| 4 | Numbers and booleans ("Color correction") | **PASS** — `Contrast`/`Brightness`/`Saturation`/`Gamma` → `number` with numeric defaults `1`, `0`, `1`, `1`; `Flip horizontally`/`Flip vertically` → `boolean` with default `false` (a real boolean, not the string `"false"` the API sends) |
| 5 | Template with no variables ("Jason Stevens") | **PASS** — 0 fields plus the "declares no variables" notice; the two Make.com artifacts were its only variables and both were filtered |
| 6 | Nothing selected yet | **PASS** — 0 fields, **0 requests**, "select a template above" notice |
| 7 | Unknown template ID | **PASS** — 0 fields, did not throw, "could not be loaded" notice |
| 8 | Expression-supplied template ID (bare string, not a locator) | **PASS** — resolved, 2 fields |
| 9 | Wrong API key | **PASS** — 0 fields, did not throw, "could not be loaded" notice |
| 10 | Refresh on template change | **PASS** — the same handler returned `quote, author` for one template and `my_text, photos` for another, so a changed `templateId.value` yields a different field list |
| 11 | Runtime extraction against a live schema | **PASS** — `defineBelow` `{ video_URL, video_volume: "0.5", audio_URL: null }` → `{ video_URL, video_volume }`; `autoMapInputData` with an item carrying `video_URL`, `trim_audio` and `not_a_variable` → `{ video_URL, trim_audio }` |

Type distribution across the whole account (628 variables, Make.com artifacts
excluded): `text` 454, `number` 71, `array` 36, `collection` 36, `select` 23,
`url` 4, `boolean` 4. `url` is **not** in the mapping table and is what proves
the unknown-type fallback matters — it renders as a text box. `required: true`
appears on 2 of the 628, which is why it is honoured rather than hard-coded to
`false`.

### Not verifiable outside a browser

- That the parameter panel visually renders the fields as `Label: [input]` rows,
  and that the **Map Automatically** / refresh controls appear. The field
  contract they render from is what the checks above cover.
- That the watcher above actually fires on a template change in a live editor.
  What was verified is both halves either side of it: the n8n source path that
  wires `loadOptionsDependsOn` → `dependentParametersValues` → refetch, and that
  the handler returns a different field list per template (case 10).
- `help` text is **not shown anywhere**. `ResourceMapperField` has no
  description, hint or tooltip member, and `MappingFields.vue` hard-codes the
  per-field description to either the "using to match" or the "mandatory field"
  string — a value supplied by the node would be discarded. The 0.3.0 dropdown
  could show it because a dropdown option has a `description`; the mapper has no
  equivalent surface. 56 of the 628 variables carry `help`.
