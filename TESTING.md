# Testing

Manual verification notes for this package, kept alongside the code so each
phase of the build plan (`integrations/plans/n8n.md`) can record how it was
checked. Automated tests will be added once there is enough surface area to
warrant them (Phase 4+); until then, verification is manual, in n8n's own dev
sandbox.

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
