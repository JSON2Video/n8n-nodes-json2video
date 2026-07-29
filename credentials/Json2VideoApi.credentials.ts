import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

// Auth is a single API key sent as the `x-api-key` header — see
// `integrations/shared/operations.md` ("Global conventions" > Authentication)
// for the full design rationale.
export class Json2VideoApi implements ICredentialType {
	name = 'json2VideoApi';

	displayName = 'JSON2Video API';

	icon = { light: 'file:../nodes/Json2Video/json2video.svg', dark: 'file:../nodes/Json2Video/json2video.dark.svg' } as const;

	// Narrative page on the API key dashboard panel — more specific than the
	// docs root, and the one the "Get your API key" description below points to.
	documentationUrl = 'https://json2video.com/docs/v2/guides/dashboard/api-keys';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description:
				'Get your API key from the JSON2Video dashboard at https://json2video.com/dashboard/apikeys (Dashboard → API Keys). Start with a key using the Render role and only escalate if the workflow needs to manage templates or connections.',
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

	// GET /v2/templates is cheap, read-only and requires no side effects — any
	// valid key with role `render` or above returns 200.
	//
	// Known API quirk (see operations.md, Appendix B / global conventions
	// "HTTP status codes"): an invalid or missing API key returns HTTP 400,
	// not 401 — 401 is reserved for quota/plan-limit errors. Left to n8n's
	// default handling, a 400 here would surface as a raw "400 Bad Request",
	// which is meaningless to a user pasting in a key. The `rules` entry below
	// intercepts that specific status on this endpoint (whose only documented
	// 400 cause is an invalid/missing key — see operations.md Template > Get
	// Many errors table) and replaces it with an actionable message.
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.json2video.com/v2',
			url: '/templates',
			method: 'GET',
		},
		rules: [
			{
				type: 'responseCode',
				properties: {
					value: 400,
					message: 'Invalid API key. Check that you copied it correctly and that it has not been revoked or expired.',
				},
			},
		],
	};
}
