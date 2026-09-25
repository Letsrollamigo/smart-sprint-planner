import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { T } from '../i18n';
import { failureJson, toNodeError, type ErrorScope } from '../transport/errors';
import { RunContext, type Obj } from './runContext';
import * as project from './project/project.resource';
import * as sprint from './sprint/sprint.resource';
import * as sprintItem from './sprintItem/sprintItem.resource';
import * as history from './history/history.resource';
import * as capacity from './capacity/capacity.resource';
import * as calendar from './calendar/calendar.resource';
import * as absence from './absence/absence.resource';
import * as release from './release/release.resource';
import * as reminder from './reminder/reminder.resource';
import * as access from './access/access.resource';
import * as issue from './issue/issue.resource';

export type Operation = {
	description: INodeProperties[];
	execute: (this: IExecuteFunctions, i: number, run: RunContext) => Promise<Obj[]>;
};
type Resource = { description: INodeProperties[]; operations: Record<string, Operation> };

export const RESOURCES: Record<keyof typeof T.resources, Resource> = {
	project,
	sprint,
	sprintItem,
	history,
	capacity,
	calendar,
	absence,
	release,
	reminder,
	access,
	issue,
};

/** Свойства формы: ресурс, затем операции и поля каждого ресурса. */
export function nodeProperties(): INodeProperties[] {
	const names = Object.keys(RESOURCES) as Array<keyof typeof T.resources>;
	return [
		{
			displayName: T.resource,
			name: 'resource',
			type: 'options',
			noDataExpression: true,
			options: names.map((r) => ({ name: T.resources[r], value: r })),
			default: 'project',
		},
		...names.flatMap((r) => RESOURCES[r].description),
	];
}

/** Элементы строго по очереди; ошибка элемента → NodeApiError/NodeOperationError либо элемент {ok:false} при Continue On Fail. */
export async function route(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
	const items = this.getInputData();
	const run = new RunContext(this);
	const out: INodeExecutionData[] = [];
	for (let i = 0; i < items.length; i++) {
		const resource = this.getNodeParameter('resource', i) as keyof typeof T.resources;
		const operation = this.getNodeParameter('operation', i) as string;
		const scope: ErrorScope = { itemIndex: i, opKey: `${resource}.${operation}`, projectKey: projectKeyIfAny(this, i) };
		try {
			const op = RESOURCES[resource]?.operations[operation];
			if (!op) throw new Error('unknown operation ' + scope.opKey);
			const res = await op.execute.call(this, i, run);
			for (const json of res) out.push({ json: json as IDataObject, pairedItem: { item: i } });
		} catch (err) {
			if (this.continueOnFail()) {
				out.push({ json: failureJson(err, scope), pairedItem: { item: i } });
				continue;
			}
			throw toNodeError(this.getNode(), err, scope);
		}
	}
	return [out];
}

function projectKeyIfAny(fn: IExecuteFunctions, i: number): string | undefined {
	try {
		const v = fn.getNodeParameter('project', i, '', { extractValue: true });
		return typeof v === 'string' && v.trim() ? v.trim() : undefined;
	} catch {
		return undefined;
	}
}
