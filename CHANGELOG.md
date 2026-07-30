# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-07-30

### Added

- **Template → Get Variables** — lists the variables a template declares (its
  `{{placeholder}}` inputs), one output item per variable, as currently saved.
  Each item carries `name`, `label`, `type`, `default` (when the template set
  one, coerced to a real number/boolean the same way the Variables mapper
  pre-fills its widgets — not left as the string `format=make` sends), `help`
  (when set), `required` (when `true` — rare, 2 of 628 sampled), `options` for
  `select` variables and `spec` for `array`/`collection` variables, one level
  deep. `make_webhook_url` and `client_data` — Make.com platform artifacts the
  API injects into every template — are filtered out by exact name, same as
  the Variables mapper.

  This is what lets a workflow, or an AI Agent using this node as a tool,
  discover a template's inputs at runtime instead of having them hard-coded
  (`integrations/shared/operations.md`, Appendix D / D10). It reuses the exact
  same internal `format=make` fetch and type mapping the Variables
  `resourceMapper` already depends on — no new API dependency, no duplicated
  logic. There is no `Simplify` toggle: the operation always emits one item
  per variable, the same call already made for Get Many and Get Library.

## [0.4.0] - 2026-07-30

### Changed

- **Template variables are now one labelled input per variable.** Pick a
  template on Movie → Create or Movie → Render and Wait and the **Variables**
  section renders itself from that template: one input per variable it declares,
  labelled by the template author, typed the way the template declares it
  (text box, numeric box, dropdown of allowed values, toggle, or a JSON editor
  for `array` / `collection` variables) and pre-filled with the template's own
  default. Changing the selected template reloads the list. This replaces the
  0.3.0 name/value list whose **Name** side was a dropdown — that UI is gone.

  Built on n8n's `resourceMapper` parameter, the same primitive Google Sheets
  and Postgres use for their columns, which also brings a **Map Automatically**
  mode: every variable is filled from the incoming item's field of the same
  name. The raw-JSON mode (**Specify Variables → Using JSON**) is unchanged and
  is still the escape hatch for expression-built objects and for variables the
  template does not declare.

  The request sent to the API is byte-for-byte what it was:
  `{ "template": "<id>", "variables": { … } }`.

- **The "Media" resource is now called "Storage".** The nodes panel lists
  *Storage actions*, and the wording of every operation, hint and error follows.
  Nothing else changes: the parameter value is still `media`, so saved workflows
  and the examples in `examples/` keep working, and the operations still call
  `/v2/media/*`.

### Removed

- The `getTemplateVariables` `loadOptions` handler and the `variablesUi`
  name/value collection on the Movie resource, both superseded by the variable
  mapper. Template → Duplicate keeps its own `variablesUi`: it bakes values into
  a copy of a template that may not be yours, so there is no variable list to
  load.

## [0.3.0] - 2026-07-30

### Added

- **Template variables are now a dropdown.** On Movie → Create and Movie →
  Render and Wait in Template mode, the **Name** of each variable lists the
  variables the selected template actually declares, with each one's type,
  default value and the help text saved with the template. Variables that need a
  JSON value (`array`, `collection`) are listed last, with their sub-fields
  named. The field stays expression-friendly, and the raw-JSON variables mode is
  unchanged.

### Changed

- **Movie actions come first in the nodes panel.** The resource list is now
  Movie, Template, Media instead of alphabetical, so the primary resource leads.

### Fixed

- **Error hints now actually appear.** n8n's `NodeApiError` keeps the API payload
  under `errorResponse`, which the error extractor did not inspect. Because the
  shared transport already wraps failures in a `NodeApiError`, taking a second
  look at one lost the API's message and fell back to a bare "HTTP 400" — which
  silently disabled every appended hint in the Media resource (duplicate upload,
  non-empty folder, `temp` folder, blocked storage).
- **Movie → Get Many: *Include Movie JSON* off now really drops it.** The API
  ignores `format=simple` on the movie *list* endpoint and always returns each
  movie's submitted document, so the option had no effect and every item carried
  a multi-kilobyte string. It is now removed client-side.
- **Movie → Get Status / Delete: a clear message for an unknown project ID.** The
  API answers HTTP 400 with a leaked internal `TypeError` for a project that does
  not exist; the node now reports `No movie found with project ID <id>` and keeps
  the API's raw text in the error description.

All three were found by a live end-to-end pass against the production
JSON2Video API (2026-07-30) covering all 21 operations, the credential and all
six dynamic dropdowns. See `TESTING.md`.

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
