import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

import { applyClientSideLimit, parseTagsParameter } from '../../helpers/template';
import { json2VideoApiRequest } from '../../transport';

/**
 * Template: Get Library — `GET /v2/templates/library`.
 *
 * Unlike Get Many's Tag filter, `tags` here is a genuine server-side query
 * parameter: the API always includes every published template plus any
 * carrying one of the requested tags, a union that cannot be reproduced
 * client-side without knowing which templates are "published". Return All /
 * Limit are still client-side — this endpoint has no server-side pagination
 * either (Appendix B / B10). The library never returns the `movie` payload;
 * duplicate the template first, then read it with Template: Get.
 */
export async function execute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const returnAll = this.getNodeParameter('returnAll', itemIndex, false) as boolean;
	const limit = this.getNodeParameter('limit', itemIndex, 50) as number;
	const additionalOptions = this.getNodeParameter('additionalOptions', itemIndex, {}) as IDataObject;

	const qs: IDataObject = {};
	const tags = parseTagsParameter(additionalOptions.tags);
	if (tags.length > 0) qs.tags = tags.join(',');

	const response = await json2VideoApiRequest.call(this, 'GET', '/templates/library', { qs, itemIndex });
	const templates = Array.isArray(response.templates) ? (response.templates as IDataObject[]) : [];

	const selected = applyClientSideLimit(templates, returnAll, limit);

	return selected.map((template) => ({ json: template, pairedItem: { item: itemIndex } }));
}
