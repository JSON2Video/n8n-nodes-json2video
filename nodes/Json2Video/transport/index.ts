import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
} from 'n8n-workflow';

import { toNodeApiError } from '../helpers/errors';

/**
 * The only public JSON2Video base URL. Deliberately not configurable: there is
 * no environment switcher and no custom base URL field.
 */
export const JSON2VIDEO_BASE_URL = 'https://api.json2video.com/v2';

export interface Json2VideoRequestOptions {
	body?: IDataObject;
	qs?: IDataObject;
	/** Item index, so errors are attributed to the right input item. */
	itemIndex?: number;
}

/**
 * Single entry point for every JSON2Video API call. Authentication is injected
 * by the `json2VideoApi` credential (`x-api-key` header) — the key is never
 * read, copied or logged here.
 *
 * All failures are normalised into a `NodeApiError` that surfaces the API's own
 * `message` (see `helpers/errors.ts`).
 */
export async function json2VideoApiRequest(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	options: Json2VideoRequestOptions = {},
): Promise<IDataObject> {
	const requestOptions: IHttpRequestOptions = {
		method,
		url: `${JSON2VIDEO_BASE_URL}${endpoint}`,
		headers: {
			Accept: 'application/json',
		},
		json: true,
	};

	if (options.body !== undefined) {
		requestOptions.body = options.body;
		requestOptions.headers = { ...requestOptions.headers, 'Content-Type': 'application/json' };
	}

	if (options.qs !== undefined) {
		requestOptions.qs = options.qs;
	}

	try {
		const response = await this.helpers.httpRequestWithAuthentication.call(
			this,
			'json2VideoApi',
			requestOptions,
		);
		return (response ?? {}) as IDataObject;
	} catch (error) {
		throw toNodeApiError(this.getNode(), error, options.itemIndex);
	}
}
