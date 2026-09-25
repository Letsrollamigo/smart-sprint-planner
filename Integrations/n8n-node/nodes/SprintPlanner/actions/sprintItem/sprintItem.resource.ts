import type { INodeProperties } from 'n8n-workflow';
import { operationField } from '../fields';
import * as createOrUpdate from './createOrUpdate.operation';
import * as remove from './remove.operation';
import * as assign from './assign.operation';

export const operations = { createOrUpdate, remove, assign };

export const description: INodeProperties[] = [
	operationField('sprintItem', Object.keys(operations)),
	...createOrUpdate.description,
	...remove.description,
	...assign.description,
];
