import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

import { stripMovieJson } from '../../helpers/movie';
import { json2VideoApiRequest } from '../../transport';

/** Server-side page size ceiling of `GET /v2/movies`. */
const MAX_PAGE_SIZE = 100;

/** Safety cap so a broken cursor can never loop forever. */
const MAX_PAGES = 50;

function toIsoDate(value: unknown): string | undefined {
	if (typeof value !== 'string' || value.trim() === '') return undefined;
	return value.trim();
}

/**
 * Movie: Get Many — `GET /v2/movies`.
 *
 * Emits one item per movie. Pagination is server-side through `next_token`.
 *
 * `format=simple` is still sent, but the list endpoint ignores it and always
 * returns each movie's submitted Movie JSON in `json` (verified live against
 * the API on 2026-07-30 — unlike the single-project form of the same endpoint,
 * which does honour it). Without a client-side strip, *Include Movie JSON* off
 * would be a no-op and every item would carry a multi-kilobyte string that n8n
 * then renders in the UI.
 */
export async function execute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const returnAll = this.getNodeParameter('returnAll', itemIndex, false) as boolean;
	const limit = returnAll ? Infinity : (this.getNodeParameter('limit', itemIndex, 50) as number);
	const additionalOptions = this.getNodeParameter('additionalOptions', itemIndex, {}) as IDataObject;
	const includeMovieJson = additionalOptions.includeMovieJson === true;

	const qs: IDataObject = {
		limit: returnAll ? MAX_PAGE_SIZE : Math.min(Math.max(limit, 1), MAX_PAGE_SIZE),
	};

	const dateStart = toIsoDate(additionalOptions.dateStart);
	if (dateStart !== undefined) qs.date_start = dateStart;

	const dateEnd = toIsoDate(additionalOptions.dateEnd);
	if (dateEnd !== undefined) qs.date_end = dateEnd;

	if (!includeMovieJson) qs.format = 'simple';

	const movies: IDataObject[] = [];

	for (let page = 0; page < MAX_PAGES; page++) {
		const response = await json2VideoApiRequest.call(this, 'GET', '/movies', { qs, itemIndex });

		const pageMovies = Array.isArray(response.movies) ? (response.movies as IDataObject[]) : [];
		movies.push(...pageMovies);

		if (!returnAll && movies.length >= limit) break;

		const nextToken = response.next_token;
		if (response.has_next !== true || typeof nextToken !== 'string' || nextToken === '') break;

		qs.next_token = nextToken;
	}

	const selected = returnAll ? movies : movies.slice(0, limit);

	return selected.map((movie) => ({
		json: includeMovieJson ? movie : stripMovieJson(movie),
		pairedItem: { item: itemIndex },
	}));
}
