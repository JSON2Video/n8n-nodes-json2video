import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { parseJsonObjectParameter } from '../../helpers/movie';
import { buildTemplateBody, parseTagsParameter, withDualTemplateId } from '../../helpers/template';
import { json2VideoApiRequest } from '../../transport';

/**
 * Template: Update — `POST /v2/templates?id=`.
 *
 * Same endpoint and body shape as Create; the `id` query parameter is what
 * tells the API to update instead of creating a new template — this is why
 * the catalogue splits the one endpoint into two n8n operations rather than
 * inferring create-vs-update from whether an ID field was filled in.
 *
 * Only the fields present in Update Fields are sent, so untouched fields on
 * the stored template are left alone (Movie JSON, being replaced wholesale
 * when set, is the one exception — the API does not merge it).
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
			description: 'Choose the template to update from the list or provide its ID.',
		});
	}

	const updateFields = this.getNodeParameter('updateFields', itemIndex, {}) as IDataObject;

	let movie: IDataObject | undefined;
	if (typeof updateFields.movieJson === 'string' && updateFields.movieJson.trim() !== '') {
		try {
			movie = parseJsonObjectParameter(updateFields.movieJson, 'Movie JSON');
		} catch (error) {
			throw new NodeOperationError(this.getNode(), (error as Error).message, { itemIndex });
		}
	}

	const tags = parseTagsParameter(updateFields.tags);

	const body = buildTemplateBody({
		name: typeof updateFields.name === 'string' ? updateFields.name : undefined,
		movie,
		tags: tags.length > 0 ? tags : undefined,
		prompt: typeof updateFields.prompt === 'string' ? updateFields.prompt : undefined,
	});

	if (Object.keys(body).length === 0) {
		throw new NodeOperationError(
			this.getNode(),
			'Update Fields must include at least one field to change',
			{ itemIndex },
		);
	}

	const response = await json2VideoApiRequest.call(this, 'POST', '/templates', {
		qs: { id: templateId.trim() },
		body,
		itemIndex,
	});

	return [{ json: withDualTemplateId(response), pairedItem: { item: itemIndex } }];
}
