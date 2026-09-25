import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { BRAND } from './branding';
import { T } from './i18n';
import { nodeProperties, route } from './actions/router';
import { listSearch } from './methods/listSearch';
import { loadOptions } from './methods/loadOptions';

export class SprintPlanner implements INodeType {
	description: INodeTypeDescription = {
		displayName: BRAND.displayName,
		name: 'sprintPlanner',
		icon: { light: 'file:sprintPlanner.svg', dark: 'file:sprintPlanner.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: T.node.subtitle,
		description: T.node.description,
		defaults: { name: BRAND.displayName },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: BRAND.credentialName, required: true }],
		properties: nodeProperties(),
	};

	methods = { listSearch, loadOptions };

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return route.call(this);
	}
}
