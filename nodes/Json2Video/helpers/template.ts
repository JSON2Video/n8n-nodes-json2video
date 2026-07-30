import type { IDataObject, INodePropertyOptions } from 'n8n-workflow';

// Pure helpers that turn n8n parameter values into JSON2Video Template
// request bodies, and shape Template responses. No n8n runtime is touched
// here so the mapping stays unit-testable.
// Contract: `integrations/shared/operations.md` → "Resource: Template".

/**
 * `POST /templates` returns the new ID as `templateId`; `GET /templates`
 * returns it as `id` (Appendix B / B8). Emit both keys with the same value so
 * downstream nodes work regardless of which one they reference.
 */
export function withDualTemplateId(response: IDataObject): IDataObject {
	const templateId = typeof response.templateId === 'string' ? response.templateId : undefined;
	const id = typeof response.id === 'string' ? response.id : undefined;
	const value = templateId ?? id;

	if (value === undefined) return response;

	return { ...response, templateId: value, id: value };
}

/**
 * Splits a comma-separated tags string (or passes through an array) into a
 * trimmed, non-empty array. The node always sends an array to the API — a
 * comma-separated string is just what non-technical users actually type.
 */
export function parseTagsParameter(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.filter((entry): entry is string => typeof entry === 'string')
			.map((entry) => entry.trim())
			.filter((entry) => entry !== '');
	}

	if (typeof value !== 'string') return [];

	return value
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry !== '');
}

/**
 * Client-side Return All / Limit slicing for `GET /templates` and
 * `GET /templates/library`, which have no server-side pagination despite
 * returning a `count` (Appendix B / B10).
 */
export function applyClientSideLimit<T>(items: T[], returnAll: boolean, limit: number): T[] {
	if (returnAll) return items;

	const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : items.length;
	return items.slice(0, safeLimit);
}

/** Case-insensitive exact match of a tag against a template's `tags` array. */
export function templateHasTag(template: IDataObject, tag: string): boolean {
	const tags = Array.isArray(template.tags) ? template.tags : [];
	const needle = tag.trim().toLowerCase();
	if (needle === '') return true;

	return tags.some((entry) => typeof entry === 'string' && entry.trim().toLowerCase() === needle);
}

/**
 * Union of every tag across a template list, deduplicated and sorted —
 * backs the "Template Tag" dropdown (Appendix C).
 */
export function collectSortedTags(templates: IDataObject[]): string[] {
	const tagSet = new Set<string>();

	for (const template of templates) {
		const tags = Array.isArray(template.tags) ? template.tags : [];
		for (const tag of tags) {
			if (typeof tag === 'string' && tag.trim() !== '') tagSet.add(tag.trim());
		}
	}

	return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
}

export interface TemplateBodyInput {
	name?: string;
	movie?: IDataObject;
	tags?: string[];
	prompt?: string;
}

/**
 * Builds the JSON body for `POST /templates` (Create and Update share this
 * shape; Update only includes the fields the user actually set).
 */
export function buildTemplateBody(input: TemplateBodyInput): IDataObject {
	const body: IDataObject = {};

	if (input.name !== undefined && input.name !== '') body.name = input.name;
	if (input.movie !== undefined) body.movie = input.movie;
	if (input.tags !== undefined && input.tags.length > 0) body.tags = input.tags;
	if (input.prompt !== undefined && input.prompt !== '') body.prompt = input.prompt;

	return body;
}

/**
 * `DELETE /templates` answers with just `{ success, timestamp }` — it does
 * not echo the deleted ID. Build the output the node actually emits so the ID
 * survives into downstream nodes.
 */
export function buildDeleteTemplateResponse(templateId: string): IDataObject {
	return { success: true, templateId, deleted: true };
}

/**
 * Reads the plain template ID out of a `templateId` resourceLocator parameter
 * value. `loadOptions` handlers get the raw parameter — `{ mode, value }` in
 * list/ID mode, or already a string when an expression produced it — so both
 * shapes are accepted. An empty string means "nothing selected yet".
 */
export function extractTemplateId(value: unknown): string {
	if (typeof value === 'string') return value.trim();

	if (typeof value === 'object' && value !== null) {
		const inner = (value as IDataObject).value;
		if (typeof inner === 'string') return inner.trim();
	}

	return '';
}

