import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

// Placeholder credential. Verified live against the JSON2Video API in Phase 3.
// Auth is a single API key sent as the `x-api-key` header — see
// `integrations/shared/operations.md` for the full design rationale.
export class Json2VideoApi implements ICredentialType {
	name = 'json2VideoApi';

	displayName = 'JSON2Video API';

	icon = { light: 'file:../nodes/Json2Video/json2video.svg', dark: 'file:../nodes/Json2Video/json2video.dark.svg' } as const;

	documentationUrl = 'https://json2video.com/docs/v2/';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description:
				'Your JSON2Video API key. Find it in the dashboard under Settings > API Keys (https://json2video.com/dashboard/apikeys).',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'x-api-key': '={{$credentials.apiKey}}',
			},
		},
	};

	// GET /v2/templates is cheap, read-only and requires no side effects —
	// any valid key with role `render` or above returns 200. Re-verified
	// live against the API in Phase 3.
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.json2video.com/v2',
			url: '/templates',
			method: 'GET',
		},
	};
}
