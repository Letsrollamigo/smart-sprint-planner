import type { INodeProperties } from 'n8n-workflow';
import { BRAND } from '../../branding';
import { operationField } from '../fields';
import type { Operation } from '../router';
import * as search from './search.operation';
import * as setField from './setField.operation';
import * as setFieldViaPlanner from './setFieldViaPlanner.operation';

/** «Найти» и «Записать поле (штатно)» выключаются флагами сборки (branding.ts); через планер — всегда. */
export const operations: Record<string, Operation> = {
	...(BRAND.features.issueSearch ? { search } : {}),
	...(BRAND.features.issueSetField ? { setField } : {}),
	setFieldViaPlanner,
};

export const description: INodeProperties[] = [
	operationField('issue', Object.keys(operations)),
	...Object.values(operations).flatMap((op) => op.description),
];
