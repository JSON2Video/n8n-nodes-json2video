import type { INodeProperties } from 'n8n-workflow';

// UI definition of the Movie resource. Every description below is the AI-agent
// prompt for that parameter as well as the human hint, so units, formats and ID
// semantics are always spelled out.
// Contract: `integrations/shared/operations.md` → "Resource: Movie".

/** Operations that submit a render and therefore share the whole Create form. */
const RENDER_OPERATIONS = ['create', 'renderAndWait'];

const DEFAULT_MOVIE_JSON = JSON.stringify(
	{
		resolution: 'full-hd',
		scenes: [
			{
				elements: [{ type: 'text', text: 'Hello from n8n', duration: 5 }],
			},
		],
	},
	null,
	2,
);

export const movieOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['movie'],
			},
		},
		options: [
			{
				name: 'Create',
				value: 'create',
				description:
					'Submit a render job and return immediately with a project ID. The render runs asynchronously — pair this with a Webhook URL or a later Get Status call. Each call consumes credits, so never retry it blindly.',
				action: 'Create a movie',
			},
			{
				name: 'Delete',
				value: 'delete',
				description:
					'Delete the rendered video file of a movie before its automatic 7-day expiry. The render history entry is kept.',
				action: 'Delete a movie',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List the movies rendered by this account within a date range',
				action: 'Get many movies',
			},
			{
				name: 'Get Status',
				value: 'getStatus',
				description:
					'Get the current status of one movie, including the video URL once the render is done',
				action: 'Get a movie status',
			},
			{
				name: 'Render and Wait',
				value: 'renderAndWait',
				description:
					'Submit a render job and wait until it finishes, then return the finished movie including the video URL. Holds the n8n execution open for the whole render.',
				action: 'Render a movie and wait',
			},
		],
		default: 'renderAndWait',
	},
];

const inputModeFields: INodeProperties[] = [
	{
		displayName: 'Input Mode',
		name: 'inputMode',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['movie'],
				operation: RENDER_OPERATIONS,
			},
		},
		options: [
			{
				name: 'Movie JSON',
				value: 'json',
				description: 'Send a full Movie JSON document',
			},
			{
				name: 'Template',
				value: 'template',
				description: 'Render a saved template and fill in its variables',
			},
		],
		default: 'template',
		description: 'How to build the movie: from a saved template plus variables, or from raw Movie JSON',
	},
	{
		displayName: 'Template',
		name: 'templateId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions: {
			show: {
				resource: ['movie'],
				operation: RENDER_OPERATIONS,
				inputMode: ['template'],
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
			'The saved template to render. This is the 20-character template ID returned by Template: Create, not the template name.',
	},
	{
		displayName: 'Specify Variables',
		name: 'specifyVariables',
		type: 'options',
		displayOptions: {
			show: {
				resource: ['movie'],
				operation: RENDER_OPERATIONS,
				inputMode: ['template'],
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
			'How to provide the template variables. Values entered as fields are sent as text; use JSON for numbers, booleans, arrays or nested objects.',
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
				resource: ['movie'],
				operation: RENDER_OPERATIONS,
				inputMode: ['template'],
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
							'Name of the {{placeholder}} inside the template, without the braces. Letters, numbers and underscores only — any other character is silently replaced with an underscore.',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
						description: 'Value that replaces the placeholder, sent as text',
					},
				],
			},
		],
		description: 'Values for the {{placeholders}} inside the template',
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
				resource: ['movie'],
				operation: RENDER_OPERATIONS,
				inputMode: ['template'],
				specifyVariables: ['json'],
			},
		},
		description:
			'JSON object with the values for the {{placeholders}} inside the template, for example {"headline": "Summer sale", "price": 49.9}',
	},
	{
		displayName: 'Movie JSON',
		name: 'movieJson',
		type: 'json',
		typeOptions: {
			rows: 10,
		},
		required: true,
		default: DEFAULT_MOVIE_JSON,
		displayOptions: {
			show: {
				resource: ['movie'],
				operation: RENDER_OPERATIONS,
				inputMode: ['json'],
			},
		},
		description:
			'The full Movie JSON document to render. See the Movie JSON reference at https://json2video.com/docs/v2/. The node checks that it parses as JSON before sending it.',
	},
];

