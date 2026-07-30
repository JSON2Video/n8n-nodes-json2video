import type {
	FieldType,
	IDataObject,
	INodePropertyOptions,
	ResourceMapperField,
} from 'n8n-workflow';

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
 * filtered out of the Variables mapper.
 *
 * Filtered by exact name on purpose, never by the `advanced` flag they happen
 * to carry: a real template variable may legitimately be advanced, and hiding
 * a user's own variable would be worse than showing one extra.
 */
export const PLATFORM_INJECTED_VARIABLES = ['make_webhook_url', 'client_data'];

/**
 * `format=make` variable `type` → n8n `FieldType`, which is what decides the
 * input widget the resourceMapper renders for the variable:
 *
 * | Template type | FieldType  | Widget                  |
 * |---------------|------------|-------------------------|
 * | `text`        | `string`   | text box                |
 * | `number`      | `number`   | numeric box             |
 * | `select`      | `options`  | dropdown of `options`   |
 * | `boolean`     | `boolean`  | toggle                  |
 * | `array`       | `array`    | JSON editor             |
 * | `collection`  | `object`   | JSON editor             |
 *
 * The type set is **open** — `format=make` is undocumented and gains types
 * (`url` already exists in the wild). Anything unrecognised falls back to
 * `string`, so a new type shows up as a plain text box instead of the variable
 * disappearing from the form.
 */
const VARIABLE_FIELD_TYPES: Record<string, FieldType> = {
	text: 'string',
	number: 'number',
	select: 'options',
	boolean: 'boolean',
	array: 'array',
	collection: 'object',
};

/** `mappingMode` value n8n's resourceMapper uses for "map automatically". */
const AUTO_MAP_INPUT_DATA = 'autoMapInputData';

