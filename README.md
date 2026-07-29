# n8n-nodes-json2video

Create and render videos from JSON or templates via the [JSON2Video](https://json2video.com) API, directly from an n8n workflow.

**Official node — maintained by the JSON2Video team.**

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation)
[Credentials](#credentials)
[Operations](#operations)
[Compatibility](#compatibility)
[Resources](#resources)
[Version history](#version-history)

## Installation

### n8n Cloud / verified community nodes

Once verified, this node will be installable directly from the in-app node panel: search for "JSON2Video" under **Nodes** and select **Install**.

### Self-hosted (community node)

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation, or install manually:

1. Go to **Settings > Community Nodes**.
2. Select **Install**.
3. Enter `n8n-nodes-json2video`.
4. Agree to the risks and select **Install**.

## Credentials

This node requires a JSON2Video API key.

1. Sign up (or log in) at [json2video.com](https://json2video.com).
2. Open the dashboard and go to **API Keys** (<https://json2video.com/dashboard/apikeys>).
3. Copy an existing key or create a new one.
4. In n8n, create a new **JSON2Video API** credential and paste the key into the **API Key** field.

The key is sent as the `x-api-key` header on every request and is never logged or echoed back in error messages.

## Operations

Full operation coverage is being implemented across upcoming phases of this node's build plan. Planned for v1:

### Movie

- Create (raw JSON or template id + variables)
- Get Status
- Get Many
- Render and Wait (create + poll until the render finishes or fails)
- Delete

### Template

- Get Many
- Get
- Create
- Update
- Duplicate
- Delete
- Get Library (public template library)

### Media

- Upload File
- Get File
- List Folder
- Get Folder Tree
- Move File
- Delete File
- Create Folder
- Delete Folder
- Get Storage Usage

Final, user-facing copy for every operation ships in a later phase of this node's build plan (see the repository history / issues for progress).

## Compatibility

Requires n8n running on Node.js >= 20.15. Tested against recent n8n releases; see [package.json](./package.json) for the exact toolchain versions used to build this node.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [JSON2Video API documentation](https://json2video.com/docs/v2/)
- [JSON2Video dashboard](https://json2video.com/dashboard)

## Version history

- `0.0.1` — initial scaffold. No operations implemented yet.

## License

[MIT](./LICENSE)
