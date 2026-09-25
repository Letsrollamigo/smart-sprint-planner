import type { INodeProperties } from 'n8n-workflow';
import { operationField } from '../fields';
import * as get from './get.operation';

export const operations = { get };

export const description: INodeProperties[] = [operationField('calendar', Object.keys(operations)), ...get.description];
