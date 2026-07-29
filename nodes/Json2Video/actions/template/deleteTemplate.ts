import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { buildDeleteTemplateResponse } from '../../helpers/template';
import { json2VideoApiRequest } from '../../transport';

/**
 * Template: Delete — `DELETE /v2/templates?id=`.
 *
 * The raw response is just `{ success, timestamp }` — it does not echo the
 * deleted ID, so the node builds `{ success, templateId, deleted: true }`
 * itself, otherwise the ID would be lost to downstream nodes.
 */
export async function execute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const templateId = this.getNodeParameter('templateId', itemIndex, undefined, {
		extractValue: true,
	}) as string;

	if (typeof templateId !== 'string' || templateId.trim() === '') {
		throw new NodeOperationError(this.getNode(), 'No template selected', {
			itemIndex,
			description: 'Choose the template to delete from the list or provide its ID.',
		});
	}

	const trimmedId = templateId.trim();

	await json2VideoApiRequest.call(this, 'DELETE', '/templates', {
		qs: { id: trimmedId },
		itemIndex,
	});

	return [{ json: buildDeleteTemplateResponse(trimmedId), pairedItem: { item: itemIndex } }];
}
