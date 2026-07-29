import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

import {
	buildListFolderItems,
	buildListFolderQuery,
	extractListFolderMeta,
	type ListFolderMeta,
} from '../../helpers/media';
import { json2VideoApiRequest } from '../../transport';

/** Page size used when paging; also what the Media File dropdown asks for. */
const MAX_PAGE_SIZE = 100;

/** Safety cap so a server that never advances can never loop forever. */
const MAX_PAGES = 100;

/**
 * Media: List Folder — `GET /v2/media/folder`.
 *
 * Kept separate from Get Folder Tree on purpose: `tree=true` returns a
 * completely different response shape, and folding both into one operation
 * would make the output schema unpredictable.
 *
 * Pagination is server-side: `page` (zero-based) + `page_size`.
 */
export async function execute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const path = this.getNodeParameter('path', itemIndex, '') as string;
	const returnAll = this.getNodeParameter('returnAll', itemIndex, false) as boolean;
	const limit = returnAll ? Infinity : (this.getNodeParameter('limit', itemIndex, 50) as number);
	const additionalOptions = this.getNodeParameter('additionalOptions', itemIndex, {}) as IDataObject;

	const pageSize = returnAll ? MAX_PAGE_SIZE : Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);

	const files: IDataObject[] = [];
	let meta: ListFolderMeta = { path: '', folders: [], total: 0, total_files: 0, total_size: 0 };

	for (let page = 0; page < MAX_PAGES; page++) {
		const qs = buildListFolderQuery({
			path,
			page,
			pageSize,
			type: additionalOptions.type,
			search: additionalOptions.q,
		});

		const response = await json2VideoApiRequest.call(this, 'GET', '/media/folder', {
			qs,
			itemIndex,
		});

		// The counters and the sub-folder list describe the folder, not the page.
		if (page === 0) meta = extractListFolderMeta(response);

		const pageFiles = Array.isArray(response.files) ? (response.files as IDataObject[]) : [];
		files.push(...pageFiles);

		if (pageFiles.length === 0) break;
		if (!returnAll && files.length >= limit) break;
		// A short page is the last page — this is the terminator that does not
		// depend on `total` being present in the response.
		if (pageFiles.length < pageSize) break;
		if (meta.total > 0 && files.length >= meta.total) break;
	}

	const selected = returnAll ? files : files.slice(0, limit);

	return buildListFolderItems(selected, meta).map((json) => ({
		json,
		pairedItem: { item: itemIndex },
	}));
}
