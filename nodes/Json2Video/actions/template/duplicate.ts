import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { keyValuePairsToObject, parseJsonObjectParameter } from '../../helpers/movie';
import { withDualTemplateId } from '../../helpers/template';
import { json2VideoApiRequest } from '../../transport';

/**
 * Template: Duplicate — `POST /v2/templates?id=&action=duplicate`.
 *
 * Copies a template — the caller's own, or one from the public library —
 * into the account, optionally deep-merging variables. Returns
 * `{ success, templateId, name, timestamp }`; the node also emits `id` with
 * the same value (Appendix B / B8).
 */
export async function execute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const sourceTemplateId = this.getNodeParameter('templateId', itemIndex, undefined, {
		extractValue: true,
	}) as string;

	if (typeof sourceTemplateId !== 'string' || sourceTemplateId.trim() === '') {
		throw new NodeOperationError(this.getNode(), 'No source template selected', {
			itemIndex,
			description:
				'Choose the template to copy from the list (your own templates or the public library), or provide its ID.',
		});
	}

	const name = this.getNodeParameter('name', itemIndex, '') as string;
	const specifyVariables = this.getNodeParameter('specifyVariables', itemIndex, 'keypair') as string;

	let variables: IDataObject;
	if (specifyVariables === 'json') {
		const variablesJson = this.getNodeParameter('variablesJson', itemIndex, '{}');
		try {
			variables = parseJsonObjectParameter(variablesJson, 'Variables (JSON)');
		} catch (error) {
			throw new NodeOperationError(this.getNode(), (error as Error).message, { itemIndex });
		}
	} else {
		variables = keyValuePairsToObject(this.getNodeParameter('variablesUi', itemIndex, {}), 'variable');
	}

	const body: IDataObject = {};
	if (name.trim() !== '') body.name = name.trim();
	if (Object.keys(variables).length > 0) body.variables = variables;

	const response = await json2VideoApiRequest.call(this, 'POST', '/templates', {
		qs: { id: sourceTemplateId.trim(), action: 'duplicate' },
		body,
		itemIndex,
	});

	return [{ json: withDualTemplateId(response), pairedItem: { item: itemIndex } }];
}
