import type { INodeProperties } from 'n8n-workflow';
import { operationField } from '../fields';
import * as getMany from './getMany.operation';

export const operations = { getMany };

export const description: INodeProperties[] = [operationField('history', Object.keys(operations)), ...getMany.description];
