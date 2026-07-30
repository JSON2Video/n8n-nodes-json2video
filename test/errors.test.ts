import { describe, expect, it } from 'vitest';
import type { INode } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import {
	attachProjectId,
	extractApiErrorCode,
	extractApiErrorMessage,
	getAttachedProjectId,
	getErrorStatusCode,
	INVALID_API_KEY_MESSAGE,
	isInternalApiErrorMessage,
	toMovieLookupError,
	toNodeApiError,
} from '../nodes/Json2Video/helpers/errors';

const node = {
	id: 'test',
	name: 'JSON2Video',
	type: 'n8n-nodes-json2video.json2Video',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
} as unknown as INode;

/** Shape n8n's HTTP helper throws for a non-2xx JSON response. */
function httpError(statusCode: number, body: unknown, statusMessage?: string) {
	return Object.assign(new Error(`Request failed with status code ${statusCode}`), {
		statusCode,
		response: { status: statusCode, statusText: statusMessage, body, data: body },
	});
}

describe('extractApiErrorMessage', () => {
	it('reads body.message from the standard error envelope', () => {
		const error = httpError(401, {
			success: false,
			message: 'You exceeded the quota of movies in your plan. Please upgrade your plan to continue.',
		});
		expect(extractApiErrorMessage(error)).toBe(
			'You exceeded the quota of movies in your plan. Please upgrade your plan to continue.',
		);
	});

	it('reads body.message when the body omits success (Appendix B / B7)', () => {
		// POST /v2/movies failure paths return { message } and sometimes { code },
		// with no `success: false`.
		const error = httpError(400, {
			message: "Scene #1 Element #2: The element type 'video' requires a 'src' property.",
			code: 'E1002',
		});
		expect(extractApiErrorMessage(error)).toBe(
			"Scene #1 Element #2: The element type 'video' requires a 'src' property.",
		);
		expect(extractApiErrorCode(error)).toBe('E1002');
	});

	it('falls back to body.error, then to the HTTP status text', () => {
		expect(extractApiErrorMessage(httpError(500, { error: 'Error starting subprocess' }))).toBe(
			'Error starting subprocess',
		);
		expect(extractApiErrorMessage(httpError(502, undefined, 'Bad Gateway'))).toBe('Bad Gateway');
	});

	it('parses a JSON body that arrived as a string', () => {
		expect(extractApiErrorMessage(httpError(400, '{"message":"Insufficient credits"}'))).toBe(
			'Insufficient credits',
		);
	});

	it('maps the API key 400 to an actionable message instead of "Bad Request"', () => {
		// An invalid API key answers HTTP 400, not 401 (Appendix B / B11).
		expect(extractApiErrorMessage(httpError(400, { message: 'Error: Invalid API Key' }))).toBe(
			INVALID_API_KEY_MESSAGE,
		);
		expect(extractApiErrorMessage(httpError(400, { message: 'Error: API Key not provided' }))).toBe(
			INVALID_API_KEY_MESSAGE,
		);
	});

	it('never depends on body.success being present or true', () => {
		const withoutSuccess = httpError(400, { message: 'No movie JSON received' });
		const withSuccessTrue = httpError(400, { success: true, message: 'No movie JSON received' });
		expect(extractApiErrorMessage(withoutSuccess)).toBe('No movie JSON received');
		expect(extractApiErrorMessage(withSuccessTrue)).toBe('No movie JSON received');
	});

	it('degrades to something readable for a bare network error', () => {
		const error = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' });
		expect(extractApiErrorMessage(error)).toBe('connect ETIMEDOUT');
	});
});

describe('getErrorStatusCode', () => {
	it('finds the status wherever the transport parked it', () => {
		expect(getErrorStatusCode(httpError(404, { message: 'Template not found' }))).toBe(404);
		expect(getErrorStatusCode({ response: { status: 503 } })).toBe(503);
		expect(getErrorStatusCode({ httpCode: '429' })).toBe(429);
		expect(getErrorStatusCode(new Error('socket hang up'))).toBeUndefined();
	});
});

