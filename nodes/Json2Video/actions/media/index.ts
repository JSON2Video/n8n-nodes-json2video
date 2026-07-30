import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import * as createFolder from './createFolder';
import * as deleteFile from './deleteFile';
import * as deleteFolder from './deleteFolder';
import * as getFile from './getFile';
import * as getFolderTree from './getFolderTree';
import * as getStorage from './getStorage';
import * as listFolder from './listFolder';
import * as moveFile from './moveFile';
import * as upload from './upload';

const operations = {
	createFolder: createFolder.execute,
	deleteFile: deleteFile.execute,
	deleteFolder: deleteFolder.execute,
	getFile: getFile.execute,
	getFolderTree: getFolderTree.execute,
	getStorage: getStorage.execute,
	listFolder: listFolder.execute,
	moveFile: moveFile.execute,
	upload: upload.execute,
} as const;

export type MediaOperation = keyof typeof operations;

/** Routes one input item to the Storage operation the user selected. */
export async function executeMediaOperation(
	this: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const handler = operations[operation as MediaOperation];

	if (handler === undefined) {
		throw new NodeOperationError(
			this.getNode(),
			`The operation "${operation}" is not supported for the Storage resource`,
			{ itemIndex },
		);
	}

	return await handler.call(this, itemIndex);
}
