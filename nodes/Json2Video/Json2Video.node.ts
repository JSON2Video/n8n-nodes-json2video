import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

// Placeholder description. Resources, operations and fields are added in
// Phases 4-6 (Movie, Template, Media) per `integrations/shared/operations.md`.
// This node uses the programmatic style (an `execute` method) because the
// "Render & Wait" operation needs to create a movie and then poll the API
// until it reaches a terminal status, which does not fit the declarative
// request/response mapping style.
export class Json2Video implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'JSON2Video',
		name: 'json2Video',
		icon: { light: 'file:json2video.svg', dark: 'file:json2video.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Create and render videos from JSON or templates via the JSON2Video API',
		defaults: {
			name: 'JSON2Video',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'json2VideoApi',
				required: true,
			},
		],
		properties: [
			// Resource / Operation properties are added in Phases 4-6.
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		// Implementation added in Phases 4-6 (Movie, Template, Media resources).
		return [items];
	}
}
