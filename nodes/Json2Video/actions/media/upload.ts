import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { appendErrorHint, extractApiErrorMessage, getErrorStatusCode } from '../../helpers/errors';
import {
	buildUploadBody,
	buildUploadOutput,
	describeUploadRegistrationError,
	describeUploadTransferError,
	extractPresignedUpload,
	joinMediaPath,
	normalizeMediaPath,
	resolveUploadContentType,
	resolveUploadFileName,
	UPLOAD_PENDING_HINT,
	validateUploadSize,
} from '../../helpers/media';
import { json2VideoApiRequest } from '../../transport';

/**
 * Media: Upload File — `POST /v2/media/file` followed by a `PUT` to the
 * presigned S3 URL it returns. The two steps are one n8n operation; users never
 * see the presigned URL, and it is never emitted (it is a signed secret that
 * would otherwise land in execution logs).
 *
 * Three rules from the catalogue drive this implementation:
 *
 * 1. **No filesystem, no temp files** — forbidden by the verification rules —
 *    so the bytes are held in memory as a Buffer. Streaming was considered and
 *    is not available: `IHttpRequestOptions.body` does not accept a `Readable`,
 *    and `helpers.getBinaryStream` only works when n8n stores binary data by
 *    ID, which is not guaranteed. `getBinaryDataBuffer` is also the only way to
 *    know `size`, which step 1 requires and the API validates.
 * 2. **The `PUT` must not carry `x-api-key`** — it goes to S3, not to the API,
 *    and an extra header invalidates the presigned signature. Hence plain
 *    `this.helpers.httpRequest`, never the authenticated variant nor the shared
 *    `json2VideoApiRequest` transport.
 * 3. **The `PUT` must replay the exact `Content-Type` of step 1** — S3 signs it.
 *
 * The two steps fail in completely different ways, so they are reported
 * differently: step 1 is a JSON2Video API error (message surfaced verbatim,
 * plus a hint), step 2 is a storage error (S3 XML is useless to a workflow
 * author, so it is replaced with the expiry/pending explanation).
 */
export async function execute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex, 'data') as string;
	const additionalOptions = this.getNodeParameter('additionalOptions', itemIndex, {}) as IDataObject;

	const binaryData = this.helpers.assertBinaryData(itemIndex, binaryPropertyName);

	const fileName = resolveUploadFileName(additionalOptions.fileName, binaryData.fileName);
	if (fileName === undefined) {
		throw new NodeOperationError(this.getNode(), 'The file to upload has no name', {
			itemIndex,
			description:
				'The incoming binary data carries no file name, and JSON2Video requires one. Set Additional Options → File Name.',
		});
	}

	const contentType = resolveUploadContentType(additionalOptions.contentType, binaryData.mimeType);
	const folder = normalizeMediaPath(additionalOptions.folder);
	const path = joinMediaPath(folder, fileName);

	const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
	const size = buffer.length;

	const sizeError = validateUploadSize(size);
	if (sizeError !== undefined) {
		throw new NodeOperationError(this.getNode(), sizeError, {
			itemIndex,
			description:
				'Checked before the request so the upload does not fail halfway. Split the file, or compress it, and try again.',
		});
	}

	// Step 1 — register the file and get a presigned upload URL.
	let registration: IDataObject;
	try {
		registration = await json2VideoApiRequest.call(this, 'POST', '/media/file', {
			body: buildUploadBody({ name: fileName, contentType, size, folder }),
			itemIndex,
		});
	} catch (error) {
		throw appendErrorHint(
			error,
			describeUploadRegistrationError(getErrorStatusCode(error), extractApiErrorMessage(error)),
		);
	}

	const presigned = extractPresignedUpload(registration);
	if (presigned === undefined) {
		throw new NodeOperationError(
			this.getNode(),
			'JSON2Video did not return an upload URL for this file',
			{
				itemIndex,
				description:
					'The API accepted the request but the response carried no uploadUrl, so the bytes cannot be stored. Retry the operation.',
			},
		);
	}

	// Step 2 — the bytes go straight to storage. The presigned URL lives for
	// 120 seconds, so this must follow step 1 immediately: never insert a Wait.
	try {
		await this.helpers.httpRequest({
			method: 'PUT',
			url: presigned.uploadUrl,
			body: buffer,
			headers: { 'Content-Type': contentType },
			json: false,
		});
	} catch (error) {
		throw new NodeOperationError(
			this.getNode(),
			describeUploadTransferError(getErrorStatusCode(error), path),
			{ itemIndex, description: UPLOAD_PENDING_HINT },
		);
	}

	return [
		{
			json: buildUploadOutput({ name: fileName, folder, contentType, size, url: presigned.fileUrl }),
			pairedItem: { item: itemIndex },
		},
	];
}
