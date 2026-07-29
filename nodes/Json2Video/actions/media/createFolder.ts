import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { buildCreateFolderOutput, normalizeMediaPath } from '../../helpers/media';
import { json2VideoApiRequest } from '../../transport';

/**
 * Media: Create Folder — `POST /v2/media/folder`.
 *
 * Idempotent: an existing folder answers `200` with
 * `message: "Folder already exists"`. That message is passed through and turned
 * into a `created` flag, so a workflow can branch on it.
 */
export async function execute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const folder = normalizeMediaPath(this.getNodeParameter('folder', itemIndex, ''));

	if (folder === '') {
		throw new NodeOperationError(this.getNode(), 'No folder path given', {
			itemIndex,
			description:
				'Set Folder Path to the folder to create, for example marketing/2026. The root folder already exists and cannot be created.',
		});
	}

	const response = await json2VideoApiRequest.call(this, 'POST', '/media/folder', {
		body: { folder },
		itemIndex,
	});

	return [{ json: buildCreateFolderOutput(folder, response), pairedItem: { item: itemIndex } }];
}
