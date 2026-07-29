import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

import { json2VideoApiRequest } from '../../transport';
import { buildMovieRequestBody } from './movieRequestBody';

/**
 * Movie: Create — `POST /v2/movies`.
 *
 * Returns immediately with `{ success, project, timestamp }`. The response is
 * emitted as-is: it is already three fields and `project` is what every
 * downstream node needs.
 *
 * Not idempotent — every call starts a new render and consumes credits.
 */
export async function execute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const body = buildMovieRequestBody.call(this, itemIndex);

	const response = await json2VideoApiRequest.call(this, 'POST', '/movies', { body, itemIndex });

	return [{ json: response, pairedItem: { item: itemIndex } }];
}
