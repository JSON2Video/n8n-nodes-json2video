import { describe, expect, it } from 'vitest';

import {
	attachProjectId,
	extractApiErrorCode,
	extractApiErrorMessage,
	getAttachedProjectId,
	getErrorStatusCode,
	INVALID_API_KEY_MESSAGE,
} from '../nodes/Json2Video/helpers/errors';

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

describe('attachProjectId', () => {
	it('round-trips the project ID through an error', () => {
		const error = attachProjectId(new Error('Render failed'), 'JkGxEoPRF9EgRb32');
		expect(getAttachedProjectId(error)).toBe('JkGxEoPRF9EgRb32');
	});

	it('returns undefined when nothing was attached', () => {
		expect(getAttachedProjectId(new Error('Render failed'))).toBeUndefined();
	});
});
