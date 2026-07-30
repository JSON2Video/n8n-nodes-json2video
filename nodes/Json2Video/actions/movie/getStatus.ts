import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { toMovieLookupError } from '../../helpers/errors';
import { simplifyMovieResponse, validateProjectId } from '../../helpers/movie';
import { json2VideoApiRequest } from '../../transport';

/**
 * Movie: Get Status — `GET /v2/movies?project=`.
 *
 * Two things a caller must not assume:
 * - A `200` is not proof of success: a render that failed still answers `200`
 *   with `movie.status = "error"`, so `status` always has to be inspected.
 * - A project ID that does not exist answers HTTP `400` carrying a leaked
 *   internal `TypeError` (verified live 2026-07-30), which `toMovieLookupError`
 *   replaces with an actionable message.
 */
export async function execute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	let projectId: string;
	try {
		projectId = validateProjectId(this.getNodeParameter('projectId', itemIndex));
	} catch (error) {
		throw new NodeOperationError(this.getNode(), (error as Error).message, { itemIndex });
	}

	const simplify = this.getNodeParameter('simplify', itemIndex, true) as boolean;
	const additionalOptions = this.getNodeParameter('additionalOptions', itemIndex, {}) as IDataObject;

	const qs: IDataObject = { project: projectId };
	// `format=simple` drops the submitted Movie JSON server-side, keeping the
	// item small — n8n renders every item in the UI.
	if (additionalOptions.includeMovieJson !== true) qs.format = 'simple';

	let response: IDataObject;
	try {
		response = await json2VideoApiRequest.call(this, 'GET', '/movies', { qs, itemIndex });
	} catch (error) {
		throw toMovieLookupError(this.getNode(), error, projectId, itemIndex);
	}

	return [
		{
			json: simplify ? simplifyMovieResponse(response) : response,
			pairedItem: { item: itemIndex },
		},
	];
}
