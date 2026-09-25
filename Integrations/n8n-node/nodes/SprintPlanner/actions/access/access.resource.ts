import type { INodeProperties } from 'n8n-workflow';
import { operationField } from '../fields';
import * as getMyRoles from './getMyRoles.operation';

export const operations = { getMyRoles };

export const description: INodeProperties[] = [operationField('access', Object.keys(operations)), ...getMyRoles.description];
