import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { Json2VideoApi } from '../credentials/Json2VideoApi.credentials';
import { Json2Video } from '../nodes/Json2Video/Json2Video.node';

// Guard rails for the UI surface. The node is `usableAsTool: true`, so every
// string below is read by an n8n AI Agent as part of its tool prompt, and by
// n8n's own verification reviewers as UX. These assertions encode the rules
// from https://docs.n8n.io/connect/create-nodes/build-your-node/reference/ux-guidelines/
// so a future edit cannot quietly regress them.

const node = new Json2Video();
const credential = new Json2VideoApi();
const { properties } = node.description;

/** Walks top-level properties plus everything nested in collections. */
function walkProperties(props: INodeProperties[]): INodeProperties[] {
	const flat: INodeProperties[] = [];

	for (const prop of props) {
		flat.push(prop);

		if (prop.type === 'collection' || prop.type === 'fixedCollection') {
			for (const option of prop.options ?? []) {
				if ('values' in option && Array.isArray(option.values)) {
					flat.push(...walkProperties(option.values as INodeProperties[]));
				} else if ('name' in option && 'type' in option) {
					flat.push(...walkProperties([option as INodeProperties]));
				}
			}
		}
	}

	return flat;
}

const allProperties = walkProperties(properties);

const operationProperties = properties.filter((prop) => prop.name === 'operation');

const operationOptions = operationProperties.flatMap(
	(prop) => (prop.options ?? []) as INodePropertyOptions[],
);

const resourceProperty = properties.find((prop) => prop.name === 'resource');

/** Every string a user or an AI agent can read. */
function userVisibleStrings(): string[] {
	const strings: string[] = [node.description.displayName, node.description.description];

	for (const prop of allProperties) {
		strings.push(prop.displayName);
		if (typeof prop.description === 'string') strings.push(prop.description);
		if (typeof prop.hint === 'string') strings.push(prop.hint);
		if (typeof prop.placeholder === 'string') strings.push(prop.placeholder);

		for (const option of prop.options ?? []) {
			if ('name' in option && typeof option.name === 'string') strings.push(option.name);
			if ('description' in option && typeof option.description === 'string') {
				strings.push(option.description);
			}
			if ('action' in option && typeof option.action === 'string') strings.push(option.action);
		}

		for (const mode of (prop as INodeProperties).modes ?? []) {
			strings.push(mode.displayName);
			if (typeof mode.placeholder === 'string') strings.push(mode.placeholder);
		}
	}

	for (const prop of credential.properties) {
		strings.push(prop.displayName);
		if (typeof prop.description === 'string') strings.push(prop.description);
		if (typeof prop.placeholder === 'string') strings.push(prop.placeholder);
	}

	return strings;
}

