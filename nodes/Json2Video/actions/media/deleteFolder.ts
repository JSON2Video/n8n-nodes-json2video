import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { appendErrorHint, extractApiErrorMessage, getErrorStatusCode } from '../../helpers/errors';
import {
	buildDeleteFolderOutput,
	describeDeleteFolderError,
	normalizeMediaPath,
} from '../../helpers/media';
import { json2VideoApiRequest } from '../../transport';

/**
 * Media: Delete Folder — `DELETE /v2/media/folder`, with a JSON body rather
 * than query parameters (Appendix B / B12).
 *
 * The API only deletes **empty** folders, and refuses the root and `temp`
 * folders. Those refusals arrive as HTTP 400 with a precise message; the
 * message is surfaced verbatim and a hint on what to do next is appended to the
 * error description.
 */
export async function execute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const folder = normalizeMediaPath(this.getNodeParameter('folder', itemIndex, ''));

	if (folder === '') {
		throw new NodeOperationError(this.getNode(), 'No folder selected', {
			itemIndex,
			description:
				'Choose the folder to delete from the list, or provide its path. The root folder cannot be deleted.',
		});
	}

	try {
		await json2VideoApiRequest.call(this, 'DELETE', '/media/folder', {
			body: { folder },
			itemIndex,
		});
	} catch (error) {
		throw appendErrorHint(
			error,
			describeDeleteFolderError(getErrorStatusCode(error), extractApiErrorMessage(error)),
		);
	}

	return [{ json: buildDeleteFolderOutput(folder), pairedItem: { item: itemIndex } }];
}
