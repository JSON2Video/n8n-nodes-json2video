import type { INodeProperties } from 'n8n-workflow';

// UI definition of the Media resource — the account's Drive. Every description
// below is the AI-agent prompt for that parameter as well as the human hint, so
// units, formats and path semantics are always spelled out.
// Contract: `integrations/shared/operations.md` → "Resource: Media" + Appendix C.
//
// Folder and file pickers are dynamic `options` parameters rather than free
// text: `loadOptionsDependsOn` (the file list follows the selected folder) only
// exists for `loadOptions`. Every one of them still accepts an n8n expression,
// which is the escape hatch for folders that do not exist yet and for
// expression-driven workflows.

export const mediaOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['media'],
			},
		},
		options: [
			{
				name: 'Create Folder',
				value: 'createFolder',
				description: 'Create a folder in the Drive. Creating a folder that already exists succeeds and changes nothing.',
				action: 'Create a folder',
			},
			{
				name: 'Delete File',
				value: 'deleteFile',
				description: 'Delete one file from the Drive. This frees the storage it used and cannot be undone.',
				action: 'Delete a file',
			},
			{
				name: 'Delete Folder',
				value: 'deleteFolder',
				description: 'Delete an empty folder. Folders that still contain files are refused by the API.',
				action: 'Delete a folder',
			},
			{
				name: 'Get File',
				value: 'getFile',
				description: 'Get one file by its path, including its public URL, size in bytes and upload status',
				action: 'Get a file',
			},
			{
				name: 'Get Folder Tree',
				value: 'getFolderTree',
				description: 'List every folder in the Drive with its file count and total size in bytes',
				action: 'Get the folder tree',
			},
			{
				name: 'Get Storage Usage',
				value: 'getStorage',
				description: 'Get how many bytes the Drive uses, the free allowance and whether uploads are blocked',
				action: 'Get storage usage',
			},
			{
				name: 'List Folder',
				value: 'listFolder',
				description: 'List the files in one folder, optionally filtered by media type or by name',
				action: 'List a folder',
			},
			{
				name: 'Move File',
				value: 'moveFile',
				description: 'Move a file to another folder, keeping its name. Moving into temp marks it temporary.',
				action: 'Move a file',
			},
			{
				name: 'Upload File',
				value: 'upload',
				description: 'Upload binary data from a previous node into the Drive and return its public URL',
				action: 'Upload a file',
			},
		],
		default: 'upload',
	},
];

const uploadFields: INodeProperties[] = [
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		displayOptions: {
			show: {
				resource: ['media'],
				operation: ['upload'],
			},
		},
		hint: 'The file is uploaded straight from memory — the node never writes it to disk',
		description:
			'Name of the binary property on the incoming item that holds the file to upload. Maximum 500 MB per file.',
	},
	{
		displayName: 'Additional Options',
		name: 'additionalOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				resource: ['media'],
				operation: ['upload'],
			},
		},
		options: [
			{
				displayName: 'File Name',
				name: 'fileName',
				type: 'string',
				default: '',
				placeholder: 'e.g. clip.mp4',
				hint: 'Required when the incoming binary data carries no file name',
				description:
					'Override the file name. Characters outside a-z, A-Z, 0-9, dot, underscore and hyphen are replaced with an underscore.',
			},
			{
				displayName: 'Folder Name or ID',
				name: 'folder',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getMediaFolders',
				},
				default: '',
				hint: 'Leave empty for the root folder. Use temp for files that are deleted automatically and do not count towards the storage quota.',
				description:
					'Destination folder in your JSON2Video Drive. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'MIME Type',
				name: 'contentType',
				type: 'string',
				default: '',
				placeholder: 'e.g. video/mp4',
				description:
					'Override the MIME type. It decides whether the file is treated as image, video, audio or other. Defaults to the MIME type of the incoming binary data.',
			},
		],
	},
];

const getFileFields: INodeProperties[] = [
	{
		displayName: 'Folder Name or ID',
		name: 'folder',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getMediaFolders',
		},
		default: '',
		displayOptions: {
			show: {
				resource: ['media'],
				operation: ['getFile'],
			},
		},
		hint: 'Only used to fill the File list below — the file path is what gets sent',
		description:
			'Folder to browse, empty for the root folder. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'File Name or ID',
		name: 'path',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getMediaFiles',
			loadOptionsDependsOn: ['folder'],
		},
		required: true,
		default: '',
		displayOptions: {
			show: {
				resource: ['media'],
				operation: ['getFile'],
			},
		},
		hint: 'The value sent is the path relative to the Drive root, for example videos/clip.mp4',
		description:
			'File to fetch. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		displayOptions: {
			show: {
				resource: ['media'],
				operation: ['getFile'],
			},
		},
		hint: 'Simplified output is the file object itself, without the API envelope',
		description: 'Whether to return a simplified version of the response instead of the raw data',
	},
];

