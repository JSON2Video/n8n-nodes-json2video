import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import * as create from './create';
import * as deleteTemplate from './deleteTemplate';
import * as duplicate from './duplicate';
import * as get from './get';
import * as getAll from './getAll';
import * as getLibrary from './getLibrary';
import * as getVariables from './getVariables';
import * as update from './update';

const operations = {
	create: create.execute,
	delete: deleteTemplate.execute,
	duplicate: duplicate.execute,
	get: get.execute,
	getAll: getAll.execute,
	getLibrary: getLibrary.execute,
	getVariables: getVariables.execute,
	update: update.execute,
} as const;

export type TemplateOperation = keyof typeof operations;

/** Routes one input item to the Template operation the user selected. */
export async function executeTemplateOperation(
	this: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const handler = operations[operation as TemplateOperation];

	if (handler === undefined) {
		throw new NodeOperationError(
			this.getNode(),
			`The operation "${operation}" is not supported for the Template resource`,
			{ itemIndex },
		);
	}

	return await handler.call(this, itemIndex);
}
