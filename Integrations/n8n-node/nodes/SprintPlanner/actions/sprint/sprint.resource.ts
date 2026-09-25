import type { INodeProperties } from 'n8n-workflow';
import { operationField } from '../fields';
import * as get from './get.operation';
import * as uploadDraft from './uploadDraft.operation';
import * as update from './update.operation';

export const operations = { get, uploadDraft, update };

export const description: INodeProperties[] = [
	operationField('sprint', Object.keys(operations)),
	...get.description,
	...uploadDraft.description,
	...update.description,
];
