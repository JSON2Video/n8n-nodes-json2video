import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { buildTemplateVariableList } from '../../helpers/template';
import { json2VideoApiRequest } from '../../transport';

/**
 * Template: Get Variables — `GET /v2/templates?id=&format=make`.
 *
 * Returns the variables a template declares as data, one output item per
 * variable, so a workflow — or an AI Agent using this node as a tool — can
 * discover a template's inputs at runtime instead of having them hard-coded
 * (Appendix D / D10 in `operations.md`).
 *
 * Reuses the same internal `format=make` fetch and mapping the Variables
 * `resourceMapper` uses on Movie → Create / Render and Wait
 * (`methods/resourceMapping.ts` → `getTemplateVariableFields`) — see
 * `buildTemplateVariableList` in `helpers/template.ts`. Nothing here
 * re-implements the fetch or the type mapping.
 *
 * `make_webhook_url` and `client_data` (Make.com platform artifacts injected
 * into every template) are filtered out by exact name, same as the mapper.
 *
 * No `Simplify` toggle: unlike Get, there is no raw-envelope vs. simplified
 * choice to make here — the whole point of this operation is one item per
 * variable, the same "no toggle" call already made for Get Many and Get
 * Library.
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

	const response = await json2VideoApiRequest.call(this, 'GET', '/templates', {
		qs: { id: templateId.trim(), format: 'make' },
		itemIndex,
	});

	const template =
		typeof response.template === 'object' && response.template !== null
			? (response.template as IDataObject)
			: {};

	const variables = buildTemplateVariableList(template.variables);

	return variables.map((variable) => ({
		json: variable as unknown as IDataObject,
		pairedItem: { item: itemIndex },
	}));
}
