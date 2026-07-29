import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { buildDeleteFileBody, buildDeleteFileOutput } from '../../helpers/media';
import { json2VideoApiRequest } from '../../transport';

/**
 * Media: Delete File — `DELETE /v2/media/file`, with a JSON body rather than
 * query parameters (Appendix B / B12). Deleting a non-temporary file decreases
 * the storage counter.
 *
 * The raw response is just `{ success, timestamp }` — it does not echo what was
 * deleted — so the node builds the output itself.
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

	await json2VideoApiRequest.call(this, 'DELETE', '/media/file', {
		body: buildDeleteFileBody(name, folder),
		itemIndex,
	});

	return [{ json: buildDeleteFileOutput(name, folder), pairedItem: { item: itemIndex } }];
}