function readString(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function readObjects(value: unknown): IDataObject[] {
	return Array.isArray(value)
		? value.filter((entry): entry is IDataObject => typeof entry === 'object' && entry !== null)
		: [];
}

/** Never drops a variable: an unknown or missing type becomes a text box. */
export function templateVariableFieldType(type: unknown): FieldType {
	return VARIABLE_FIELD_TYPES[readString(type)] ?? 'string';
}

/**
 * `format=make` stringifies **every** default, so a number's default arrives as
 * `"600"` and a boolean's as `"false"`. `ResourceMapperField.defaultValue` is
 * typed and pre-fills a typed widget, so those have to be coerced back or the
 * numeric box shows a string and the toggle reads `"false"` as truthy.
 *
 * Nested defaults are stringified objects (`"[object Object]"`, or a
 * comma-separated run of them) and carry no information at all — dropped.
 */
export function coerceVariableDefault(
	value: unknown,
	type: FieldType,
): string | number | boolean | undefined {
	// `array`/`collection` render a JSON editor; their stringified default is junk.
	if (type === 'array' || type === 'object') return undefined;

	if (type === 'number') {
		if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
		const text = readString(value);
		if (text === '') return undefined;
		const parsed = Number(text);
		return Number.isFinite(parsed) ? parsed : undefined;
	}

	if (type === 'boolean') {
		if (typeof value === 'boolean') return value;
		const text = readString(value).toLowerCase();
		if (text === 'true') return true;
		if (text === 'false') return false;
		return undefined;
	}

	if (typeof value === 'number' || typeof value === 'boolean') return String(value);

	const text = readString(value);
	if (text === '' || text.includes('[object Object]')) return undefined;
	return text;
}

/**
 * `select` variables carry their choices as `{ label, value }`; n8n wants
 * `{ name, value }`. `value` is what has to be sent to the API, so an entry
 * without a usable one is skipped.
 */
export function buildVariableSelectOptions(options: unknown): INodePropertyOptions[] {
	const result: INodePropertyOptions[] = [];

	for (const option of readObjects(options)) {
		const raw = option.value;
		if (typeof raw !== 'string' && typeof raw !== 'number') continue;

		const value = typeof raw === 'number' ? String(raw) : raw.trim();
		const label = readString(option.label);
		if (label === '' && value === '') continue;

		result.push({ name: label === '' ? value : label, value });
	}

	return result;
}

/**
 * The `resourceMapper` field list for the Variables section of Movie → Create
 * and Movie → Render and Wait, built from the `variables` array of
 * `GET /templates?id=<id>&format=make`.
 *
 * One field per template variable, so the parameter panel renders a labelled
 * input per `{{placeholder}}` instead of a name/value list. `id` is the raw
 * variable name — the key `variables` must use on `POST /movies` — and
 * `displayName` is the template author's own label.
 *
 * The template's declared order is preserved: it is the order the template
 * author chose, and every type now has a working widget, so there is no reason
 * to demote the nested ones the way the 0.3.0 dropdown did.
 */
export function buildTemplateVariableFields(variables: unknown): ResourceMapperField[] {
	const fields: ResourceMapperField[] = [];

	for (const variable of readObjects(variables)) {
		const id = readString(variable.name);
		if (id === '' || PLATFORM_INJECTED_VARIABLES.includes(id)) continue;

		const label = readString(variable.label);
		let type = templateVariableFieldType(variable.type);
		const options = type === 'options' ? buildVariableSelectOptions(variable.options) : [];

		// A dropdown with no choices cannot be filled in at all; fall back to a
		// text box so the variable stays usable.
		if (type === 'options' && options.length === 0) type = 'string';

		const field: ResourceMapperField = {
			id,
			displayName: label === '' ? id : label,
			// `format=make` marks a variable required only very rarely (2 of 628
			// across the account sampled on 2026-07-30), but when it does, honour it:
			// a required field cannot be removed from the form.
			required: variable.required === true,
			// There is no record-matching concept here — the node always sends the
			// whole `variables` object and never looks an existing record up — so no
			// variable is a match candidate and none is pre-selected as one.
			defaultMatch: false,
			canBeUsedToMatch: false,
			display: true,
			removed: false,
			type,
		};

		if (type === 'options') field.options = options;

		const defaultValue = coerceVariableDefault(variable.default, type);
		if (defaultValue !== undefined) field.defaultValue = defaultValue;

		fields.push(field);
	}

	return fields;
}

/**
 * Turns the runtime value of the Variables `resourceMapper` parameter into the
 * plain `variables` object `POST /movies` expects. The wire format is unchanged
 * from 0.3.0 — only the UI that produces it is different.
 *
 * `getNodeParameter` returns `{ mappingMode, value, matchingColumns, schema }`.
 * Both mapping modes are handled:
 *
 * - `defineBelow` — the user filled the fields in, so `value` is already the
 *   object to send.
 * - `autoMapInputData` — take the incoming item's own JSON keys whose names
 *   match a field in the fetched schema, which is what "map automatically"
 *   means everywhere else in n8n.
 *
 * `null` is n8n's "field left empty" marker (the editor prunes empty values to
 * `null`), so nulls are skipped rather than sent as a null variable.
 */
export function extractMappedVariables(parameter: unknown, inputJson: unknown): IDataObject {
	const variables: IDataObject = {};
	if (typeof parameter !== 'object' || parameter === null) return variables;

	const mapper = parameter as IDataObject;

	if (readString(mapper.mappingMode) === AUTO_MAP_INPUT_DATA) {
		if (typeof inputJson !== 'object' || inputJson === null || Array.isArray(inputJson)) {
			return variables;
		}
		const item = inputJson as IDataObject;

		for (const field of readObjects(mapper.schema)) {
			const id = readString(field.id);
			if (id === '' || field.display === false) continue;

			const value = item[id];
			if (value === undefined || value === null) continue;
			variables[id] = value;
		}

		return variables;
	}

	if (typeof mapper.value !== 'object' || mapper.value === null) return variables;

	for (const [name, value] of Object.entries(mapper.value as IDataObject)) {
		const key = name.trim();
		if (key === '' || value === undefined || value === null) continue;
		variables[key] = value;
	}

	return variables;
}
