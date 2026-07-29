import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { simplifyMovieResponse, validateProjectId } from '../../helpers/movie';
import { json2VideoApiRequest } from '../../transport';

/**
 * Movie: Get Status — `GET /v2/movies?project=`.
 *
 * A project ID that does not exist answers HTTP 200 with
 * `movie.status = "error"`, so the caller must always inspect `status` — a 200
 * is not proof of success.
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

	const simple = this.getNodeParameter('simple', itemIndex, true) as boolean;
	const additionalOptions = this.getNodeParameter('additionalOptions', itemIndex, {}) as IDataObject;

	const qs: IDataObject = { project: projectId };
	// `format=simple` drops the submitted Movie JSON server-side, keeping the
	// item small — n8n renders every item in the UI.
	if (additionalOptions.includeMovieJson !== true) qs.format = 'simple';

	const response = await json2VideoApiRequest.call(this, 'GET', '/movies', { qs, itemIndex });

	return [
		{
			json: simple ? simplifyMovieResponse(response) : response,
			pairedItem: { item: itemIndex },
		},
	];
}
