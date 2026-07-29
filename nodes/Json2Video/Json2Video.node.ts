import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { executeMediaOperation } from './actions/media';
import { executeMovieOperation } from './actions/movie';
import { executeTemplateOperation } from './actions/template';
import {
	mediaFields,
	mediaOperations,
	movieFields,
	movieOperations,
	templateFields,
	templateOperations,
} from './descriptions';
import { getAttachedProjectId, toNodeError } from './helpers/errors';
import {
	getMediaFileNames,
	getMediaFiles,
	getMediaFolders,
	getTemplateTags,
} from './methods/loadOptions';
import { searchLibraryTemplates, searchTemplates } from './methods/listSearch';

// This node uses the programmatic style (an `execute` method) because the
// "Render and Wait" operation creates a movie and then polls the API until the
// render reaches a terminal status, with backoff and retry rules that the
// declarative request/response mapping cannot express.
//
// Layout, so Media (Phase 6) slots in without churn:
//   descriptions/  UI parameter definitions, one file per resource
//   actions/       one folder per resource, one file per operation
//   transport/     the shared authenticated request helper
//   helpers/       pure, unit-testable logic (error extraction, polling, payloads)
//   methods/       loadOptions / listSearch handlers
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
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Media',
						value: 'media',
					},
					{
						name: 'Movie',
						value: 'movie',
					},
					{
						name: 'Template',
						value: 'template',
					},
				],
				default: 'movie',
			},
			...movieOperations,
			...movieFields,
			...templateOperations,
			...templateFields,
			...mediaOperations,
			...mediaFields,
		],
	};

	methods = {
		listSearch: {
			searchLibraryTemplates,
			searchTemplates,
		},
		loadOptions: {
			getMediaFileNames,
			getMediaFiles,
			getMediaFolders,
			getTemplateTags,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const resource = this.getNodeParameter('resource', itemIndex) as string;
				const operation = this.getNodeParameter('operation', itemIndex) as string;

				let results: INodeExecutionData[];
				if (resource === 'movie') {
					results = await executeMovieOperation.call(this, operation, itemIndex);
				} else if (resource === 'template') {
					results = await executeTemplateOperation.call(this, operation, itemIndex);
				} else if (resource === 'media') {
					results = await executeMediaOperation.call(this, operation, itemIndex);
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`The resource "${resource}" is not supported`,
						{ itemIndex },
					);
				}

				returnData.push(...results);
			} catch (error) {
				if (this.continueOnFail()) {
					const json: IDataObject = { error: (error as Error).message };

					// Keep the project ID reachable: the render was already paid for.
					const project = getAttachedProjectId(error);
					if (project !== undefined) json.project = project;

					returnData.push({ json, pairedItem: { item: itemIndex } });
					continue;
				}

				throw toNodeError(this.getNode(), error, itemIndex);
			}
		}

		return [returnData];
	}
}