const movieOptionsCollection: INodeProperties = {
	displayName: 'Additional Options',
	name: 'additionalOptions',
	type: 'collection',
	placeholder: 'Add Option',
	default: {},
	displayOptions: {
		show: {
			resource: ['movie'],
			operation: RENDER_OPERATIONS,
		},
	},
	description:
		'Top-level movie properties. In Template mode they override the values saved in the template; in Movie JSON mode they override the values in the document.',
	options: [
		{
			displayName: 'Client Data',
			name: 'clientData',
			type: 'fixedCollection',
			typeOptions: {
				multipleValues: true,
			},
			placeholder: 'Add Entry',
			default: {},
			description:
				'Key-value pairs returned verbatim in Get Status responses and webhook payloads. Use it to carry your own record IDs through the render.',
			options: [
				{
					name: 'data',
					displayName: 'Entry',
					values: [
						{
							displayName: 'Name',
							name: 'name',
							type: 'string',
							default: '',
							description: 'Key returned verbatim with the movie',
						},
						{
							displayName: 'Value',
							name: 'value',
							type: 'string',
							default: '',
							description: 'Value returned verbatim with the movie',
						},
					],
				},
			],
		},
		{
			displayName: 'Comment',
			name: 'comment',
			type: 'string',
			default: '',
			description:
				'Free-form note attached to the movie. Ignored by the renderer; useful for tagging renders in your dashboard.',
		},
		{
			displayName: 'Exports (JSON)',
			name: 'exports',
			type: 'json',
			typeOptions: {
				rows: 4,
			},
			default: '',
			description:
				'Advanced. Full exports array for FTP, SFTP, email or webhook destinations, or Dashboard connection IDs. Overrides Webhook URL when both are set.',
		},
		{
			displayName: 'Frame Rate',
			name: 'fps',
			type: 'number',
			typeOptions: {
				minValue: 1,
				maxValue: 120,
			},
			default: 25,
			description: 'Frames per second of the output video',
		},
		{
			displayName: 'Height',
			name: 'height',
			type: 'number',
			typeOptions: {
				minValue: 50,
				maxValue: 3840,
			},
			default: 360,
			displayOptions: {
				show: {
					resolution: ['custom'],
				},
			},
			description:
				'Output height in pixels, from 50 to 3840. Only used when Resolution is Custom. Capped by your plan maximum resolution.',
		},
		{
			displayName: 'Movie ID',
			name: 'id',
			type: 'string',
			default: '',
			description:
				'Your own identifier for this movie, echoed back in webhook payloads. This is not the project ID — the API always generates its own.',
		},
		{
			displayName: 'Quality',
			name: 'quality',
			type: 'options',
			options: [
				{
					name: 'High',
					value: 'high',
				},
				{
					name: 'Low',
					value: 'low',
				},
				{
					name: 'Medium',
					value: 'medium',
				},
			],
			default: 'high',
			description: 'Render quality. Lower quality renders faster and costs the same.',
		},
		{
			displayName: 'Resolution',
			name: 'resolution',
			type: 'options',
			options: [
				{
					name: 'Custom',
					value: 'custom',
					description: 'Set Width and Height in pixels, up to 3840 for 4K output',
				},
				{
					name: 'Full HD (1920x1080)',
					value: 'full-hd',
				},
				{
					name: 'HD (1280x720)',
					value: 'hd',
				},
				{
					name: 'Instagram Feed (1080x1080)',
					value: 'instagram-feed',
				},
				{
					name: 'Instagram Story (1080x1920)',
					value: 'instagram-story',
				},
				{
					name: 'SD (640x360)',
					value: 'sd',
				},
				{
					name: 'Squared (1080x1080)',
					value: 'squared',
				},
				{
					name: 'Twitter Landscape (1600x900)',
					value: 'twitter-landscape',
				},
				{
					name: 'Twitter Portrait (1080x1350)',
					value: 'twitter-portrait',
				},
			],
			default: 'full-hd',
			description:
				'Output frame size preset. Choose Custom to set Width and Height in pixels. The API default is Custom at 640x360 pixels.',
		},
		{
			displayName: 'Use Cache',
			name: 'cache',
			type: 'boolean',
			default: true,
			description:
				'Whether to serve an identical movie that was rendered before from cache instead of rendering it again. Disable to force a fresh render.',
		},
		{
			displayName: 'Webhook URL',
			name: 'webhookUrl',
			type: 'string',
			default: '',
			placeholder: 'https://n8n.example.com/webhook/json2video',
			description:
				'URL called with a POST once the render finishes, successfully or not. Must be publicly reachable over HTTPS. Leave empty if you poll instead.',
		},
		{
			displayName: 'Width',
			name: 'width',
			type: 'number',
			typeOptions: {
				minValue: 50,
				maxValue: 3840,
			},
			default: 640,
			displayOptions: {
				show: {
					resolution: ['custom'],
				},
			},
			description:
				'Output width in pixels, from 50 to 3840. Only used when Resolution is Custom. Capped by your plan maximum resolution.',
		},
	],
};

