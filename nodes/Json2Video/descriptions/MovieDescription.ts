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
					'Submit a render job and return immediately with a 16-character project ID. The render runs asynchronously and the video URL is not available yet — pair this with a Webhook URL or a later Get Status call. Each call consumes credits (1 credit per second of output video), so never retry it blindly.',
				action: 'Create a movie',
			},
			{
				name: 'Delete',
				value: 'delete',
				description:
					'Delete the rendered video file of a movie before its automatic 7-day expiry. The render history entry is kept, so credits already spent are not refunded.',
				action: 'Delete a movie',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description:
					'List the movies rendered by this account within a date range, one output item per movie',
				action: 'Get many movies',
			},
			{
				name: 'Get Status',
				value: 'getStatus',
				description:
					'Get the current status of one movie by project ID. Returns the video URL, duration in seconds and file size in bytes once the status is done.',
				action: 'Get a movie status',
			},
			{
				name: 'Render and Wait',
				value: 'renderAndWait',
				description:
					'Submit a render job and poll until it finishes, then return the finished movie including the video URL, duration in seconds and file size in bytes. Holds the n8n execution open for the whole render, so use Create plus a Webhook URL for renders longer than the n8n execution limit.',
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
				description: 'Send a full Movie JSON document describing every scene and element',
			},
			{
				name: 'Template',
				value: 'template',
				description: 'Render a template saved in the account and fill in its variables',
			},
		],
		default: 'template',
		description:
			'How to build the movie: from a saved template plus variables, or from a raw Movie JSON document',
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
			'The saved template to render. The value sent is the 20-character template ID returned by Template: Create, not the template name.',
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
		// The `keypair` value predates the resourceMapper — 0.3.0 rendered
		// name/value pairs here. It is kept as-is so a workflow saved with 0.3.0
		// still lands on the fields UI after upgrading instead of losing it.
		default: 'keypair',
		description:
			'How to provide the template variables: one labelled input per variable the template declares, or one raw JSON object. Use JSON for values built by an expression, or to fill variables the template does not declare.',
	},
	{
		displayName: 'Variables',
		name: 'variables',
		// One labelled input per template variable, typed from the template's own
		// declaration — the primitive n8n built for dynamic schemas (Google Sheets
		// columns, Postgres columns). `getTemplateVariableFields` is registered
		// under `methods.resourceMapping` on the node.
		type: 'resourceMapper',
		noDataExpression: true,
		default: {
			mappingMode: 'defineBelow',
			value: null,
		},
		displayOptions: {
			show: {
				resource: ['movie'],
				operation: RENDER_OPERATIONS,
				inputMode: ['template'],
				specifyVariables: ['keypair'],
			},
		},
		typeOptions: {
			// A resourceMapper refetches its field list from `loadOptionsDependsOn`,
			// the same key a plain `options` dropdown uses — n8n's ResourceMapper
			// watches the joined values and reloads when they change. A resource
			// locator's dependency is its inner `.value`, not the locator object,
			// or switching template would not reload the fields.
			loadOptionsDependsOn: ['templateId.value'],
			resourceMapper: {
				resourceMapperMethod: 'getTemplateVariableFields',
				// `add`: the node always sends the whole `variables` object and never
				// matches an existing record, so there are no matching columns.
				mode: 'add',
				fieldWords: {
					singular: 'variable',
					plural: 'variables',
				},
				addAllFields: true,
				multiKeyMatch: false,
				// Offers "Map Automatically", which fills every variable from the
				// incoming item's field of the same name.
				supportAutoMap: true,
				// The method explains an empty list itself (no template selected, no
				// variables declared, load failed) through `emptyFieldsNotice`.
				hideNoDataError: true,
			},
		},
		description:
			'Values for the {{placeholders}} inside the template, one input per variable the template declares. Each input is typed and pre-filled from the template: text, number, dropdown, toggle, or a JSON editor for the array and object variables.',
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
			'The full Movie JSON document to render: a JSON object with a scenes array, each scene holding an elements array. See the Movie JSON reference at https://json2video.com/docs/v2/. The node checks that it parses as a JSON object before sending it.',
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
			description: 'Frames per second of the output video, from 1 to 120. The API default is 25.',
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
			description:
				'Encoding quality of the output video. Lower quality renders faster and produces a smaller file; the credit cost is identical.',
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
			placeholder: 'e.g. https://n8n.example.com/webhook/json2video',
			description:
				'URL called with an HTTP POST once the render finishes, successfully or not. Must be publicly reachable over HTTPS — an n8n Webhook node production URL works. Leave empty if you poll for the status instead.',
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

const renderAndWaitOutputFields: INodeProperties[] = [
	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		displayOptions: {
			show: {
				resource: ['movie'],
				operation: ['renderAndWait'],
			},
		},
		hint: 'Simplified output is the movie object itself plus the remaining quota',
		description: 'Whether to return a simplified version of the response instead of the raw data',
	},
];

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
	description: 'How long to wait for the render, how often to check, and what to do if it fails',
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
		description:
			'The 16-character project ID returned by Movie: Create or Movie: Render and Wait',
	},
	{
		displayName: 'Simplify',
		name: 'simplify',
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
			description: 'Optional controls over how much of the movie record is returned',
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
			description: 'Optional filters and output controls for the movie listing',
		options: [
			{
				displayName: 'End Date',
				name: 'dateEnd',
				type: 'dateTime',
				default: '',
				description:
					'End of the date range, as an ISO-8601 date or date-time. Defaults to the end of the current day. The range may not exceed 3 months.',
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
				description:
					'Start of the date range, as an ISO-8601 date or date-time. Defaults to the first day of the current month.',
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
	...renderAndWaitOutputFields,
	waitOptionsCollection,
	...getStatusFields,
	...getAllFields,
	...deleteFields,
];
