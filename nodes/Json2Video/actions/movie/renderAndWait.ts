import type { IDataObject, IExecuteFunctions, INodeExecutionData, JsonObject } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import {
	attachProjectId,
	extractApiErrorMessage,
	getErrorStatusCode,
	toMovieLookupError,
} from '../../helpers/errors';
import { simplifyMovieResponse } from '../../helpers/movie';
import {
	clampPollInterval,
	clampTimeout,
	computePollInterval,
	DEFAULT_POLL_INTERVAL_SECONDS,
	DEFAULT_TIMEOUT_SECONDS,
	MAX_CONSECUTIVE_POLL_FAILURES,
} from '../../helpers/polling';
import { json2VideoApiRequest } from '../../transport';
import { buildMovieRequestBody } from './movieRequestBody';

/**
 * Movie: Render and Wait — `POST /v2/movies`, then poll `GET /v2/movies?project=`
 * until the render reaches a terminal state.
 *
 * Rules that must not regress:
 * - The `POST` is never retried: it is not idempotent and a retry double-charges.
 * - The first status check happens one interval after the `POST`.
 * - Transient network / 5xx failures during polling are retried up to 3
 *   consecutive times; the counter resets on any successful poll. A 4xx aborts
 *   immediately — the key or the ID is wrong and retrying cannot help.
 * - Every failure path quotes the project ID. Losing it means losing a render
 *   the user already paid for.
 */
export async function execute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const body = buildMovieRequestBody.call(this, itemIndex);

	const simplify = this.getNodeParameter('simplify', itemIndex, true) as boolean;
	const shapeOutput = (response: IDataObject): IDataObject =>
		simplify ? simplifyMovieResponse(response) : response;

	const waitOptions = this.getNodeParameter('waitOptions', itemIndex, {}) as IDataObject;
	const pollInterval = clampPollInterval(
		Number(waitOptions.pollInterval ?? DEFAULT_POLL_INTERVAL_SECONDS),
	);
	const timeout = clampTimeout(Number(waitOptions.timeout ?? DEFAULT_TIMEOUT_SECONDS));
	const failOnRenderError = waitOptions.failOnRenderError !== false;

	const createResponse = await json2VideoApiRequest.call(this, 'POST', '/movies', {
		body,
		itemIndex,
	});

	const project = typeof createResponse.project === 'string' ? createResponse.project.trim() : '';
	if (project === '') {
		throw new NodeOperationError(
			this.getNode(),
			'The JSON2Video API accepted the movie but did not return a project ID',
			{
				itemIndex,
				description:
					'The render may still have started. Check your JSON2Video dashboard before running this node again, because every submission consumes credits.',
			},
		);
	}

	const startedAt = Date.now();
	const elapsedSeconds = () => (Date.now() - startedAt) / 1000;
	let consecutiveFailures = 0;

	for (;;) {
		const remaining = timeout - elapsedSeconds();
		if (remaining <= 0) {
			throw attachProjectId(
				new NodeOperationError(
					this.getNode(),
					`Timed out after ${timeout}s waiting for project ${project} to finish rendering`,
					{
						itemIndex,
						description: `The render is still running — use Movie: Get Status with project ID ${project} to retrieve the result, or increase the Timeout option.`,
					},
				),
				project,
			);
		}

		const interval = computePollInterval(pollInterval, elapsedSeconds());
		await sleep(Math.min(interval, remaining) * 1000);

		let response: IDataObject;
		try {
			response = await json2VideoApiRequest.call(this, 'GET', '/movies', {
				qs: { project, format: 'simple' },
				itemIndex,
			});
			consecutiveFailures = 0;
		} catch (error) {
			const statusCode = getErrorStatusCode(error);

			// Client errors are permanent: wrong key, wrong project ID.
			if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
				throw attachProjectId(
					toMovieLookupError(this.getNode(), error, project, itemIndex) as Error,
					project,
				);
			}

			consecutiveFailures += 1;
			if (consecutiveFailures > MAX_CONSECUTIVE_POLL_FAILURES) {
				throw attachProjectId(
					new NodeApiError(this.getNode(), error as JsonObject, {
						message: `Lost contact with the JSON2Video API while waiting for project ${project}: ${extractApiErrorMessage(error)}`,
						description: `The render is probably still running. Use Movie: Get Status with project ID ${project} to retrieve the result.`,
						itemIndex,
					}),
					project,
				);
			}
			continue;
		}

		const movie = (
			typeof response.movie === 'object' && response.movie !== null ? response.movie : {}
		) as IDataObject;
		const status = movie.status;

		if (status === 'done') {
			return [{ json: shapeOutput(response), pairedItem: { item: itemIndex } }];
		}

		if (status === 'error' || status === 'timeout') {
			const apiMessage =
				typeof movie.message === 'string' && movie.message.trim() !== ''
					? movie.message.trim()
					: status === 'timeout'
						? 'Movie took too long to render'
						: 'The render failed';

			if (!failOnRenderError) {
				return [{ json: shapeOutput(response), pairedItem: { item: itemIndex } }];
			}

			const description =
				status === 'timeout'
					? `Render failed for project ${project}: ${apiMessage}. The render may still complete on the JSON2Video side — check it later with Movie: Get Status.`
					: `Render failed for project ${project}: ${apiMessage}`;

			throw attachProjectId(
				new NodeApiError(this.getNode(), movie as JsonObject, {
					message: apiMessage,
					description,
					itemIndex,
				}),
				project,
			);
		}
	}
}
