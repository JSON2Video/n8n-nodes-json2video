import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { parseJsonObjectParameter } from '../../helpers/movie';
import { buildTemplateBody, parseTagsParameter, withDualTemplateId } from '../../helpers/template';
import { json2VideoApiRequest } from '../../transport';

/**
 * Template: Create — `POST /v2/templates` (no `id` query parameter — its
 * presence is what distinguishes Update, see `update.ts`).
 *
 * Returns `{ success, templateId, timestamp }`. The node also emits `id` with
 * the same value (Appendix B / B8): `GET /templates` names the same field
 * `id`, and workflow authors trip over the asymmetry constantly.
 */
export async function execute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const name = this.getNodeParameter('name', itemIndex) as string;
	const movieJson = this.getNodeParameter('movieJson', itemIndex);
	const additionalOptions = this.getNodeParameter('additionalOptions', itemIndex, {}) as IDataObject;

	let movie: IDataObject;
	try {
		movie = parseJsonObjectParameter(movieJson, 'Movie JSON');
	} catch (error) {
		throw new NodeOperationError(this.getNode(), (error as Error).message, { itemIndex });
	}

	const body = buildTemplateBody({
		name,
		movie,
		tags: parseTagsParameter(additionalOptions.tags),
		prompt: typeof additionalOptions.prompt === 'string' ? additionalOptions.prompt : undefined,
	});

	const response = await json2VideoApiRequest.call(this, 'POST', '/templates', { body, itemIndex });

	return [{ json: withDualTemplateId(response), pairedItem: { item: itemIndex } }];
}