const waitOptionsCollection: INodeProperties = {
	displayName: 'Wait Options',
	name: 'waitOptions',
	type: 'collection',
	placeholder: 'Add Option',
	default: {},
	displayOptions: {
		show: {
			resource: ['movie'],
			operation: ['renderAndWait'],
		},
	},
	options: [
		{
			displayName: 'Fail On Render Error',
			name: 'failOnRenderError',
			type: 'boolean',
			default: true,
			description:
				'Whether a failed render throws an error. Disable to return the failed movie object instead and branch on its status yourself.',
		},
		{
			displayName: 'Poll Interval',
			name: 'pollInterval',
			type: 'number',
			typeOptions: {
				minValue: 5,
				maxValue: 300,
			},
			default: 5,
			description:
				'Seconds between status checks. The API asks clients not to poll faster than every 5 seconds, so lower values are raised to 5. The interval backs off gradually up to 30 seconds on long renders.',
		},
		{
			displayName: 'Timeout',
			name: 'timeout',
			type: 'number',
			typeOptions: {
				minValue: 30,
				maxValue: 3600,
			},
			default: 600,
			hint: 'Renders that outlive your n8n execution limit are better handled with Create plus a Webhook URL and a Webhook Trigger workflow',
			description:
				'Maximum number of seconds to wait for the render. When exceeded the node fails but the render keeps going — the project ID is included in the error so you can pick it up later with Get Status.',
		},
	],
};

const getStatusFields: INodeProperties[] = [
	{
		displayName: 'Project ID',
		name: 'projectId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. JkGxEoPRF9EgRb32',
		displayOptions: {
			show: {
				resource: ['movie'],
				operation: ['getStatus'],
			},
		},
		description: 'The 16-character project ID returned by Movie: Create',
	},
	{
		displayName: 'Simplify',
		name: 'simple',
		type: 'boolean',
		default: true,
		displayOptions: {
			show: {
				resource: ['movie'],
				operation: ['getStatus'],
			},
		},
		hint: 'Simplified output is the movie object itself plus the remaining quota',
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
				resource: ['movie'],
				operation: ['getStatus'],
			},
		},
		options: [
			{
				displayName: 'Include Movie JSON',
				name: 'includeMovieJson',
				type: 'boolean',
				default: false,
				description:
					'Whether to include the original Movie JSON that was submitted, as a string. Off by default because it can be very large.',
			},
		],
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
				resource: ['movie'],
				operation: ['getAll'],
			},
		},
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
				resource: ['movie'],
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
				resource: ['movie'],
				operation: ['getAll'],
			},
		},
		options: [
			{
				displayName: 'End Date',
				name: 'dateEnd',
				type: 'dateTime',
				default: '',
				description:
					'End of the date range. Defaults to the end of the current day. The range may not exceed 3 months.',
			},
			{
				displayName: 'Include Movie JSON',
				name: 'includeMovieJson',
				type: 'boolean',
				default: false,
				description:
					'Whether to include the original Movie JSON of each movie. Off by default because it makes responses very large.',
			},
			{
				displayName: 'Start Date',
				name: 'dateStart',
				type: 'dateTime',
				default: '',
				description: 'Start of the date range. Defaults to the first day of the current month.',
			},
		],
	},
];

const deleteFields: INodeProperties[] = [
	{
		displayName: 'Project ID',
		name: 'projectId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. JkGxEoPRF9EgRb32',
		displayOptions: {
			show: {
				resource: ['movie'],
				operation: ['delete'],
			},
		},
		description:
			'The 16-character project ID of the movie whose video file should be deleted. The render history entry is kept; only the video file is removed.',
	},
];

export const movieFields: INodeProperties[] = [
	...inputModeFields,
	movieOptionsCollection,
	waitOptionsCollection,
	...getStatusFields,
	...getAllFields,
	...deleteFields,
];
