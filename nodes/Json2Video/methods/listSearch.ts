import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
} from 'n8n-workflow';

import { json2VideoApiRequest } from '../transport';

/** Cap what is rendered so an account with thousands of templates stays usable. */
const MAX_RESULTS = 200;

/**
 * Lists the account's templates for the Template resource locator.
 *
 * Degrades gracefully: an expired key or a key whose role is too low returns an
 * empty list instead of breaking the whole parameter panel — the "By ID" mode
 * always stays available.
 */
export async function searchTemplates(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	let templates: IDataObject[] = [];

	try {
		const response = await json2VideoApiRequest.call(this, 'GET', '/templates');
		templates = Array.isArray(response.templates) ? (response.templates as IDataObject[]) : [];
	} catch {
		return { results: [] };
	}

	const needle = filter?.trim().toLowerCase() ?? '';

	const results: INodeListSearchItems[] = [];
	for (const template of templates) {
		const id = typeof template.id === 'string' ? template.id : undefined;
		if (id === undefined) continue;

		const name = typeof template.name === 'string' && template.name !== '' ? template.name : id;
		const tags = Array.isArray(template.tags)
			? (template.tags as unknown[]).filter((tag): tag is string => typeof tag === 'string')
			: [];

		const label = tags.length > 0 ? `${name} — ${tags.join(', ')}` : name;

		if (needle !== '' && !label.toLowerCase().includes(needle) && !id.toLowerCase().includes(needle)) {
			continue;
		}

		results.push({ name: label, value: id });
		if (results.length >= MAX_RESULTS) break;
	}

	return { results };
}
