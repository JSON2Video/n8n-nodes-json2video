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
 *
 * `errorResponse` is where `NodeApiError` itself keeps the payload it was
 * constructed with. It has to be in this list because the error the transport
 * throws is *already* a `NodeApiError`: without it, any second look at that
 * error (`deleteFolder`, `upload`, `toMovieLookupError`) loses the API's own
 * message and falls back to a bare "HTTP 400", which silently disabled every
 * appended hint (found during the live pass, 2026-07-30).
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
		err.errorResponse,
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
 * True when the API answered with a leaked internal runtime error instead of a
 * client-actionable message.
 *
 * The live case (verified 2026-07-30): `GET /v2/movies?project=<unknown>`
 * answers HTTP 400 with
 * `{"success":false,"message":"TypeError: Cannot read properties of null (reading 'success')"}`.
 * Surfacing that verbatim as the headline error tells a workflow author
 * nothing, so callers that know what the request was about replace it — see
 * `toMovieLookupError`.
 */
export function isInternalApiErrorMessage(message: string): boolean {
	return /^(TypeError|ReferenceError|RangeError|SyntaxError|EvalError|URIError|AggregateError)\b/.test(
		message.trim(),
	);
}

/**
 * Turns the unusable 400 that `GET`/`DELETE /v2/movies?project=` returns for an
 * unknown project ID into an actionable error. The API's raw message is kept in
 * the description, so nothing is hidden. Any other failure is returned
 * untouched.
 */
export function toMovieLookupError(
	node: INode,
	error: unknown,
	projectId: string,
	itemIndex?: number,
): unknown {
	const statusCode = getErrorStatusCode(error);
	const message = extractApiErrorMessage(error);

	if (statusCode !== 400 || !isInternalApiErrorMessage(message)) return error;

	return new NodeApiError(node, (getErrorResponseBody(error) ?? {}) as JsonObject, {
		message: `No movie found with project ID ${projectId}`,
		description: `The JSON2Video API rejected the lookup with HTTP 400 and an internal error message ("${message}"), which is what it answers for a project ID that does not exist or belongs to another account. Check that the ID came from Movie: Create on the account this credential belongs to.`,
		httpCode: String(statusCode),
		itemIndex,
	});
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
 * Appends an actionable hint to the *description* of an already-typed node
 * error. The API's own `message` is never touched — JSON2Video writes it to be
 * client-actionable and the catalogue mandates surfacing it verbatim — so the
 * hint only ever adds "and here is what to do next".
 */
export function appendErrorHint<T>(error: T, hint: string | undefined): T {
	if (hint === undefined || hint === '') return error;
	if (!(error instanceof NodeApiError) && !(error instanceof NodeOperationError)) return error;

	const target = error as unknown as { description?: string | null };
	const current = nonEmptyString(target.description);

	target.description = current === undefined ? hint : `${current} ${hint}`;

	return error;
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
