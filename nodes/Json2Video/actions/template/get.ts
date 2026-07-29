import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { json2VideoApiRequest } from '../../transport';

/**
 * Template: Get — `GET /v2/templates?id=`.
 *
 * `template.movie` may come back as a JSON string or as an object, depending
 * on how the template was stored. It is left exactly as the API sent it — do
 * not auto-parse it, or a Get → Update round trip would silently change its
 * shape.
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
			description:
				'Choose a template from the list or provide its ID. The ID is the 20-character string returned when the template was created.',
		});
	}

	const simplify = this.getNodeParameter('simplify', itemIndex, true) as boolean;
	const additionalOptions = this.getNodeParameter('additionalOptions', itemIndex, {}) as IDataObject;

	const qs: IDataObject = { id: templateId.trim() };

	const format = additionalOptions.format;
	if (typeof format === 'string' && format !== '') qs.format = format;

	const scopes = additionalOptions.scopes;
	if (typeof scopes === 'string' && scopes.trim() !== '') qs.scopes = scopes.trim();

	const response = await json2VideoApiRequest.call(this, 'GET', '/templates', { qs, itemIndex });

	const json =
		simplify && typeof response.template === 'object' && response.template !== null
			? (response.template as IDataObject)
			: response;

	return [{ json, pairedItem: { item: itemIndex } }];
}
