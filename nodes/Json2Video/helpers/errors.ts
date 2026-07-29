import type { IDataObject, INode, JsonObject } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

// Message shown instead of a bare "400 - Bad Request" when the API rejects the
// key. The JSON2Video API answers HTTP 400 (not 401) for an invalid or missing
// API key — see `integrations/shared/operations.md`, "HTTP status codes" and
// Appendix B / B11.
export const INVALID_API_KEY_MESSAGE = 'Invalid JSON2Video API key — check the credential.';

const FALLBACK_ERROR_MESSAGE = 'The JSON2Video API request failed';

type UnknownRecord = Record<string, unknown>;

/**
 * Coerces a value into a plain object, parsing JSON strings on the way. Returns
 * `undefined` for anything that is not an object (arrays included).
 */
function asRecord(value: unknown): UnknownRecord | undefined {
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed.startsWith('{')) return undefined;
		try {
			return asRecord(JSON.parse(trimmed));
		} catch {
			return undefined;
		}
	}

	if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
		return value as UnknownRecord;
	}

	return undefined;
}

function nonEmptyString(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed === '' ? undefined : trimmed;
}

/**
 * Finds the JSON body the API answered with, wherever the HTTP helper parked
 * it. Different n8n versions and transports expose it as `response.body`,
 * `response.data`, `error.body` or `error.error`.
 */
export function getErrorResponseBody(error: unknown): UnknownRecord | undefined {
	const err = asRecord(error);
	if (err === undefined) return undefined;

	const response = asRecord(err.response);
	const candidates: unknown[] = [
		response?.body,
		response?.data,
		err.body,
		err.data,
		err.error,
		err.cause,
	];

	// Prefer a candidate that actually carries an API message.
	for (const candidate of candidates) {
		const record = asRecord(candidate);
		if (record === undefined) continue;
		if (nonEmptyString(record.message) !== undefined || nonEmptyString(record.error) !== undefined) {
			return record;
		}
	}

	for (const candidate of candidates) {
		const record = asRecord(candidate);
		if (record !== undefined) return record;
	}

	return undefined;
}

/** Extracts the HTTP status code of a failed request, if there is one. */
export function getErrorStatusCode(error: unknown): number | undefined {
	const err = asRecord(error);
	if (err === undefined) return undefined;

	const response = asRecord(err.response);
	const cause = asRecord(err.cause);
	const candidates: unknown[] = [
		err.statusCode,
		err.status,
		err.httpCode,
		response?.status,
		response?.statusCode,
		cause?.statusCode,
		cause?.status,
	];

	for (const candidate of candidates) {
		const code = typeof candidate === 'string' ? Number(candidate) : candidate;
		if (typeof code === 'number' && Number.isFinite(code) && code >= 100 && code < 600) {
			return code;
		}
	}

	return undefined;
}

/** Optional machine-readable code some `POST /movies` failures carry. */
export function extractApiErrorCode(error: unknown): string | undefined {
	const body = getErrorResponseBody(error);
	if (body === undefined) return undefined;
	if (typeof body.code === 'number') return String(body.code);
	return nonEmptyString(body.code);
}

function looksLikeApiKeyError(message: string, statusCode: number | undefined): boolean {
	if (statusCode !== undefined && statusCode !== 400 && statusCode !== 401 && statusCode !== 403) {
		return false;
	}
	return /api\s*key/i.test(message);
}

/**
 * Error-message extraction order mandated by the operation catalogue:
 * `body.message` → `body.error` → HTTP status text. The API's own message is
 * surfaced verbatim because JSON2Video writes them to be client-actionable
 * ("Scene #1 Element #2: The element type 'video' requires a 'src' property.").
 *
 * `body.success` is deliberately never consulted: `POST /v2/movies` failures
 * omit it (Appendix B / B7).
 */
export function extractApiErrorMessage(error: unknown): string {
	const body = getErrorResponseBody(error);
	const statusCode = getErrorStatusCode(error);

	let message = body === undefined ? undefined : nonEmptyString(body.message) ?? nonEmptyString(body.error);

	if (message === undefined) {
		const err = asRecord(error);
		const response = asRecord(err?.response);
		message =
			nonEmptyString(err?.statusMessage) ??
			nonEmptyString(response?.statusText) ??
			nonEmptyString(response?.statusMessage);
	}

	if (message === undefined && statusCode !== undefined) {
		message = `The JSON2Video API returned HTTP ${statusCode}`;
	}

	if (message === undefined) {
		const err = asRecord(error);
		message = nonEmptyString(err?.message) ?? FALLBACK_ERROR_MESSAGE;
	}

	if (looksLikeApiKeyError(message, statusCode)) return INVALID_API_KEY_MESSAGE;

	return message;
}

/**
 * Wraps whatever the HTTP helper threw into a `NodeApiError` that shows the
 * API's message instead of a generic status line.
 */
export function toNodeApiError(node: INode, error: unknown, itemIndex?: number): NodeApiError {
	if (error instanceof NodeApiError) return error;

	const message = extractApiErrorMessage(error);
	const statusCode = getErrorStatusCode(error);
	const code = extractApiErrorCode(error);

	const payload = (getErrorResponseBody(error) ?? asRecord(error) ?? { message }) as JsonObject;

	return new NodeApiError(node, payload, {
		message,
		description: code === undefined ? undefined : `JSON2Video error code: ${code}`,
		httpCode: statusCode === undefined ? undefined : String(statusCode),
		itemIndex,
	});
}

/**
 * Guarantees that whatever leaves the node is a `NodeApiError` or a
 * `NodeOperationError`, so the n8n UI always shows a typed error.
 */
export function toNodeError(
	node: INode,
	error: unknown,
	itemIndex?: number,
): NodeApiError | NodeOperationError {
	if (error instanceof NodeApiError || error instanceof NodeOperationError) return error;
	if (error instanceof Error) return new NodeOperationError(node, error, { itemIndex });
	return new NodeOperationError(node, extractApiErrorMessage(error), { itemIndex });
}

/**
 * Stores the project ID on an error so `continueOnFail` output, and the n8n
 * error panel, keep the reference to a render that was already paid for.
 */
export function attachProjectId<T>(error: T, project: string): T {
	const target = error as unknown as { context?: IDataObject };
	target.context = { ...(target.context ?? {}), project };
	return error;
}

/** Reads back whatever `attachProjectId` stored. */
export function getAttachedProjectId(error: unknown): string | undefined {
	const context = asRecord(asRecord(error)?.context);
	return nonEmptyString(context?.project);
}
