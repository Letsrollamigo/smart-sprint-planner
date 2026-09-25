import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

// PER-FORK: file and class name, name, labels and the default appId.
export class SmartSprintPlannerApi implements ICredentialType {
	name = 'smartSprintPlannerApi';

	displayName = 'Smart Sprint Planner API';

	icon: Icon = { light: 'file:sprintPlanner.svg', dark: 'file:sprintPlanner.dark.svg' };

	documentationUrl = 'https://github.com/Letsrollamigo/smart-sprint-planner/tree/main/Integrations/n8n-node#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'YouTrack URL',
			name: 'url',
			type: 'string',
			required: true,
			default: '',
			placeholder: 'https://youtrack.example.com',
			description: 'Without the /api suffix, e.g. https://youtrack.example.com',
		},
		{
			displayName: 'Permanent Token',
			name: 'token',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				"Created in the YouTrack user profile. The node gets exactly this user's permissions.",
		},
		{
			displayName: 'Application ID',
			name: 'appId',
			type: 'string',
			default: 'smart-sprint-planner',
			description: 'Change only if the planner is installed under a different ID',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: { headers: { Authorization: '=Bearer {{$credentials.token}}' } },
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.url}}',
			url: '=/api/extensionEndpoints/{{$credentials.appId}}/backend-global/app-version',
		},
	};
}
