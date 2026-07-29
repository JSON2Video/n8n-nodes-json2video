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
