# n8n-nodes-json2video

Official n8n node for [JSON2Video](https://json2video.com) — create and render videos programmatically from JSON or templates. Fill a template's variables from any workflow data, wait for the render, and get back a video URL you can publish, email or store.

**Official node — built and maintained by the JSON2Video team.**

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) · [Usage](#usage) · [Use with AI Agents](#use-with-ai-agents) · [Example workflows](#example-workflows) · [Compatibility](#compatibility) · [Resources](#resources)

## Installation

### n8n Cloud

Search for **JSON2Video** in the nodes panel and select **Install**. Verified community nodes install without leaving the editor.

### Self-hosted

Follow the [community node installation guide](https://docs.n8n.io/integrations/community-nodes/installation/), or install from the UI:

1. Go to **Settings → Community Nodes**.
2. Select **Install**.
3. Enter `n8n-nodes-json2video`.
4. Agree to the risks and select **Install**.

## Credentials

The node authenticates with a JSON2Video API key.

1. Sign up or log in at [json2video.com](https://json2video.com).
2. Open the dashboard and go to **API Keys** — <https://json2video.com/dashboard/apikeys>. See the [API keys guide](https://json2video.com/docs/v2/guides/dashboard/api-keys) for what each key role can do.
3. Copy an existing key or create a new one. The **Render** role is enough to render movies and use the Drive; **Editor** is needed to create, update or delete templates.
4. In n8n, create a **JSON2Video API** credential and paste the key into the **API Key** field.

The key is sent as the `x-api-key` header on every request. It is stored encrypted by n8n, is never logged, and is never echoed back in error messages.

## Operations

21 operations across three resources.

### Movie

| Operation | Description |
| --- | --- |
| Create | Submit a render job and return immediately with a 16-character project ID |
| Render and Wait | Submit a render job and poll until it finishes, then return the video URL |
| Get Status | Get the status of one movie by project ID, including the URL once it is done |
| Get Many | List the movies rendered by the account within a date range |
| Delete | Delete a rendered video file before its automatic 7-day expiry |

Both Create and Render and Wait accept either a **saved template plus variables** or a **full Movie JSON document**, and can override resolution, quality, frame rate, cache, client data and the webhook destination.

### Template

| Operation | Description |
| --- | --- |
| Create | Save a new template from a Movie JSON document with `{{variable}}` placeholders |
| Get | Get one template, including its stored Movie JSON or a JSON Schema of its variables |
| Get Many | List the account's own templates, optionally filtered by tag |
| Get Library | List the public template gallery published by JSON2Video |
| Duplicate | Copy a template — your own or one from the library — into the account |
| Update | Change the name, Movie JSON, tags or AI prompt of a template |
| Delete | Delete a template |

### Storage

Storage operations work against the JSON2Video Drive, the file storage attached to the account. (The resource's internal parameter value is `media`, matching the `/v2/media/*` endpoints — only the label reads Storage.)

| Operation | Description |
| --- | --- |
| Upload File | Upload binary data from a previous node and return its public URL |
| Get File | Get one file by path, with its URL, size in bytes and upload status |
| List Folder | List the files in one folder, filtered by media type or name |
| Get Folder Tree | List every folder with its file count and total size in bytes |
| Move File | Move a file to another folder |
| Delete File | Delete one file |
| Create Folder | Create a folder, nested paths included |
| Delete Folder | Delete an empty folder |
| Get Storage Usage | Get bytes used, the free allowance and whether uploads are blocked |

## Usage

### Render a template and get the video URL

The common case is a saved template whose `{{placeholders}}` are filled from workflow data. Create the template once in the [dashboard](https://json2video.com/dashboard) or with **Template → Create**:

```json
{
  "resolution": "instagram-story",
  "scenes": [
    {
      "elements": [
        { "type": "image", "src": "{{background_image}}", "duration": -1 },
        { "type": "text", "text": "{{quote_text}}", "style": "003", "duration": -1 }
      ]
    }
  ]
}
```

Then configure the node:

- **Resource**: Movie · **Operation**: Render and Wait
- **Input Mode**: Template · **Template**: pick it from the list
- **Variables**: one labelled input per variable, filled in below

Pick a template and the **Variables** section renders itself from that template — one input per variable it declares, labelled and typed the way the template author defined it:

```
Quote text:       [ Ship it                        ]
Background image: [ https://example.com/bg.jpg     ]
Render mode:      [ Final video (avatar video)  ▾  ]
Title weight:     [ 600                           ]
Flip vertically:  [ off ]
Scenes:           [ { "voiceoverText": "Hello" }   ]   (JSON editor)
```

Text variables get a text box, numbers a numeric box, `select` variables a dropdown of their allowed values, booleans a toggle, and `array` / `collection` variables a JSON editor. Each input is pre-filled with the template's own default, and every one of them accepts an expression, so `{{ $json.quote }}` works anywhere. Changing the selected template reloads the list.

Two extra controls come with the section:

- **Map Automatically** fills every variable from the incoming item's field of the same name — handy when an upstream Set node already produces `quote_text`, `background_image` and so on.
- The **+ Add variable / refresh** menu re-reads the template if you edited it in another tab.

Switch **Specify Variables** to **Using JSON** for the cases the fields cannot express: a whole variables object built by one expression, values for variables the template does not declare, or an intentionally empty string.

```json
{ "quote_text": "Ship it", "scenes": [{ "voiceoverText": "Hello" }] }
```

The node submits the render, polls until it finishes, and emits the movie object:

```json
{
  "project": "JkGxEoPRF9EgRb32",
  "status": "done",
  "url": "https://assets.json2video.com/clients/.../rendered.mp4",
  "duration": 12.4,
  "width": 1080,
  "height": 1920,
  "size": 2847193,
  "remaining_quota": { "time": 3412 }
}
```

`duration` is in seconds, `size` is in bytes. Rendered files are deleted automatically after 7 days, so download or forward the URL within the workflow.

If the render fails, the node throws with the API's own message — JSON2Video error messages name the scene and element at fault, for example *"Scene #1 Element #2: The element type 'video' requires a 'src' property."* Turn off **Wait Options → Fail On Render Error** to receive the failed movie object instead and branch on `status` yourself.

### Webhooks vs. polling for long renders

**Render and Wait** holds the n8n execution open for the whole render. Its default timeout is 600 seconds, adjustable from 30 to 3600 under **Wait Options → Timeout**. Polling starts at 5 seconds (the minimum the API allows) and backs off gradually to 30 seconds, so a long render costs far fewer requests than a fixed interval.

Two execution ceilings apply and neither is set by this node:

- **n8n Cloud** enforces a maximum execution time per plan.
- **Self-hosted** n8n applies `EXECUTIONS_TIMEOUT`, unlimited by default.

If a render outlives that limit, the execution is killed — the render still completes and is still billed, but the workflow loses the result. For renders that regularly run long, use **Movie → Create** with the **Webhook URL** option pointed at an n8n Webhook node, and handle the callback in a second flow. Example 04 below shows both halves, and the [webhooks reference](https://json2video.com/docs/v2/reference/webhooks) documents the callback payload.

If a Render and Wait times out, the node fails with the project ID in the error message: the render keeps going server-side and **Movie → Get Status** retrieves it later.

### Uploading files to the Drive

**Storage → Upload File** takes binary data from a previous node (an HTTP Request download, a Google Drive node, a form upload) and returns a public `url` you can drop straight into an element's `src`. Files up to 500 MB are supported, and the bytes are streamed from memory — the node never writes to disk.

## Use with AI Agents

This node is available as a tool for n8n's **AI Agent** node. Every operation and parameter description states its units, formats and ID semantics, so an agent can drive it without extra prompting.

An agent connected to this tool can render a video from a template it picks from your library, fill the template's variables from the conversation, check on a render it started earlier, or upload a file to the Drive and use it in the next movie.

Give the agent a key with the narrowest role that covers the job — **Render** is enough unless the agent is meant to modify templates.

## Example workflows

Importable workflow JSONs live in [`examples/`](./examples):

| Workflow | What it shows |
| --- | --- |
| [01 — Render a template and get the video URL](./examples/01-render-template-and-get-url.json) | The shortest useful workflow: variables in, video URL out |
| [02 — Turn the newest RSS item into a social reel](./examples/02-rss-to-social-reel.json) | Scheduled rendering, JSON variables mode, client data |
| [03 — Upload an asset, then use it in a movie](./examples/03-upload-asset-and-render.json) | Storage upload feeding a Movie JSON render |
| [04 — Long render with a webhook callback](./examples/04-long-render-with-webhook.json) | Create plus a Webhook trigger, for renders longer than the execution limit |

See [`examples/README.md`](./examples/README.md) for import instructions.

## Compatibility

- n8n `1.x` (tested against recent releases)
- Node.js `>=20.15`
- Zero runtime dependencies — all HTTP goes through n8n's own request helpers

## Resources

- [JSON2Video documentation](https://json2video.com/docs/v2/)
- [Movie JSON syntax reference](https://json2video.com/docs/v2/reference/json-syntax)
- [Webhooks reference](https://json2video.com/docs/v2/reference/webhooks)
- [API keys guide](https://json2video.com/docs/v2/guides/dashboard/api-keys)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- Questions and bug reports: [GitHub issues](https://github.com/JSON2Video/n8n-nodes-json2video/issues)
- Product support: [support@json2video.com](mailto:support@json2video.com)

## License

[MIT](./LICENSE)
