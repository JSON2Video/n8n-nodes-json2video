import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { normalizeMediaPath } from '../../helpers/media';
import { json2VideoApiRequest } from '../../transport';

/**
 * Media: Get File — `GET /v2/media/file?path=`.
 *
 * `path` is the only way this endpoint addresses a file (Appendix B / B12):
 * a single `folder/name` string, not the `name` + `folder` pair the write
 * endpoints use.
 */
export async function execute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const path = normalizeMediaPath(this.getNodeParameter('path', itemIndex, ''));

	if (path === '') {
		throw new NodeOperationError(this.getNode(), 'No file selected', {
			itemIndex,
			description:
				'Choose a file from the list, or provide its path relative to the Drive root, for example videos/clip.mp4.',
		});
	}

	const simplify = this.getNodeParameter('simplify', itemIndex, true) as boolean;

	const response = await json2VideoApiRequest.call(this, 'GET', '/media/file', {
		qs: { path },
		itemIndex,
	});

	const json =
		simplify && typeof response.file === 'object' && response.file !== null
			? (response.file as IDataObject)
			: response;

	return [{ json, pairedItem: { item: itemIndex } }];
}
