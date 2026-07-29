import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { buildMoveFileBody, buildMoveFileOutput } from '../../helpers/media';
import { json2VideoApiRequest } from '../../transport';

/**
 * Media: Move File — `PUT /v2/media/file`, with a JSON body (Appendix B / B12).
 *
 * `destination` is always sent, even when it is the empty string: an empty
 * string is the valid value for the root folder, and omitting the key makes the
 * API answer `destination is required`.
 *
 * The raw response is just `{ success, timestamp }`, so the node builds the
 * output itself — downstream nodes need to know where the file ended up.
 */
export async function execute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const name = (this.getNodeParameter('name', itemIndex, '') as string).trim();

	if (name === '') {
		throw new NodeOperationError(this.getNode(), 'No file selected', {
			itemIndex,
			description:
				'Choose a file from the list, or provide its name without the folder path, for example clip.mp4.',
		});
	}

	const folder = this.getNodeParameter('folder', itemIndex, '');
	const destination = this.getNodeParameter('destination', itemIndex, '');

	await json2VideoApiRequest.call(this, 'PUT', '/media/file', {
		body: buildMoveFileBody(name, folder, destination),
		itemIndex,
	});

	return [{ json: buildMoveFileOutput(name, destination), pairedItem: { item: itemIndex } }];
}
