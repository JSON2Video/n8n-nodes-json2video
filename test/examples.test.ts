import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { Json2Video } from '../nodes/Json2Video/Json2Video.node';

// The example workflows are a documentation surface: n8n verification asks for
// importable examples, and an example that silently drifts from the node's real
// parameter names is worse than no example at all. These tests load every file
// in `examples/` and check it against the live node description.
//
// The files are pulled in with Vite's `import.meta.glob` rather than `fs`:
// community nodes may not import Node built-ins, and `n8n-node lint` enforces
// that across the whole package, tests included.

const NODE_TYPE = 'n8n-nodes-json2video.json2Video';

interface WorkflowNode {
	name: string;
	type: string;
	typeVersion: number;
	position: [number, number];
	parameters: Record<string, unknown>;
	credentials?: Record<string, { name?: string; id?: string }>;
}

interface Workflow {
	name: string;
	nodes: WorkflowNode[];
	connections: Record<string, { main: Array<Array<{ node: string; type: string; index: number }>> }>;
}

const exampleModules = import.meta.glob('../examples/*.json', { eager: true }) as Record<
	string,
	{ default: Workflow }
>;

const workflows = Object.entries(exampleModules)
	.map(([path, module]) => ({
		file: path.split('/').pop() as string,
		workflow: module.default,
	}))
	.sort((a, b) => a.file.localeCompare(b.file));

const readmeModules = import.meta.glob('../examples/README.md', {
	eager: true,
	query: '?raw',
	import: 'default',
}) as Record<string, string>;

const node = new Json2Video();

/** Flattens the node's properties so nested collection keys count as known. */
function collectParameterNames(props: INodeProperties[]): Set<string> {
	const names = new Set<string>();

	for (const prop of props) {
		names.add(prop.name);

		if (prop.type === 'collection' || prop.type === 'fixedCollection') {
			for (const option of prop.options ?? []) {
				if ('values' in option && Array.isArray(option.values)) {
					names.add((option as { name: string }).name);
					for (const value of option.values as INodeProperties[]) names.add(value.name);
				} else if ('name' in option) {
					names.add(String((option as { name: unknown }).name));
				}
			}
		}
	}

	return names;
}

const knownParameters = collectParameterNames(node.description.properties);

const operationsByResource = new Map<string, string[]>();
for (const prop of node.description.properties) {
	if (prop.name !== 'operation') continue;
	const resource = (prop.displayOptions?.show?.resource as string[])[0];
	operationsByResource.set(
		resource,
		((prop.options ?? []) as INodePropertyOptions[]).map((option) => String(option.value)),
	);
}

describe('example workflows', () => {
	it('ships at least three importable examples plus a README', () => {
		expect(workflows.length).toBeGreaterThanOrEqual(3);

		const readme = Object.values(readmeModules)[0];
		expect(readme, 'examples/README.md is missing').toBeTruthy();

		// Every workflow file must be linked from the examples README.
		for (const { file } of workflows) {
			expect(readme, `${file} is not documented`).toContain(file);
		}
	});

	it.each(workflows)('$file is a valid n8n workflow export', ({ workflow }) => {
		expect(typeof workflow.name).toBe('string');
		expect(Array.isArray(workflow.nodes)).toBe(true);
		expect(workflow.nodes.length).toBeGreaterThan(1);
		expect(typeof workflow.connections).toBe('object');

		const names = new Set<string>();
		for (const workflowNode of workflow.nodes) {
			expect(typeof workflowNode.name, 'node name').toBe('string');
			expect(names.has(workflowNode.name), `duplicate node name "${workflowNode.name}"`).toBe(false);
			names.add(workflowNode.name);

			expect(typeof workflowNode.type).toBe('string');
			expect(typeof workflowNode.typeVersion).toBe('number');
			expect(workflowNode.position).toHaveLength(2);
			expect(typeof workflowNode.parameters).toBe('object');
		}

		// Connections may only reference nodes that exist in the file.
		for (const [source, outputs] of Object.entries(workflow.connections)) {
			expect(names, `connection source "${source}"`).toContain(source);
			for (const output of outputs.main) {
				for (const connection of output) {
					expect(names, `connection target "${connection.node}"`).toContain(connection.node);
				}
			}
		}
	});

	it.each(workflows)('$file drives the JSON2Video node correctly', ({ workflow }) => {
		const json2videoNodes = workflow.nodes.filter((n) => n.type === NODE_TYPE);
		expect(json2videoNodes.length).toBeGreaterThan(0);

		for (const workflowNode of json2videoNodes) {
			expect(workflowNode.typeVersion).toBe(node.description.version);

			const resource = workflowNode.parameters.resource as string;
			const operation = workflowNode.parameters.operation as string;

			expect(operationsByResource.has(resource), `unknown resource "${resource}"`).toBe(true);
			expect(
				operationsByResource.get(resource),
				`"${operation}" is not an operation of "${resource}"`,
			).toContain(operation);

			for (const key of Object.keys(workflowNode.parameters)) {
				expect(knownParameters, `unknown parameter "${key}"`).toContain(key);
			}

			// Credentials are referenced by name only: a hard-coded credential ID
			// from our own instance would not resolve for anyone else.
			expect(workflowNode.credentials?.json2VideoApi?.name).toBe('JSON2Video account');
			expect(workflowNode.credentials?.json2VideoApi?.id).toBeUndefined();
		}
	});

	it.each(workflows)('$file contains no secrets', ({ workflow }) => {
		const serialized = JSON.stringify(workflow);
		expect(serialized).not.toMatch(/x-api-key/i);
		expect(serialized).not.toMatch(/apiKey["']?\s*:\s*["'][^"']+["']/);
	});
});
