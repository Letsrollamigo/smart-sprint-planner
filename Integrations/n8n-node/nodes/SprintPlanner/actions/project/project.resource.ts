import type { INodeProperties } from 'n8n-workflow';
import { operationField } from '../fields';
import * as getOverview from './getOverview.operation';
import * as getMany from './getMany.operation';
import * as getPlannerStatus from './getPlannerStatus.operation';

export const operations = { getOverview, getMany, getPlannerStatus };

export const description: INodeProperties[] = [
	operationField('project', Object.keys(operations)),
	...getOverview.description,
	...getMany.description,
	...getPlannerStatus.description,
];
