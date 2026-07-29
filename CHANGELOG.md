# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-07-29

Pipeline-validation release: the first version published via GitHub Actions
with npm provenance (trusted publisher, OIDC, no npm token). `0.0.1` was a
manual placeholder publish (`--ignore-scripts`) used only to reserve the
package name and was never a real release. `1.0.0` is reserved for after a
live end-to-end pass against the JSON2Video API.

First public release of the official JSON2Video node for n8n.

### Added

- **JSON2Video API credential** — a single password-masked API key, sent as the
  `x-api-key` header, with a live credential test against `GET /v2/templates`.
- **Movie resource** — Create, Render and Wait, Get Status, Get Many, Delete.
  Movies are built either from a saved template plus variables or from a full
  Movie JSON document.
- **Render and Wait** — submits a render and polls until it reaches a terminal
  state, with a 5-second minimum interval that backs off to 30 seconds, a
  configurable timeout, and the project ID quoted in every failure path.
- **Template resource** — Create, Get, Get Many, Get Library, Duplicate, Update,
  Delete, with a searchable template picker shared with the Movie resource.
- **Media resource** — Upload File, Get File, List Folder, Get Folder Tree,
  Move File, Delete File, Create Folder, Delete Folder, Get Storage Usage.
  Uploads go through the presigned-URL flow and never touch the filesystem.
- **AI Agent support** — the node is usable as a tool, and every operation and
  parameter description states units, formats and ID semantics.
- Four importable example workflows under `examples/`.
