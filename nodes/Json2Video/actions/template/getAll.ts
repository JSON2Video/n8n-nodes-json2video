import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

import { applyClientSideLimit, templateHasTag } from '../../helpers/template';
import { json2VideoApiRequest } from '../../transport';

/**
 * Template: Get Many — `GET /v2/templates`.
 *
 * The endpoint has no server-side pagination despite returning a `count`
 * (Appendix B / B10): every template is fetched in one call, the optional Tag
 * filter and the Return All / Limit slicing both happen client-side.
 */
export async function execute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const returnAll = this.getNodeParameter('returnAll', itemIndex, false) as boolean;
	const limit = this.getNodeParameter('limit', itemIndex, 50) as number;
	const additionalOptions = this.getNodeParameter('additionalOptions', itemIndex, {}) as IDataObject;

	const response = await json2VideoApiRequest.call(this, 'GET', '/templates', { itemIndex });
	let templates = Array.isArray(response.templates) ? (response.templates as IDataObject[]) : [];

	const tag = typeof additionalOptions.tag === 'string' ? additionalOptions.tag.trim() : '';
	if (tag !== '') templates = templates.filter((template) => templateHasTag(template, tag));

	const selected = applyClientSideLimit(templates, returnAll, limit);

	return selected.map((template) => ({ json: template, pairedItem: { item: itemIndex } }));
}
