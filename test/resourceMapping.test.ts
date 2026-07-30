import type { IDataObject, ILoadOptionsFunctions, INode } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import {
	getTemplateVariableFields,
	LOAD_FAILED_NOTICE,
	NO_TEMPLATE_NOTICE,
	NO_VARIABLES_NOTICE,
} from '../nodes/Json2Video/methods/resourceMapping';

const node: INode = {
	id: 'a1',
	name: 'JSON2Video',
	type: 'n8n-nodes-json2video.json2Video',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

/**
 * Minimal `ILoadOptionsFunctions` stand-in for `getTemplateVariableFields`:
 * `getCurrentNodeParameter('templateId')` returns whatever the test wants the
 * selected resourceLocator value to be, and
 * `helpers.httpRequestWithAuthentication` stands in for the real HTTP call the
 * shared transport makes, so these tests never touch the network.
 */
function fakeLoadOptionsFunctions(options: {
	templateId?: unknown;
	response?: IDataObject;
	throwError?: unknown;
}): { context: ILoadOptionsFunctions; requestCount: () => number } {
	let requests = 0;

	const context = {
		getNode: () => node,
		getCurrentNodeParameter: () => options.templateId,
		helpers: {
			httpRequestWithAuthentication: async () => {
				requests += 1;
				if (options.throwError !== undefined) throw options.throwError;
				return options.response ?? {};
			},
		},
	} as unknown as ILoadOptionsFunctions;

	return { context, requestCount: () => requests };
}

// Appendix C: "A resourceMapper degrades differently from a dropdown: instead
// of an empty list it should return `{ fields: [], emptyFieldsNotice: '…' }`".
// These tests lock down which of the three notices n8n's ResourceMapper.vue
// renders for each distinguishable case (see the report for how the render
// condition was confirmed against n8n's own source).
describe('getTemplateVariableFields — emptyFieldsNotice per case', () => {
	it('shows the "select a template" notice and makes no request when nothing is selected', async () => {
		const { context, requestCount } = fakeLoadOptionsFunctions({
			templateId: { mode: 'list', value: '' },
		});

		expect(await getTemplateVariableFields.call(context)).toEqual({
			fields: [],
			emptyFieldsNotice: NO_TEMPLATE_NOTICE,
		});
		expect(requestCount()).toBe(0);
	});

	it('shows the "select a template" notice for an expression that resolved to an empty string', async () => {
		const { context } = fakeLoadOptionsFunctions({ templateId: '' });

		expect(await getTemplateVariableFields.call(context)).toEqual({
			fields: [],
			emptyFieldsNotice: NO_TEMPLATE_NOTICE,
		});
	});

	it('returns fields with no notice when the template declares variables', async () => {
		const { context } = fakeLoadOptionsFunctions({
			templateId: { mode: 'list', value: 'pi4ClZRP9cScS74SNFOa' },
			response: {
				template: {
					variables: [{ name: 'quote', label: 'Quote', type: 'text', default: 'Ship it' }],
				},
			},
		});

		const result = await getTemplateVariableFields.call(context);
		expect(result.fields).toHaveLength(1);
		expect(result.fields[0]).toMatchObject({ id: 'quote', displayName: 'Quote' });
		expect(result.emptyFieldsNotice).toBeUndefined();
	});

	it('shows the "declares no variables" notice for a template with none', async () => {
		const { context } = fakeLoadOptionsFunctions({
			templateId: { mode: 'list', value: 'pi4ClZRP9cScS74SNFOa' },
			response: { template: { variables: [] } },
		});

		expect(await getTemplateVariableFields.call(context)).toEqual({
			fields: [],
			emptyFieldsNotice: NO_VARIABLES_NOTICE,
		});
	});

	it('shows the "declares no variables" notice when only the Make.com platform artifacts remain', async () => {
		// A template whose only "variables" are make_webhook_url and client_data
		// is, from the user's point of view, a template with none.
		const { context } = fakeLoadOptionsFunctions({
			templateId: { mode: 'list', value: 'pi4ClZRP9cScS74SNFOa' },
			response: {
				template: {
					variables: [
						{ name: 'make_webhook_url', type: 'text', label: 'Webhook URL' },
						{ name: 'client_data', type: 'array', label: 'Client data', spec: [] },
					],
				},
			},
		});

		expect(await getTemplateVariableFields.call(context)).toEqual({
			fields: [],
			emptyFieldsNotice: NO_VARIABLES_NOTICE,
		});
	});

	it('shows the "could not be loaded" notice when the fetch throws, and does not throw itself', async () => {
		const { context } = fakeLoadOptionsFunctions({
			templateId: { mode: 'list', value: 'unknown-id-or-revoked-key' },
			throwError: new Error('Request failed with status code 400'),
		});

		await expect(getTemplateVariableFields.call(context)).resolves.toEqual({
			fields: [],
			emptyFieldsNotice: LOAD_FAILED_NOTICE,
		});
	});

	it('shows the "could not be loaded" notice for a malformed response, without throwing', async () => {
		const { context } = fakeLoadOptionsFunctions({
			templateId: { mode: 'list', value: 'pi4ClZRP9cScS74SNFOa' },
			response: { template: 'not an object' } as unknown as IDataObject,
		});

		await expect(getTemplateVariableFields.call(context)).resolves.toEqual({
			fields: [],
			emptyFieldsNotice: NO_VARIABLES_NOTICE,
		});
	});

	it('points at "Using JSON" as the fallback when the load fails', () => {
		expect(LOAD_FAILED_NOTICE).toContain('Using JSON');
	});
});