describe('node description', () => {
	it('has the metadata n8n verification checks', () => {
		expect(node.description.displayName).toBe('JSON2Video');
		expect(node.description.name).toBe('json2Video');
		expect(node.description.defaults.name).toBe('JSON2Video');
		expect(node.description.usableAsTool).toBe(true);
		expect(node.description.version).toBe(1);
	});

	it('describes the node well enough to be an AI tool prompt', () => {
		const description = node.description.description;
		expect(description.length).toBeGreaterThan(60);
		// The three resources must be discoverable from the tool description alone.
		expect(description).toMatch(/template/i);
		// The file area is "Storage" in the nodes panel and "Drive" in our own
		// product language; the description must name it one way or the other.
		expect(description).toMatch(/storage|drive/i);
		expect(description).toMatch(/render/i);
		expect(description.endsWith('.')).toBe(true);
	});

	it('renders a subtitle from the selected resource and operation', () => {
		expect(node.description.subtitle).toBe(
			'={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		);
	});

	it('requires the JSON2Video credential', () => {
		expect(node.description.credentials).toEqual([{ name: 'json2VideoApi', required: true }]);
	});
});

describe('resource and operation parameters', () => {
	it('puts Resource first, as n8n expects', () => {
		expect(properties[0].name).toBe('resource');
		expect(properties[0].noDataExpression).toBe(true);
	});

	it('lists resources primary-first, not alphabetically, and defaults to Movie', () => {
		// Deliberately not alphabetical: this order drives the order of the actions
		// list in the nodes panel, and Movie is what the node exists for. Movie
		// first, then Template, then Storage — do not "fix" this to alphabetical.
		const names = ((resourceProperty?.options ?? []) as INodePropertyOptions[]).map(
			(option) => option.name,
		);
		expect(names).toEqual(['Movie', 'Template', 'Storage']);
		expect(resourceProperty?.default).toBe('movie');

		// The label says Storage, the value stays `media`: it matches the
		// `/v2/media/*` endpoints and every workflow in `examples/` that already
		// carries it. The divergence is deliberate — do not "fix" it either.
		const values = ((resourceProperty?.options ?? []) as INodePropertyOptions[]).map(
			(option) => option.value,
		);
		expect(values).toEqual(['movie', 'template', 'media']);

		// The per-resource parameter blocks follow the same order, so the panel
		// renders operations in the order the resources are listed.
		const operationResources = operationProperties.map(
			(prop) => (prop.displayOptions?.show?.resource as string[])[0],
		);
		expect(operationResources).toEqual(['movie', 'template', 'media']);
	});

	it('has exactly one Operation parameter per resource', () => {
		expect(operationProperties).toHaveLength(3);
		for (const prop of operationProperties) {
			expect(prop.noDataExpression).toBe(true);
			expect(prop.displayOptions?.show?.resource).toHaveLength(1);
		}
	});

	it('lists operations alphabetically within each resource', () => {
		for (const prop of operationProperties) {
			const names = ((prop.options ?? []) as INodePropertyOptions[]).map((option) => option.name);
			expect(names).toEqual([...names].sort());
		}
	});

	it('defaults each resource to an operation it actually offers', () => {
		for (const prop of operationProperties) {
			const values = ((prop.options ?? []) as INodePropertyOptions[]).map((option) => option.value);
			expect(values).toContain(prop.default);
		}
	});

	it('exposes 21 operations across the three resources', () => {
		expect(operationOptions).toHaveLength(21);
	});

	it('gives every operation an action and a description', () => {
		for (const option of operationOptions) {
			expect(option.action, `action missing on "${option.name}"`).toBeTruthy();
			expect(option.description, `description missing on "${option.name}"`).toBeTruthy();

			// Actions are sentence case and never end in a full stop.
			const action = option.action as string;
			expect(action[0]).toBe(action[0].toUpperCase());
			expect(action.endsWith('.')).toBe(false);

			// Descriptions are the AI agent's prompt: they must say more than the
			// action already does.
			expect((option.description as string).length).toBeGreaterThan(action.length);
		}
	});
});

describe('parameter conventions', () => {
	it('starts every boolean description with "Whether"', () => {
		for (const prop of allProperties.filter((p) => p.type === 'boolean')) {
			expect(prop.description, `on "${prop.displayName}"`).toBeTruthy();
			expect(prop.description as string, `on "${prop.displayName}"`).toMatch(/^Whether /);
		}
	});

	it('prefixes free-text placeholders with "e.g."', () => {
		const collectionPlaceholders = new Set(['collection', 'fixedCollection']);

		for (const prop of allProperties) {
			if (typeof prop.placeholder !== 'string' || prop.placeholder === '') continue;
			// Collections use their placeholder as the "Add …" button label.
			if (collectionPlaceholders.has(prop.type)) continue;
			expect(prop.placeholder, `on "${prop.displayName}"`).toMatch(/^e\.g\. /);
		}

		for (const prop of allProperties) {
			for (const mode of prop.modes ?? []) {
				if (typeof mode.placeholder !== 'string' || mode.placeholder === '') continue;
				expect(mode.placeholder, `on "${prop.displayName}"`).toMatch(/^e\.g\. /);
			}
		}
	});

	it('gives every parameter a display name in Title Case', () => {
		// Words n8n leaves lowercase in the middle of a Title Case string.
		const minorWords = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'or', 'to']);

		for (const prop of allProperties) {
			const words = prop.displayName.split(' ');
			words.forEach((word, index) => {
				const bare = word.replace(/[^A-Za-z]/g, '');
				if (bare === '') return;
				if (index > 0 && minorWords.has(bare.toLowerCase())) return;
				expect(bare[0], `"${prop.displayName}"`).toBe(bare[0].toUpperCase());
			});
		}
	});

	it('gives every parameter a description', () => {
		// Resource and Operation are the two n8n leaves bare by convention: their
		// per-option descriptions carry the meaning.
		const exempt = new Set(['resource', 'operation']);

		for (const prop of allProperties) {
			if (prop.type === 'notice' || exempt.has(prop.name)) continue;
			expect(prop.description, `on "${prop.displayName}"`).toBeTruthy();
		}
	});

	it('flags every dynamic dropdown as "Name or ID" and links the expressions doc', () => {
		for (const prop of allProperties) {
			if (prop.typeOptions?.loadOptionsMethod === undefined) continue;
			expect(prop.displayName, prop.name).toMatch(/Name or ID$/);
			expect(prop.description as string, prop.name).toContain(
				'https://docs.n8n.io/code/expressions/',
			);
		}
	});

	it('registers every dynamic dropdown method on the node', () => {
		const registered = Object.keys(node.methods?.loadOptions ?? {});

		for (const prop of allProperties) {
			const method = prop.typeOptions?.loadOptionsMethod;
			if (method === undefined) continue;
			expect(registered, `"${prop.displayName}" references an unregistered method`).toContain(
				method,
			);
		}
	});

	it('registers every resourceMapper method on the node', () => {
		const registered = Object.keys(
			(node.methods as { resourceMapping?: Record<string, unknown> })?.resourceMapping ?? {},
		);

		for (const prop of allProperties) {
			const method = prop.typeOptions?.resourceMapper?.resourceMapperMethod;
			if (method === undefined) continue;
			expect(registered, `"${prop.displayName}" references an unregistered method`).toContain(
				method,
			);
		}
	});

	it('renders the template variables as one mapped input each', () => {
		const variables = properties.find((prop) => prop.name === 'variables');

		// A resourceMapper, not a name/value fixedCollection: the point of the
		// change is one labelled, typed input per variable the template declares.
		expect(variables?.type).toBe('resourceMapper');
		expect(variables?.default).toEqual({ mappingMode: 'defineBelow', value: null });
		expect(variables?.noDataExpression).toBe(true);

		// A resourceMapper refetches its field list from `loadOptionsDependsOn`, and
		// a resourceLocator's dependency is its inner `.value`, not the locator.
		expect(variables?.typeOptions?.loadOptionsDependsOn).toEqual(['templateId.value']);

		const mapper = variables?.typeOptions?.resourceMapper;
		expect(mapper?.resourceMapperMethod).toBe('getTemplateVariableFields');
		expect(mapper?.mode).toBe('add');
		expect(mapper?.fieldWords).toEqual({ singular: 'variable', plural: 'variables' });
		expect(mapper?.addAllFields).toBe(true);
		expect(mapper?.multiKeyMatch).toBe(false);
		// Incoming item fields can be mapped automatically as well.
		expect(mapper?.supportAutoMap).toBe(true);
		// The method explains an empty list itself through `emptyFieldsNotice`.
		expect(mapper?.hideNoDataError).toBe(true);

		// Create and Render and Wait share the same form, so both get the mapper.
		expect(variables?.displayOptions?.show?.operation).toEqual(['create', 'renderAndWait']);
		expect(variables?.displayOptions?.show?.specifyVariables).toEqual(['keypair']);

		// The raw-JSON escape hatch is untouched, and remains the only other way
		// to provide variables — there is no third, competing UI.
		const variablesJson = properties.find((prop) => prop.name === 'variablesJson');
		expect(variablesJson?.type).toBe('json');
		expect(variablesJson?.displayOptions?.show?.specifyVariables).toEqual(['json']);

		const specifyVariables = properties.find((prop) => prop.name === 'specifyVariables');
		expect(
			((specifyVariables?.options ?? []) as INodePropertyOptions[]).map((option) => option.value),
		).toEqual(['keypair', 'json']);

		// The 0.3.0 name/value collection and its loadOptions handler are gone from
		// the Movie resource. Template → Duplicate keeps its own `variablesUi`: it
		// bakes values into a copy of someone else's template and is out of scope.
		const movieVariableCollections = properties.filter(
			(prop) =>
				prop.name === 'variablesUi' &&
				(prop.displayOptions?.show?.resource as string[] | undefined)?.includes('movie'),
		);
		expect(movieVariableCollections).toEqual([]);
		expect(Object.keys(node.methods?.loadOptions ?? {})).not.toContain('getTemplateVariables');
	});

	it('pairs every Return All toggle with a Limit', () => {
		const returnAllScopes = allProperties
			.filter((prop) => prop.name === 'returnAll')
			.map((prop) => JSON.stringify(prop.displayOptions?.show?.operation));
		const limitScopes = allProperties
			.filter((prop) => prop.name === 'limit')
			.map((prop) => JSON.stringify(prop.displayOptions?.show?.operation));

		expect(returnAllScopes.length).toBeGreaterThan(0);
		for (const scope of returnAllScopes) {
			expect(limitScopes).toContain(scope);
		}
	});

	it('names the Simplify toggle consistently across resources', () => {
		const simplify = allProperties.filter((prop) => prop.displayName === 'Simplify');
		expect(simplify.length).toBeGreaterThanOrEqual(4);
		for (const prop of simplify) {
			expect(prop.name).toBe('simplify');
			expect(prop.type).toBe('boolean');
			expect(prop.default).toBe(true);
		}
	});

	it('scopes every non-root parameter to a resource and an operation', () => {
		const rootParameters = new Set(['resource', 'operation']);

		for (const prop of properties) {
			if (rootParameters.has(prop.name)) continue;
			expect(prop.displayOptions?.show?.resource, `on "${prop.displayName}"`).toBeTruthy();
			expect(prop.displayOptions?.show?.operation, `on "${prop.displayName}"`).toBeTruthy();
		}
	});

	it('never shows a parameter for an operation that does not exist', () => {
		const operationsByResource = new Map<string, string[]>();
		for (const prop of operationProperties) {
			const resource = (prop.displayOptions?.show?.resource as string[])[0];
			operationsByResource.set(
				resource,
				((prop.options ?? []) as INodePropertyOptions[]).map((option) => String(option.value)),
			);
		}

		for (const prop of properties) {
			const resources = prop.displayOptions?.show?.resource as string[] | undefined;
			const operations = prop.displayOptions?.show?.operation as string[] | undefined;
			if (resources === undefined || operations === undefined) continue;

			const allowed = resources.flatMap((resource) => operationsByResource.get(resource) ?? []);
			for (const operation of operations) {
				expect(allowed, `"${prop.displayName}" shows for an unknown operation`).toContain(
					operation,
				);
			}
		}
	});
});

