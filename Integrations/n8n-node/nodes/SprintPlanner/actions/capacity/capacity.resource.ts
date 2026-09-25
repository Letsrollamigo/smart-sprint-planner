import type { INodeProperties } from 'n8n-workflow';
import { operationField } from '../fields';
import * as get from './get.operation';
import * as createOrUpdateMember from './createOrUpdateMember.operation';

export const operations = { get, createOrUpdateMember };

export const description: INodeProperties[] = [
	operationField('capacity', Object.keys(operations)),
	...get.description,
	...createOrUpdateMember.description,
];
