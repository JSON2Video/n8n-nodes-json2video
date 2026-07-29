import type { INodeProperties } from 'n8n-workflow';

// UI definition of the Template resource. Every description below is the
// AI-agent prompt for that parameter as well as the human hint, so units,
// formats and ID semantics are always spelled out.
// Contract: `integrations/shared/operations.md` → "Resource: Template".

const DEFAULT_TEMPLATE_MOVIE_JSON = JSON.stringify(
	{
		resolution: 'full-hd',
		variables: { headline: 'Sample' },
		scenes: [
			{
				elements: [{ type: 'text', text: '{{headline}}' }],
			},
		],
	},
	null,
	2,
);

export const templateOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['template'],
			},
		},
		options: [
			{
				name: 'Create',
				value: 'create',
				description:
					'Save a new template from a Movie JSON document with {{variable}} placeholders. Returns the new 20-character template ID.',
				action: 'Create a template',
			},
			{
				name: 'Delete',
				value: 'delete',
				description:
					'Delete a template by ID. Renders already in flight are unaffected, but later renders referencing the ID fail.',
				action: 'Delete a template',
			},
			{
				name: 'Duplicate',
				value: 'duplicate',
				description:
					'Copy a template — your own or one from the public library — into this account and return the new 20-character template ID, optionally filling in variables',
				action: 'Duplicate a template',
			},
			{
				name: 'Get',
				value: 'get',
				description:
					'Get one template by ID, including its stored Movie JSON. The movie field is returned exactly as stored, which may be a JSON string or a JSON object.',
				action: 'Get a template',
			},
			{
				name: 'Get Library',
				value: 'getLibrary',
				description:
					'List the curated public template gallery published by JSON2Video, one output item per template. Use Duplicate to copy one into this account before rendering it.',
				action: 'Get many library templates',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description:
					"List this account's own templates, one output item per template, with their IDs, names and tags",
				action: 'Get many templates',
			},
			{
				name: 'Update',
				value: 'update',
				description:
					'Change the name, Movie JSON, tags or AI prompt of an existing template. Only the fields set are written; the rest are left unchanged.',
				action: 'Update a template',
			},
		],
		default: 'getAll',
	},
];

const getAllFields: INodeProperties[] = [
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: {
				resource: ['template'],
				operation: ['getAll'],
			},
		},
		hint: 'This endpoint has no server-side pagination — every template is fetched, then Limit is applied locally',
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: {
			minValue: 1,
		},
		default: 50,
		displayOptions: {
			show: {
				resource: ['template'],
				operation: ['getAll'],
				returnAll: [false],
			},
		},
		description: 'Max number of results to return',
	},
	{
		displayName: 'Additional Options',
		name: 'additionalOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				resource: ['template'],
				operation: ['getAll'],
			},
		},
			description: 'Optional filters for the template listing',
		options: [
			{
				displayName: 'Tag Name or ID',
				name: 'tag',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getTemplateTags',
				},
				default: '',
				description: 'Only return templates carrying this tag. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
		],
	},
];

const getFields: INodeProperties[] = [
	{
		displayName: 'Template',
		name: 'templateId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions: {
			show: {
				resource: ['template'],
				operation: ['get'],
			},
		},
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'searchTemplates',
					searchable: true,
				},
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. LerKrmBfiqaIgBuacLWn',
			},
		],
		description:
			'The template to fetch. The ID is the 20-character string returned when the template was created, not its name.',
	},
	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		displayOptions: {
			show: {
				resource: ['template'],
				operation: ['get'],
			},
		},
		hint: 'Simplified output is the template object itself, without the API envelope',
		description: 'Whether to return a simplified version of the response instead of the raw data',
	},
	{
		displayName: 'Additional Options',
		name: 'additionalOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				resource: ['template'],
				operation: ['get'],
			},
		},
			description: 'Optional controls over which parts of the template are returned',
		options: [
			{
				displayName: 'Scopes',
				name: 'scopes',
				type: 'string',
				default: 'movie',
				description:
					'Comma-separated list of the template parts to load. Supported values are movie (the stored Movie JSON) and prompt (the AI prompt), for example "movie,prompt".',
			},
			{
				displayName: 'Variables Format',
				name: 'format',
				type: 'options',
				options: [
					{
						name: 'Movie JSON (Default)',
						value: '',
						description: "Return the template's stored Movie JSON",
					},
					{
						name: 'JSON Schema',
						value: 'jsonschema',
						description:
							"Return the template's variables as a JSON Schema instead of the movie payload — useful for generating input forms",
					},
				],
				default: '',
				description:
					'Shape of the returned template: the stored Movie JSON, or a JSON Schema describing its variables',
			},
		],
	},
];

const createFields: INodeProperties[] = [
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		displayOptions: {
			show: {
				resource: ['template'],
				operation: ['create'],
			},
		},
		description:
			'Human-readable label shown in the dashboard, up to 100 characters. This is not the template ID — the API generates a 20-character ID on creation.',
	},
	{
		displayName: 'Movie JSON',
		name: 'movieJson',
		type: 'json',
		typeOptions: {
			rows: 10,
		},
		required: true,
		default: DEFAULT_TEMPLATE_MOVIE_JSON,
		displayOptions: {
			show: {
				resource: ['template'],
				operation: ['create'],
			},
		},
		description:
			'The Movie JSON stored in the template, up to about 100 KB. Use {{variable}} placeholders where values should be filled in at render time.',
	},
	{
		displayName: 'Additional Options',
		name: 'additionalOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				resource: ['template'],
				operation: ['create'],
			},
		},
			description: 'Optional metadata stored alongside the template',
		options: [
			{
				displayName: 'AI Prompt',
				name: 'prompt',
				type: 'string',
				default: '',
				description:
					"Prompt describing what this template produces, used by JSON2Video's AI features",
			},
			{
				displayName: 'Tags',
				name: 'tags',
				type: 'string',
				default: '',
				description:
					'Comma-separated list of tags used to organize and filter templates, for example "promo,vertical"',
			},
		],
	},
];

