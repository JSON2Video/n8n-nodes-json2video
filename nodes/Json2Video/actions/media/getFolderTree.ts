import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

import { json2VideoApiRequest } from '../../transport';

/**
 * Media: Get Folder Tree — `GET /v2/media/folder?tree=true`.
 *
 * A flat list of every folder with aggregated stats, emitted one item per
 * folder. Also what backs the Media Folder dropdown (Appendix C).
 */
export async function execute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const response = await json2VideoApiRequest.call(this, 'GET', '/media/folder', {
		qs: { tree: true },
		itemIndex,
	});

	const tree = Array.isArray(response.tree) ? (response.tree as IDataObject[]) : [];

	return tree.map((folder) => ({ json: folder, pairedItem: { item: itemIndex } }));
}
