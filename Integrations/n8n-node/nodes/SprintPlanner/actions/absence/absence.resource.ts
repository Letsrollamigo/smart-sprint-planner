import type { INodeProperties } from 'n8n-workflow';
import { operationField } from '../fields';
import * as getMany from './getMany.operation';
import * as createOrUpdate from './createOrUpdate.operation';
import * as del from './delete.operation';

export const operations = { getMany, createOrUpdate, delete: del };

export const description: INodeProperties[] = [
	operationField('absence', Object.keys(operations)),
	...getMany.description,
	...createOrUpdate.description,
	...del.description,
];