describe('credential', () => {
	it('masks the API key and documents where to get it', () => {
		const apiKey = credential.properties[0];
		expect(credential.name).toBe('json2VideoApi');
		expect(credential.displayName).toBe('JSON2Video API');
		expect(credential.documentationUrl).toBe(
			'https://json2video.com/docs/v2/guides/dashboard/api-keys',
		);
		expect(apiKey.typeOptions?.password).toBe(true);
		expect(apiKey.required).toBe(true);
		expect(apiKey.description as string).toContain('json2video.com/dashboard/apikeys');
	});
});

describe('English-only surface', () => {
	it('uses no characters outside the Latin-1 range in user-visible strings', () => {
		// Em dashes and typographic quotes are allowed; anything beyond Latin-1
		// would mean a non-English string slipped in.
		for (const value of userVisibleStrings()) {
			const offending = [...value].filter(
				(character) => character.codePointAt(0)! > 0x2e3a, // beyond punctuation block
			);
			expect(offending, `in "${value.slice(0, 60)}"`).toEqual([]);
		}
	});

	it('uses American spelling, matching the rest of the n8n UI', () => {
		const britishisms = /\b\w*(organis|recognis|authoris|colour|behaviour|licence|centre)\w*\b/i;
		for (const value of userVisibleStrings()) {
			expect(value, 'British spelling found').not.toMatch(britishisms);
		}
	});
});