// The transport already wraps failures in a NodeApiError, so every second look
// at that error (upload / deleteFolder hints, toMovieLookupError) re-extracts
// from a NodeApiError, not from the raw transport error. Losing the API message
// there silently disabled all the appended hints.
describe('re-extraction from an already-wrapped NodeApiError', () => {
	it('still finds the API message', () => {
		const wrapped = toNodeApiError(
			node,
			httpError(400, { success: false, message: 'Folder is not empty. Delete all files first.' }),
			0,
		);

		expect(extractApiErrorMessage(wrapped)).toBe('Folder is not empty. Delete all files first.');
		expect(getErrorStatusCode(wrapped)).toBe(400);
	});

	it('still finds the API message for a 409 duplicate upload', () => {
		const wrapped = toNodeApiError(
			node,
			httpError(409, { message: 'A file with this name already exists. Delete it first.' }),
		);

		expect(extractApiErrorMessage(wrapped)).toBe(
			'A file with this name already exists. Delete it first.',
		);
		expect(getErrorStatusCode(wrapped)).toBe(409);
	});
});

describe('isInternalApiErrorMessage', () => {
	it('recognises a leaked runtime error', () => {
		// Exactly what GET /v2/movies?project=<unknown> answers (live, 2026-07-30).
		expect(isInternalApiErrorMessage("TypeError: Cannot read properties of null (reading 'success')")).toBe(
			true,
		);
		expect(isInternalApiErrorMessage('ReferenceError: x is not defined')).toBe(true);
	});

	it('leaves real API messages alone', () => {
		expect(isInternalApiErrorMessage('File not found')).toBe(false);
		expect(isInternalApiErrorMessage('Folder is not empty. Delete all files first.')).toBe(false);
		expect(
			isInternalApiErrorMessage(
				"Scene #1, element #1: Failed to download 'https://example.com/a.png' (404)",
			),
		).toBe(false);
	});
});

describe('toMovieLookupError', () => {
	it('replaces the leaked TypeError of an unknown project ID', () => {
		// The transport hands over an already-wrapped NodeApiError.
		const error = toNodeApiError(
			node,
			httpError(400, {
				success: false,
				message: "TypeError: Cannot read properties of null (reading 'success')",
			}),
			0,
		);

		const mapped = toMovieLookupError(node, error, 'zzzzzzzzzzzzzzzz', 0);

		expect(mapped).toBeInstanceOf(NodeApiError);
		expect((mapped as NodeApiError).message).toBe('No movie found with project ID zzzzzzzzzzzzzzzz');
		// The API's own text is kept, just moved out of the headline.
		expect((mapped as NodeApiError).description).toContain(
			"TypeError: Cannot read properties of null (reading 'success')",
		);
	});

	it('passes every other failure through untouched', () => {
		const invalidKey = toNodeApiError(node, httpError(400, { message: 'Error: Invalid API Key' }));
		expect(toMovieLookupError(node, invalidKey, 'JkGxEoPRF9EgRb32')).toBe(invalidKey);

		const notFound = toNodeApiError(
			node,
			httpError(400, { message: 'Movie JkGxEoPRF9EgRb32 not found' }),
		);
		expect(toMovieLookupError(node, notFound, 'JkGxEoPRF9EgRb32')).toBe(notFound);

		// A 5xx is retryable and must not be reported as "no movie found".
		const serverError = toNodeApiError(
			node,
			httpError(500, {
				message: "TypeError: Cannot read properties of null (reading 'success')",
			}),
		);
		expect(toMovieLookupError(node, serverError, 'JkGxEoPRF9EgRb32')).toBe(serverError);
	});
});

describe('attachProjectId', () => {
	it('round-trips the project ID through an error', () => {
		const error = attachProjectId(new Error('Render failed'), 'JkGxEoPRF9EgRb32');
		expect(getAttachedProjectId(error)).toBe('JkGxEoPRF9EgRb32');
	});

	it('returns undefined when nothing was attached', () => {
		expect(getAttachedProjectId(new Error('Render failed'))).toBeUndefined();
	});
});
