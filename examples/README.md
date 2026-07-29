# Example workflows

Four ready-to-import workflows covering the patterns most JSON2Video users need.

## How to import

1. In n8n, open **Workflows** and select **Import from File** (or paste the JSON
   into an empty canvas).
2. Open the JSON2Video node and pick your **JSON2Video API** credential — the
   files reference a credential named `JSON2Video account`, so if yours is
   called something else you need to select it once per node.
3. Replace the placeholder template ID `LerKrmBfiqaIgBuacLWn` with one of your
   own. **Template → Get Many** lists your templates and their IDs, or use the
   template picker in the node instead of typing an ID.

## The workflows

### [`01-render-template-and-get-url.json`](./01-render-template-and-get-url.json)

Manual Trigger → Set → **Movie: Render and Wait** → Set.

The shortest useful workflow: fill a template's variables, wait for the render,
and read `url`, `duration` (seconds) and `size` (bytes) off the output. Start
here.

### [`02-rss-to-social-reel.json`](./02-rss-to-social-reel.json)

Schedule Trigger → RSS Feed Read → Limit → **Movie: Render and Wait** → Set.

Turns the newest post of a feed into a vertical 1080x1920 reel every six hours.
Shows the JSON variables mode (build the whole variables object with one
expression) and **Client Data**, which carries the source URL through the render
and comes back on the output item.

### [`03-upload-asset-and-render.json`](./03-upload-asset-and-render.json)

Manual Trigger → HTTP Request → **Media: Upload File** → **Movie: Render and Wait**.

Downloads a file, uploads it to the JSON2Video Drive, and drops the returned
`url` straight into an element's `src`. The upload output is the bridge: `url`
is a public URL the renderer can read.

### [`04-long-render-with-webhook.json`](./04-long-render-with-webhook.json)

Two independent chains in one workflow:

- Manual Trigger → **Movie: Create** (with a Webhook URL) — submits and returns
  immediately.
- Webhook → **Movie: Get Status** → Set — runs when JSON2Video calls back.

This is the pattern to use when renders can outlive your n8n execution limit.
Point the node's **Webhook URL** option at the *production* URL of the Webhook
node in this workflow before activating it.

## Notes

- Every render consumes credits (1 credit per second of output video), including
  the ones triggered while testing.
- `Render and Wait` holds the n8n execution open for the whole render. Its
  default timeout is 600 seconds; raise it under **Wait Options → Timeout**, or
  switch to workflow 04 if your renders are longer than your execution limit.