const updateFields: INodeProperties[] = [
	{
		displayName: 'Template',
		name: 'templateId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions: {
			show: {
				resource: ['template'],
				operation: ['update'],
			},
		},
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'searchTemplates',
					searchable: true,
				},
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. LerKrmBfiqaIgBuacLWn',
			},
		],
		description:
			'The template to update. The value sent is the 20-character template ID, not the template name.',
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		required: true,
		displayOptions: {
			show: {
				resource: ['template'],
				operation: ['update'],
			},
		},
		hint: 'Only the fields set here are written; fields left empty are not modified',
		description: 'Fields to change on the template',
		options: [
			{
				displayName: 'AI Prompt',
				name: 'prompt',
				type: 'string',
				default: '',
				description: 'Replacement AI prompt describing what this template produces',
			},
			{
				displayName: 'Movie JSON',
				name: 'movieJson',
				type: 'json',
				typeOptions: {
					rows: 10,
				},
				default: '',
				description: 'Replacement Movie JSON. This replaces the stored body entirely — it is not merged.',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'New human-readable label, up to 100 characters',
			},
			{
				displayName: 'Tags',
				name: 'tags',
				type: 'string',
				default: '',
				description:
					'Comma-separated list of tags. Replaces the existing tags rather than adding to them.',
			},
		],
	},
];

const duplicateVariablesFields: INodeProperties[] = [
	{
		displayName: 'Specify Variables',
		name: 'specifyVariables',
		type: 'options',
		displayOptions: {
			show: {
				resource: ['template'],
				operation: ['duplicate'],
			},
		},
		options: [
			{
				name: 'Using Fields Below',
				value: 'keypair',
			},
			{
				name: 'Using JSON',
				value: 'json',
			},
		],
		default: 'keypair',
		description:
			'How to provide the variables that are deep-merged into the copy. Values entered as fields are sent as text; use JSON for numbers, booleans, arrays or nested objects.',
	},
	{
		displayName: 'Variables',
		name: 'variablesUi',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
		},
		placeholder: 'Add Variable',
		default: {},
		displayOptions: {
			show: {
				resource: ['template'],
				operation: ['duplicate'],
				specifyVariables: ['keypair'],
			},
		},
		options: [
			{
				name: 'variable',
				displayName: 'Variable',
				values: [
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						default: '',
						description:
							'Name of the variable inside the copied template, without the {{ }} braces',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
						description: 'Value that replaces the variable. Always sent as text.',
					},
				],
			},
		],
		description: 'Values deep-merged into the copy of the template',
	},
	{
		displayName: 'Variables (JSON)',
		name: 'variablesJson',
		type: 'json',
		typeOptions: {
			rows: 4,
		},
		default: '{}',
		displayOptions: {
			show: {
				resource: ['template'],
				operation: ['duplicate'],
				specifyVariables: ['json'],
			},
		},
		description:
			'JSON object with the values deep-merged into the variables of the copied template, for example {"headline": "Hello"}',
	},
];

const duplicateFields: INodeProperties[] = [
	{
		displayName: 'Source Template ID',
		name: 'templateId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions: {
			show: {
				resource: ['template'],
				operation: ['duplicate'],
			},
		},
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'searchTemplates',
					searchable: true,
				},
			},
			{
				displayName: 'From Library',
				name: 'library',
				type: 'list',
				typeOptions: {
					searchListMethod: 'searchLibraryTemplates',
					searchable: true,
				},
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. LerKrmBfiqaIgBuacLWn',
			},
		],
		description:
			'The template to copy into your account. Pick one of your own templates or one from the public library.',
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: ['template'],
				operation: ['duplicate'],
			},
		},
		placeholder: 'e.g. My copy of Product showcase',
		description: "Name for the copy. Defaults to the source name with ' (custom)' appended.",
	},
	...duplicateVariablesFields,
];

const deleteFields: INodeProperties[] = [
	{
		displayName: 'Template',
		name: 'templateId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions: {
			show: {
				resource: ['template'],
				operation: ['delete'],
			},
		},
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'searchTemplates',
					searchable: true,
				},
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. LerKrmBfiqaIgBuacLWn',
			},
		],
		description:
			'The template to delete, addressed by its 20-character template ID. This cannot be undone.',
	},
];

const getLibraryFields: INodeProperties[] = [
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: {
				resource: ['template'],
				operation: ['getLibrary'],
			},
		},
		hint: 'This endpoint has no server-side pagination — every library template is fetched, then Limit is applied locally',
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: {
			minValue: 1,
		},
		default: 50,
		displayOptions: {
			show: {
				resource: ['template'],
				operation: ['getLibrary'],
				returnAll: [false],
			},
		},
		description: 'Max number of results to return',
	},
	{
		displayName: 'Additional Options',
		name: 'additionalOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				resource: ['template'],
				operation: ['getLibrary'],
			},
		},
			description: 'Optional filters for the library listing',
		options: [
			{
				displayName: 'Tags',
				name: 'tags',
				type: 'string',
				default: '',
				description:
					'Comma-separated list of tags. The response always includes every published template, plus any template carrying one of these tags.',
			},
		],
	},
];

export const templateFields: INodeProperties[] = [
	...getAllFields,
	...getFields,
	...createFields,
	...updateFields,
	...duplicateFields,
	...deleteFields,
	...getLibraryFields,
];
