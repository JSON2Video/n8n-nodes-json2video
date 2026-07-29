import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import * as create from './create';
import * as deleteMovie from './deleteMovie';
import * as getAll from './getAll';
import * as getStatus from './getStatus';
import * as renderAndWait from './renderAndWait';

const operations = {
	create: create.execute,
	delete: deleteMovie.execute,
	getAll: getAll.execute,
	getStatus: getStatus.execute,
	renderAndWait: renderAndWait.execute,
} as const;

export type MovieOperation = keyof typeof operations;

/** Routes one input item to the Movie operation the user selected. */
export async function executeMovieOperation(
	this: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const handler = operations[operation as MovieOperation];

	if (handler === undefined) {
		throw new NodeOperationError(
			this.getNode(),
			`The operation "${operation}" is not supported for the Movie resource`,
			{ itemIndex },
		);
	}

	return await handler.call(this, itemIndex);
}