/**
 * Variables that `GET /templates?format=make` injects on **every** template
 * because the Make.com app needs them as module fields. They are not part of
 * the user's template, and the n8n node already covers both with first-class
 * parameters (Additional Options → Webhook URL and → Client Data), so they are
 * filtered out of the Variables dropdown.
 *
 * Filtered by exact name on purpose, never by the `advanced` flag they happen
 * to carry: a real template variable may legitimately be advanced, and hiding
 * a user's own variable would be worse than showing one extra.
 */
export const PLATFORM_INJECTED_VARIABLES = ['make_webhook_url', 'client_data'];

/** Variable types whose value has to be written as JSON, listed last. */
const NESTED_VARIABLE_TYPES = ['array', 'collection'];

/** Longest default value echoed into a dropdown description. */
const MAX_DEFAULT_PREVIEW = 60;

function readString(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function readObjects(value: unknown): IDataObject[] {
	return Array.isArray(value)
		? value.filter((entry): entry is IDataObject => typeof entry === 'object' && entry !== null)
		: [];
}

/** Ends a sentence fragment coming from the API with a full stop. */
function asSentence(text: string): string {
	return /[.!?]$/.test(text) ? text : `${text}.`;
}

/**
 * The Make-shaped payload stringifies every default, so a nested variable's
 * default arrives as `"[object Object]"` or a comma-separated list of them.
 * Those carry no information and must not reach the UI.
 */
function formatDefault(value: unknown): string | undefined {
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	if (typeof value !== 'string') return undefined;

	const trimmed = value.trim();
	if (trimmed === '' || trimmed.includes('[object Object]')) return undefined;

	const preview =
		trimmed.length > MAX_DEFAULT_PREVIEW
			? `${trimmed.slice(0, MAX_DEFAULT_PREVIEW).trimEnd()}…`
			: trimmed;

	return `"${preview}"`;
}

/**
 * The `description` line under one entry of the Variables dropdown: what type
 * the template expects, what the template's own default is, and the template
 * author's help text. `select` lists its allowed values; `array` and
 * `collection` say the value must be JSON and name their sub-fields, because
 * the key/value UI can only send text and those need the JSON mode.
 */
function describeTemplateVariable(variable: IDataObject): string {
	const type = readString(variable.type);
	const sentences: string[] = [];

	if (type === 'select') {
		const values = readObjects(variable.options)
			.map((option) => readString(option.value))
			.filter((value) => value !== '');

		sentences.push(
			values.length > 0 ? `Type: select. Allowed values: ${values.join(', ')}.` : 'Type: select.',
		);
	} else if (NESTED_VARIABLE_TYPES.includes(type)) {
		const fields = readObjects(variable.spec)
			.map((field) => readString(field.name))
			.filter((name) => name !== '');

		sentences.push(`Type: ${type} — the value must be JSON.`);
		if (fields.length > 0) sentences.push(`Sub-fields: ${fields.join(', ')}.`);
	} else {
		sentences.push(`Type: ${type === '' ? 'unknown' : type}.`);
	}

	const defaultValue = formatDefault(variable.default);
	if (defaultValue !== undefined) sentences.push(`Default: ${defaultValue}.`);

	const help = readString(variable.help);
	if (help !== '') sentences.push(asSentence(help));

	return sentences.join(' ');
}

/**
 * "Template Variable" dropdown (Appendix C), built from the `variables` array of
 * `GET /templates?id=<id>&format=make`.
 *
 * The label carries both the human label and the raw name, so either one finds
 * the entry when typing; the value is always the raw name, which is what
 * `variables` keys must be called on `POST /movies`.
 *
 * Scalar variables come first and JSON-only ones (`array`, `collection`) last:
 * the fields below can only send text, so a nested variable is a signal to
 * switch *Specify Variables* to `Using JSON`.
 */
export function buildTemplateVariableOptions(variables: unknown): INodePropertyOptions[] {
	const entries: Array<{ option: INodePropertyOptions; nested: boolean }> = [];

	for (const variable of readObjects(variables)) {
		const name = readString(variable.name);
		if (name === '' || PLATFORM_INJECTED_VARIABLES.includes(name)) continue;

		const label = readString(variable.label);

		entries.push({
			option: {
				name: label === '' || label === name ? name : `${label} (${name})`,
				value: name,
				description: describeTemplateVariable(variable),
			},
			nested: NESTED_VARIABLE_TYPES.includes(readString(variable.type)),
		});
	}

	// Stable: scalars keep the template's own order, and so do nested ones.
	return [
		...entries.filter((entry) => !entry.nested),
		...entries.filter((entry) => entry.nested),
	].map((entry) => entry.option);
}
