import type { IDataObject } from 'n8n-workflow';

// Pure helpers that turn n8n parameter values into a JSON2Video request body.
// No n8n runtime is touched here so the mapping stays unit-testable.
// Contract: `integrations/shared/operations.md` → "Resource: Movie".

/** Project IDs returned by `POST /v2/movies` are always 16 characters long. */
export const PROJECT_ID_LENGTH = 16;

/** Terminal render states. `timeout` behaves exactly like `error`. */
export const TERMINAL_MOVIE_STATUSES = ['done', 'error', 'timeout'] as const;

export type MovieStatus = 'pending' | 'running' | 'done' | 'error' | 'timeout';

export function isTerminalStatus(status: unknown): boolean {
	return typeof status === 'string' && (TERMINAL_MOVIE_STATUSES as readonly string[]).includes(status);
}

function describeValue(value: unknown): string {
	if (value === null) return 'null';
	if (Array.isArray(value)) return 'an array';
	return `a ${typeof value}`;
}

/**
 * Parses a JSON-editor parameter into an object. Validation happens before any
 * request is sent: the API's own message for a malformed document ("Error
 * parsing movie JSON or the movie was empty") does not say where the typo is.
 */
export function parseJsonObjectParameter(value: unknown, parameterName: string): IDataObject {
	let parsed: unknown = value;

	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (trimmed === '') {
			throw new Error(`${parameterName} is empty. Provide a JSON object.`);
		}
		let parseError: string | undefined;
		try {
			parsed = JSON.parse(trimmed);
		} catch (error) {
			parseError = (error as Error).message;
		}
		if (parseError !== undefined) {
			throw new Error(`${parameterName} is not valid JSON: ${parseError}`);
		}
	}

	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new Error(`${parameterName} must be a JSON object, but it is ${describeValue(parsed)}.`);
	}

	return parsed as IDataObject;
}

/** Parses the advanced `exports` parameter, which the API expects as an array. */
export function parseExportsParameter(value: unknown, parameterName = 'Exports'): IDataObject[] {
	let parsed: unknown = value;

	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (trimmed === '') return [];
		let parseError: string | undefined;
		try {
			parsed = JSON.parse(trimmed);
		} catch (error) {
			parseError = (error as Error).message;
		}
		if (parseError !== undefined) {
			throw new Error(`${parameterName} is not valid JSON: ${parseError}`);
		}
	}

	if (Array.isArray(parsed)) return parsed as IDataObject[];
	if (typeof parsed === 'object' && parsed !== null) return [parsed as IDataObject];

	throw new Error(`${parameterName} must be a JSON array of export definitions.`);
}

/**
 * Flattens a `fixedCollection` of name/value pairs into a plain object.
 * Accepts the raw parameter value, e.g. `{ variable: [{ name, value }] }`.
 */
export function keyValuePairsToObject(value: unknown, entryName: string): IDataObject {
	const result: IDataObject = {};
	if (typeof value !== 'object' || value === null) return result;

	const entries = (value as IDataObject)[entryName];
	if (!Array.isArray(entries)) return result;

	for (const entry of entries) {
		if (typeof entry !== 'object' || entry === null) continue;
		const { name, value: entryValue } = entry as IDataObject;
		if (typeof name !== 'string' || name.trim() === '') continue;
		result[name.trim()] = entryValue ?? '';
	}

	return result;
}

/**
 * Expands the flat "Webhook URL" convenience field into the nested shape the
 * API actually expects. There is no top-level `webhook` property — webhooks are
 * `exports[].destinations[].type = "webhook"` (Appendix B / B3).
 *
 * `content-type` must stay a full MIME string; short values like `json` are
 * silently ignored by the API.
 */
export function buildWebhookExports(endpoint: string): IDataObject[] {
	return [
		{
			destinations: [
				{
					type: 'webhook',
					endpoint,
					'content-type': 'application/json',
				},
			],
		},
	];
}

/**
 * Merges the "Additional Options" collection into a movie request body. These
 * are top-level Movie JSON properties, so in Template mode they override the
 * template's own values and in Movie JSON mode they override the submitted
 * document.
 */
export function applyMovieOptions(base: IDataObject, options: IDataObject): IDataObject {
	const body: IDataObject = { ...base };

	const resolution = options.resolution;
	if (typeof resolution === 'string' && resolution !== '') {
		body.resolution = resolution;
		if (resolution === 'custom') {
			if (options.width !== undefined && options.width !== null && options.width !== '') {
				body.width = Number(options.width);
			}
			if (options.height !== undefined && options.height !== null && options.height !== '') {
				body.height = Number(options.height);
			}
		}
	}

	if (typeof options.quality === 'string' && options.quality !== '') body.quality = options.quality;

	if (options.fps !== undefined && options.fps !== null && options.fps !== '') {
		body.fps = Number(options.fps);
	}

	if (typeof options.cache === 'boolean') body.cache = options.cache;

	if (typeof options.id === 'string' && options.id.trim() !== '') {
		body.id = options.id.trim();
	}

	if (typeof options.comment === 'string' && options.comment !== '') body.comment = options.comment;

	const clientData = keyValuePairsToObject(options.clientData, 'data');
	if (Object.keys(clientData).length > 0) body['client-data'] = clientData;

	if (typeof options.webhookUrl === 'string' && options.webhookUrl.trim() !== '') {
		body.exports = buildWebhookExports(options.webhookUrl.trim());
	}

	// The advanced `exports` field wins when both are set.
	if (options.exports !== undefined && options.exports !== null && options.exports !== '') {
		const exports = parseExportsParameter(options.exports, 'Exports (JSON)');
		if (exports.length > 0) body.exports = exports;
	}

	return body;
}

/**
 * Client-side check for the 16-character project ID, so a typo fails with a
 * clear node error instead of a generic API 400.
 */
export function validateProjectId(value: unknown): string {
	if (typeof value !== 'string' || value.trim() === '') {
		throw new Error('Project ID is required. It is the 16-character ID returned by Movie: Create.');
	}

	const projectId = value.trim();
	if (projectId.length !== PROJECT_ID_LENGTH) {
		throw new Error(
			`Project ID must be a ${PROJECT_ID_LENGTH}-character string. Received "${projectId}" (length: ${projectId.length}).`,
		);
	}

	return projectId;
}

/**
 * Strips the response envelope of `GET /v2/movies?project=`: emits the movie
 * object itself and keeps `remaining_quota` alongside it, because it is the
 * cheapest quota pre-flight check a workflow author has.
 */
export function simplifyMovieResponse(response: IDataObject): IDataObject {
	const movie = response.movie;
	if (typeof movie !== 'object' || movie === null || Array.isArray(movie)) return response;

	const simplified: IDataObject = { ...(movie as IDataObject) };
	if (response.remaining_quota !== undefined) simplified.remaining_quota = response.remaining_quota;

	return simplified;
}
