import type { IDataObject, ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';

import { collectSortedTags } from '../helpers/template';
import { json2VideoApiRequest } from '../transport';

/**
 * "Template Tag" dropdown (Appendix C): the union of every tag across the
 * account's templates, deduplicated and sorted. Backs Template: Get Many →
 * Additional Options → Tag.
 *
 * Degrades gracefully: an expired key, a key whose role is too low, or a
 * transient failure returns an empty list instead of breaking the parameter
 * panel.
 */
export async function getTemplateTags(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	try {
		const response = await json2VideoApiRequest.call(this, 'GET', '/templates');
		const templates = Array.isArray(response.templates) ? (response.templates as IDataObject[]) : [];

		return collectSortedTags(templates).map((tag) => ({ name: tag, value: tag }));
	} catch {
		return [];
	}
}