const listFolderFields: INodeProperties[] = [
	{
		displayName: 'Folder Name or ID',
		name: 'path',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getMediaFolders',
		},
		default: '',
		displayOptions: {
			show: {
				resource: ['media'],
				operation: ['listFolder'],
			},
		},
		hint: 'Leave empty for the root folder. Sub-folder names come back on the first output item.',
		description:
			'Folder to list. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: {
				resource: ['media'],
				operation: ['listFolder'],
			},
		},
		hint: 'Pages through the folder 100 files at a time until every file has been fetched',
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
				resource: ['media'],
				operation: ['listFolder'],
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
				resource: ['media'],
				operation: ['listFolder'],
			},
		},
		options: [
			{
				displayName: 'File Type',
				name: 'type',
				type: 'options',
				options: [
					{
						name: 'All Types',
						value: '',
					},
					{
						name: 'Audio',
						value: 'audio',
					},
					{
						name: 'Image',
						value: 'image',
					},
					{
						name: 'Other',
						value: 'other',
					},
					{
						name: 'Video',
						value: 'video',
					},
				],
				default: '',
				description: 'Only return files of this media type, derived from the file MIME type',
			},
			{
				displayName: 'Search',
				name: 'q',
				type: 'string',
				default: '',
				placeholder: 'e.g. intro',
				description: 'Only return files whose name contains this text, case-insensitive',
			},
		],
	},
];

const moveFileFields: INodeProperties[] = [
	{
		displayName: 'Source Folder Name or ID',
		name: 'folder',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getMediaFolders',
		},
		default: '',
		displayOptions: {
			show: {
				resource: ['media'],
				operation: ['moveFile'],
			},
		},
		hint: 'Leave empty for the root folder',
		description:
			'Folder the file is currently in. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'File Name or ID',
		name: 'name',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getMediaFileNames',
			loadOptionsDependsOn: ['folder'],
		},
		required: true,
		default: '',
		displayOptions: {
			show: {
				resource: ['media'],
				operation: ['moveFile'],
			},
		},
		hint: 'The file name only, without the folder path — the move keeps the name unchanged',
		description:
			'File to move. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Destination Folder Name or ID',
		name: 'destination',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getMediaFolders',
		},
		default: '',
		displayOptions: {
			show: {
				resource: ['media'],
				operation: ['moveFile'],
			},
		},
		hint: 'Leave empty for the root folder. Moving into temp marks the file temporary; moving out of temp makes it count towards the storage quota again.',
		description:
			'Folder to move the file into. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
];

const deleteFileFields: INodeProperties[] = [
	{
		displayName: 'Folder Name or ID',
		name: 'folder',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getMediaFolders',
		},
		default: '',
		displayOptions: {
			show: {
				resource: ['media'],
				operation: ['deleteFile'],
			},
		},
		hint: 'Leave empty for the root folder',
		description:
			'Folder containing the file. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'File Name or ID',
		name: 'name',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getMediaFileNames',
			loadOptionsDependsOn: ['folder'],
		},
		required: true,
		default: '',
		displayOptions: {
			show: {
				resource: ['media'],
				operation: ['deleteFile'],
			},
		},
		hint: 'The file name only, without the folder path',
		description:
			'File to delete. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
];

const createFolderFields: INodeProperties[] = [
	{
		displayName: 'Folder Path',
		name: 'folder',
		type: 'string',
		required: true,
		default: '',
		displayOptions: {
			show: {
				resource: ['media'],
				operation: ['createFolder'],
			},
		},
		placeholder: 'e.g. marketing/2026',
		hint: 'Nested paths are created in one call. Characters outside letters, numbers, slash, underscore and hyphen are removed.',
		description: 'Folder to create, relative to the Drive root',
	},
];

const deleteFolderFields: INodeProperties[] = [
	{
		displayName: 'Folder Name or ID',
		name: 'folder',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getMediaFolders',
		},
		required: true,
		default: '',
		displayOptions: {
			show: {
				resource: ['media'],
				operation: ['deleteFolder'],
			},
		},
		hint: 'The folder must be empty. The root folder and the temp folder cannot be deleted.',
		description:
			'Folder to delete. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
];

const getStorageFields: INodeProperties[] = [
	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		displayOptions: {
			show: {
				resource: ['media'],
				operation: ['getStorage'],
			},
		},
		hint: 'Simplified output is the storage object itself, without the API envelope',
		description: 'Whether to return a simplified version of the response instead of the raw data',
	},
];

export const mediaFields: INodeProperties[] = [
	...uploadFields,
	...getFileFields,
	...listFolderFields,
	...moveFileFields,
	...deleteFileFields,
	...createFolderFields,
	...deleteFolderFields,
	...getStorageFields,
];
