import type { IDataObject } from 'n8n-workflow';

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
