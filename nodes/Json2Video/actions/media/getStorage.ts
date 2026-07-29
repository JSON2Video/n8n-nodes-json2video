import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

import { json2VideoApiRequest } from '../../transport';

/**
 * Media: Get Storage Usage — `GET /v2/media`.
 *
 * The cheapest pre-flight check before a bulk upload: `blocked` tells you
 * whether uploads are being rejected, and `used_bytes` / `free_allowance` are
 * both in bytes.
 */
export async function execute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const simplify = this.getNodeParameter('simplify', itemIndex, true) as boolean;

	const response = await json2VideoApiRequest.call(this, 'GET', '/media', { itemIndex });

	const json =
		simplify && typeof response.storage === 'object' && response.storage !== null
			? (response.storage as IDataObject)
			: response;

	return [{ json, pairedItem: { item: itemIndex } }];
}
