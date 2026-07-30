import type { IExecuteFunctions, INode } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { buildMovieRequestBody } from '../nodes/Json2Video/actions/movie/movieRequestBody';

const node: INode = {
	id: 'a1',
	name: 'JSON2Video',
	type: 'n8n-nodes-json2video.json2Video',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

/**
 * Minimal `IExecuteFunctions` stand-in: the builder reads parameters, plus the
 * input item's JSON, which the Variables resourceMapper needs in
 * "Map Automatically" mode.
 */
function fakeExecuteFunctions(
	parameters: Record<string, unknown>,
	itemJson: Record<string, unknown> = {},
) {
	return {
		getNode: () => node,
		getNodeParameter: (name: string, _itemIndex: number, fallback?: unknown) =>
			name in parameters ? parameters[name] : fallback,
		getInputData: () => [{ json: itemJson }],
	} as unknown as IExecuteFunctions;
}

describe('buildMovieRequestBody — Template mode', () => {
	it('builds { template, variables } from the mapped variable fields', () => {
		const context = fakeExecuteFunctions({
			inputMode: 'template',
			templateId: 'LerKrmBfiqaIgBuacLWn',
			specifyVariables: 'keypair',
			variables: {
				mappingMode: 'defineBelow',
				value: {
					headline: 'Summer sale',
					product_image: 'https://example.com/shoe.jpg',
					// A number field keeps its type on the way to the API.
					titleWeight: 600,
					// An untouched field is null and must not be sent.
					subtitle: null,
				},
				matchingColumns: [],
				schema: [],
			},
			additionalOptions: {},
		});

		expect(buildMovieRequestBody.call(context, 0)).toEqual({
			template: 'LerKrmBfiqaIgBuacLWn',
			variables: {
				headline: 'Summer sale',
				product_image: 'https://example.com/shoe.jpg',
				titleWeight: 600,
			},
		});
	});

	it('maps the incoming item onto the template variables automatically', () => {
		const context = fakeExecuteFunctions(
			{
				inputMode: 'template',
				templateId: 'LerKrmBfiqaIgBuacLWn',
				specifyVariables: 'keypair',
				variables: {
					mappingMode: 'autoMapInputData',
					value: null,
					matchingColumns: [],
					schema: [
						{ id: 'headline', displayName: 'Headline', type: 'string', display: true },
						{ id: 'product_image', displayName: 'Product Image', type: 'string', display: true },
					],
				},
				additionalOptions: {},
			},
			{
				headline: 'Summer sale',
				product_image: 'https://example.com/shoe.jpg',
				internal_id: 'not a template variable',
			},
		);

		expect(buildMovieRequestBody.call(context, 0)).toEqual({
			template: 'LerKrmBfiqaIgBuacLWn',
			variables: {
				headline: 'Summer sale',
				product_image: 'https://example.com/shoe.jpg',
			},
		});
	});

	it('omits variables entirely when nothing was mapped', () => {
		const context = fakeExecuteFunctions({
			inputMode: 'template',
			templateId: 'LerKrmBfiqaIgBuacLWn',
			specifyVariables: 'keypair',
			variables: { mappingMode: 'defineBelow', value: null, matchingColumns: [], schema: [] },
			additionalOptions: {},
		});

		expect(buildMovieRequestBody.call(context, 0)).toEqual({
			template: 'LerKrmBfiqaIgBuacLWn',
		});
	});

	it('accepts variables as JSON for numbers and nested values', () => {
		const context = fakeExecuteFunctions({
			inputMode: 'template',
			templateId: 'LerKrmBfiqaIgBuacLWn',
			specifyVariables: 'json',
			variablesJson: '{"price": 49.9, "tags": ["a","b"]}',
			additionalOptions: {},
		});

		expect(buildMovieRequestBody.call(context, 0)).toEqual({
			template: 'LerKrmBfiqaIgBuacLWn',
			variables: { price: 49.9, tags: ['a', 'b'] },
		});
	});

	it('expands the Webhook URL option into the nested exports shape', () => {
		const context = fakeExecuteFunctions({
			inputMode: 'template',
			templateId: 'LerKrmBfiqaIgBuacLWn',
			specifyVariables: 'keypair',
			variables: { mappingMode: 'defineBelow', value: null, matchingColumns: [], schema: [] },
			additionalOptions: {
				resolution: 'instagram-story',
				webhookUrl: 'https://n8n.example.com/webhook/j2v-done',
			},
		});

		expect(buildMovieRequestBody.call(context, 0)).toEqual({
			template: 'LerKrmBfiqaIgBuacLWn',
			resolution: 'instagram-story',
			exports: [
				{
					destinations: [
						{
							type: 'webhook',
							endpoint: 'https://n8n.example.com/webhook/j2v-done',
							'content-type': 'application/json',
						},
					],
				},
			],
		});
	});

	it('fails with a NodeOperationError when no template was selected', () => {
		const context = fakeExecuteFunctions({
			inputMode: 'template',
			templateId: '',
			additionalOptions: {},
		});

		expect(() => buildMovieRequestBody.call(context, 0)).toThrowError(/No template selected/);
	});
});

describe('buildMovieRequestBody — Movie JSON mode', () => {
	it('sends the parsed document, with Additional Options overriding it', () => {
		const context = fakeExecuteFunctions({
			inputMode: 'json',
			movieJson: '{"resolution":"sd","scenes":[{"elements":[]}]}',
			additionalOptions: { resolution: 'full-hd', comment: 'Generated by n8n' },
		});

		expect(buildMovieRequestBody.call(context, 0)).toEqual({
			resolution: 'full-hd',
			scenes: [{ elements: [] }],
			comment: 'Generated by n8n',
		});
	});

	it('rejects malformed Movie JSON before any request is sent', () => {
		const context = fakeExecuteFunctions({
			inputMode: 'json',
			movieJson: '{"scenes": [}',
			additionalOptions: {},
		});

		expect(() => buildMovieRequestBody.call(context, 0)).toThrowError(
			/Movie JSON is not valid JSON/,
		);
	});
});
