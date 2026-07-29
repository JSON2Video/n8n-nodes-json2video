import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { validateProjectId } from '../../helpers/movie';
import { json2VideoApiRequest } from '../../transport';

/**
 * Movie: Delete — `DELETE /v2/movies?project=`.
 *
 * Soft delete and idempotent: the video file goes, the history entry stays.
 * `DELETE /v2/movies` takes query parameters and no body.
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

	const response = await json2VideoApiRequest.call(this, 'DELETE', '/movies', {
		qs: { project: projectId },
		itemIndex,
	});

	return [{ json: response, pairedItem: { item: itemIndex } }];
}
