# Testing

Verification notes for this package, kept alongside the code so each phase of
the build plan (`integrations/plans/n8n.md`) can record how it was checked.

Two layers:

- **Automated unit tests** (`test/`, Vitest) cover the pure logic that has no
  business being verified by hand: payload building, JSON validation, the
  polling backoff and API error extraction. Run them with `npm test`.
- **Manual checks** in n8n's own dev sandbox (`npm run dev`) cover everything
  that needs a real API key and a real render.

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

### Phase 3 pending live check

**Not yet performed.** There is no JSON2Video test API key available in this
environment — Phase 0 (accounts & external prerequisites) reserves one for
end-to-end testing, but it has not been handed over yet. Steps 1–3, 5, 6 and 7
above can be (and were) reasoned through / dry-run against the code, but step
4 (the actual "valid key succeeds" path) and the live confirmation of step 5
against the real API **still need a human with a real JSON2Video API key** to
run `npm run dev` and click through the credential UI. Do this before
considering Phase 3 fully closed.

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

### Live checks pending — run these the moment the API key arrives

Still **not performed**: there is no JSON2Video API key in this environment
(Phase 0 reserves one). Start the sandbox with `npm run dev`, add the
**JSON2Video API** credential, then work through the list. All four are
acceptance criteria of Phase 4 in `integrations/plans/n8n.md`.

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

### Live checks pending — run these the moment the API key arrives

Still **not performed**: there is no JSON2Video API key in this environment
(Phase 0 reserves one). Start the sandbox with `npm run dev`, add the
**JSON2Video API** credential (needs at least the `editor` role for Create,
Update, Duplicate and Delete — a `render`-only key must fail those four with
"This API key needs the Editor role to manage templates").

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

## Phase 6 — Media resource

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

### Live checks pending — run these the moment the API key arrives

Still **not performed**: there is no JSON2Video API key in this environment
(Phase 0 reserves one). Start the sandbox with `npm run dev` and add the
**JSON2Video API** credential (role `render` is enough for every Media
operation). Item 1 is the Phase 6 acceptance criterion in
`integrations/plans/n8n.md`.

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

- `.github/workflows/ci.yml` — lint + build + `npm test` (166 tests) on every
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

- **`1.0.0` is reserved for after a live end-to-end pass** against the real
  JSON2Video API (needs the Phase 0 test API key, not yet available — see the
  "Live checks pending" sections above). Do not cut `1.0.0` until those pass.
- Install test on a clean self-hosted n8n instance (`Settings → Community
  Nodes → n8n-nodes-json2video`) — still pending, tracked for Phase 8's
  acceptance criteria / Phase 9 submission prep.
