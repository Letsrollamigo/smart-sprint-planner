import type { INodeProperties } from 'n8n-workflow';
import { operationField } from '../fields';
import * as getMany from './getMany.operation';
import * as createOrUpdate from './createOrUpdate.operation';
import * as setStatus from './setStatus.operation';
import * as updateIssues from './updateIssues.operation';
import * as del from './delete.operation';

export const operations = { getMany, createOrUpdate, setStatus, updateIssues, delete: del };

export const description: INodeProperties[] = [
	operationField('release', Object.keys(operations)),
	...getMany.description,
	...createOrUpdate.description,
	...setStatus.description,
	...updateIssues.description,
	...del.description,
];
