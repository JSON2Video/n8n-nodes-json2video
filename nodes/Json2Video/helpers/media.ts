import type { IDataObject, INodePropertyOptions } from 'n8n-workflow';

// Pure helpers that turn n8n parameter values into JSON2Video Media request
// bodies, and shape Media responses. No n8n runtime is touched here so the
// mapping stays unit-testable.
// Contract: `integrations/shared/operations.md` → "Resource: Media".

/** Per-file ceiling enforced by `POST /v2/media/file` (500 MB). */
export const MAX_UPLOAD_SIZE_BYTES = 524288000;

/** Sent when the incoming binary data carries no usable MIME type. */
export const FALLBACK_CONTENT_TYPE = 'application/octet-stream';

/** Lifetime of the presigned upload URL returned by step 1, in seconds. */
export const PRESIGNED_URL_TTL_SECONDS = 120;

/**
 * Shown after a failed step 2: the Drive record exists but holds no bytes, and
 * the next upload of the same name would be rejected with a 409.
 */
export const UPLOAD_PENDING_HINT =
	'The file was registered in your Drive but its bytes were never stored, so it is left in "pending" state. Delete it with Storage → Delete File before retrying, otherwise the next upload of the same name fails with "A file with this name already exists".';

/**
 * Normalises a Drive path — a folder or a `folder/file` path — to the canonical
 * form the API expects: no leading or trailing slash, no repeated slashes. The
 * root folder is the empty string.
 *
 * `GET /media/folder` is the one endpoint that wants `/` for the root; see
 * `toListFolderPath`.
 */
export function normalizeMediaPath(value: unknown): string {
	if (typeof value !== 'string') return '';

	return value
		.split('/')
		.map((segment) => segment.trim())
		.filter((segment) => segment !== '')
		.join('/');
}

/** `GET /media/folder` addresses the root folder as `/`, not as an empty string. */
export function toListFolderPath(value: unknown): string {
	const normalized = normalizeMediaPath(value);
	return normalized === '' ? '/' : normalized;
}

/** Joins a folder and a file name into the `path` form `GET /media/file` takes. */
export function joinMediaPath(folder: unknown, name: string): string {
	const normalized = normalizeMediaPath(folder);
	return normalized === '' ? name : `${normalized}/${name}`;
}

/**
 * The API replaces every character outside `a-z A-Z 0-9 . _ -` with `_`. Doing
 * it client-side means the emitted `path` and `url` match what was really
 * stored, instead of echoing back a name the API silently rewrote.
 */
export function sanitizeMediaFileName(name: string): string {
	return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
	for (const value of values) {
		if (typeof value !== 'string') continue;
		const trimmed = value.trim();
		if (trimmed !== '') return trimmed;
	}
	return undefined;
}

/**
 * File name for the upload: the *File Name* override wins, otherwise the
 * incoming binary's own file name. `undefined` means neither was available and
 * the operation cannot continue — the API requires `name`.
 */
export function resolveUploadFileName(
	override: unknown,
	binaryFileName: unknown,
): string | undefined {
	const candidate = firstNonEmptyString(override, binaryFileName);
	return candidate === undefined ? undefined : sanitizeMediaFileName(candidate);
}

/**
 * MIME type for the upload: the *MIME Type* override wins, otherwise the
 * incoming binary's MIME type, otherwise a generic binary type. The API uses it
 * to classify the file as image / video / audio / other, and S3 signs it into
 * the presigned URL, so the same value must be replayed on the `PUT`.
 */
export function resolveUploadContentType(override: unknown, binaryMimeType: unknown): string {
	return firstNonEmptyString(override, binaryMimeType) ?? FALLBACK_CONTENT_TYPE;
}

export interface UploadBodyInput {
	name: string;
	contentType: string;
	size: number;
	folder?: unknown;
}

/** Body of step 1, `POST /media/file`. `folder` is omitted for the root folder. */
export function buildUploadBody(input: UploadBodyInput): IDataObject {
	const body: IDataObject = {
		name: input.name,
		contentType: input.contentType,
		size: input.size,
	};

	const folder = normalizeMediaPath(input.folder);
	if (folder !== '') body.folder = folder;

	return body;
}

function formatMegabytes(bytes: number): string {
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Client-side guard on the file size, so an oversized file fails before the
 * round trip instead of coming back as a bare 413. Returns the error message,
 * or `undefined` when the size is acceptable.
 */
export function validateUploadSize(size: number): string | undefined {
	if (!Number.isFinite(size) || size <= 0) {
		return 'The binary field is empty, so there is nothing to upload';
	}

	if (size > MAX_UPLOAD_SIZE_BYTES) {
		return `The file is ${formatMegabytes(size)}, which is over the JSON2Video limit of 500 MB (${MAX_UPLOAD_SIZE_BYTES} bytes) per file`;
	}

	return undefined;
}

export interface PresignedUpload {
	uploadUrl: string;
	fileUrl: string;
	expiresIn: number;
}

/**
 * Reads the presigned upload details out of the step 1 response. Returns
 * `undefined` when `uploadUrl` is missing, which means step 2 cannot run.
 */
export function extractPresignedUpload(response: IDataObject): PresignedUpload | undefined {
	const uploadUrl = firstNonEmptyString(response.uploadUrl);
	if (uploadUrl === undefined) return undefined;

	return {
		uploadUrl,
		fileUrl: firstNonEmptyString(response.fileUrl) ?? '',
		expiresIn:
			typeof response.expiresIn === 'number' && Number.isFinite(response.expiresIn)
				? response.expiresIn
				: PRESIGNED_URL_TTL_SECONDS,
	};
}

export interface UploadOutputInput {
	name: string;
	folder: unknown;
	contentType: string;
	size: number;
	url: string;
}

/**
 * What the node emits after a successful upload. `uploadUrl` is deliberately
 * dropped: it is a signed secret with no downstream value that would otherwise
 * leak into execution logs. `url` is the field that matters — it drops straight
 * into an element's `src` in a later Movie: Create.
 */
export function buildUploadOutput(input: UploadOutputInput): IDataObject {
	const folder = normalizeMediaPath(input.folder);

	return {
		success: true,
		name: input.name,
		folder,
		path: joinMediaPath(folder, input.name),
		contentType: input.contentType,
		size: input.size,
		url: input.url,
	};
}

/**
 * Extra guidance appended to the description of a failed step 1. The API's own
 * message is never touched — it is written to be client-actionable — this only
 * says what to do next.
 */
export function describeUploadRegistrationError(
	statusCode: number | undefined,
	message: string,
): string | undefined {
	if (statusCode === 409 || /already exists/i.test(message)) {
		return 'Delete the existing file with Storage → Delete File first, or set a different name in Additional Options → File Name.';
	}

	if (statusCode === 413) {
		return `JSON2Video accepts at most 500 MB (${MAX_UPLOAD_SIZE_BYTES} bytes) per file.`;
	}

	if (statusCode === 403 && /storage is blocked/i.test(message)) {
		return 'Storage is blocked because the account ran out of credits. Add credits to continue uploading.';
	}

	if (statusCode === 403) {
		return 'This API key does not have the Render role, which is the minimum needed to write to the Drive.';
	}

	return undefined;
}

/**
 * Message for a failed step 2. This is a storage failure, not an API failure:
 * S3 answers with XML that means nothing to a workflow author, so the node
 * replaces it with the two things that actually explain it — the presigned URL
 * only lives for 120 seconds, and the file is now stuck in `pending`.
 */
export function describeUploadTransferError(
	statusCode: number | undefined,
	path: string,
): string {
	if (statusCode === 403) {
		return `Storage rejected the upload of "${path}": the presigned upload URL expired or was not accepted. It is valid for ${PRESIGNED_URL_TTL_SECONDS} seconds only — run the operation again.`;
	}

	const suffix = statusCode === undefined ? '' : ` (HTTP ${statusCode})`;
	return `Uploading the bytes of "${path}" to storage failed${suffix}. The file was registered but never stored.`;
}

/**
 * Body of `PUT /media/file`. `destination` is always sent, even when empty:
 * an empty string means the root folder, and omitting the key makes the API
 * answer `destination is required`.
 */
export function buildMoveFileBody(name: string, folder: unknown, destination: unknown): IDataObject {
	return {
		name,
		folder: normalizeMediaPath(folder),
		destination: normalizeMediaPath(destination),
	};
}

/**
 * `PUT /media/file` answers with just `{ success, timestamp }`. Emit where the
 * file ended up, so downstream nodes do not have to recompute it.
 */
export function buildMoveFileOutput(name: string, destination: unknown): IDataObject {
	const folder = normalizeMediaPath(destination);

	return {
		success: true,
		name,
		folder,
		path: joinMediaPath(folder, name),
		moved: true,
	};
}

/** Body of `DELETE /media/file` — a JSON body, not query parameters. */
export function buildDeleteFileBody(name: string, folder: unknown): IDataObject {
	return { name, folder: normalizeMediaPath(folder) };
}

/** `DELETE /media/file` does not echo what it deleted, so the node does. */
export function buildDeleteFileOutput(name: string, folder: unknown): IDataObject {
	const normalized = normalizeMediaPath(folder);

	return {
		success: true,
		name,
		folder: normalized,
		path: joinMediaPath(normalized, name),
		deleted: true,
	};
}

/**
 * `POST /media/folder` is idempotent: an existing folder answers `200` with
 * `message: "Folder already exists"`. Pass that through and turn it into a
 * `created` flag so a workflow can branch on it.
 */
export function buildCreateFolderOutput(folder: string, response: IDataObject): IDataObject {
	const message = firstNonEmptyString(response.message);

	const output: IDataObject = { success: true, folder, created: message === undefined };
	if (message !== undefined) output.message = message;

	return output;
}

/** `DELETE /media/folder` does not echo what it deleted, so the node does. */
export function buildDeleteFolderOutput(folder: string): IDataObject {
	return { success: true, folder, deleted: true };
}

/**
 * Extra guidance appended to the description of a failed `DELETE /media/folder`.
 * The API only removes empty folders, and that is the failure people hit.
 */
export function describeDeleteFolderError(
	statusCode: number | undefined,
	message: string,
): string | undefined {
	if (/not empty/i.test(message)) {
		return 'JSON2Video only deletes empty folders. Remove every file in it first — Storage → List Folder shows what is left, and Storage → Delete File removes them one by one.';
	}

	if (/root folder/i.test(message)) {
		return 'The root folder is permanent and cannot be deleted.';
	}

	if (/temp folder/i.test(message)) {
		return 'The temp folder is permanent and cannot be deleted. Its files are removed automatically.';
	}

	if (statusCode === 403) {
		return 'This API key does not have the Render role, which is the minimum needed to write to the Drive.';
	}

	return undefined;
}

export interface ListFolderQueryInput {
	path: unknown;
	page: number;
	pageSize: number;
	type?: unknown;
	search?: unknown;
}

/** Query string of `GET /media/folder`. Pagination is `page` (zero-based) + `page_size`. */
export function buildListFolderQuery(input: ListFolderQueryInput): IDataObject {
	const qs: IDataObject = {
		path: toListFolderPath(input.path),
		page: input.page,
		page_size: input.pageSize,
	};

	const type = firstNonEmptyString(input.type);
	if (type !== undefined) qs.type = type;

	const search = firstNonEmptyString(input.search);
	if (search !== undefined) qs.q = search;

	return qs;
}

export interface ListFolderMeta {
	path: string;
	folders: string[];
	total: number;
	total_files: number;
	total_size: number;
}

/** Reads the folder-level counters and sub-folder names out of a page response. */
export function extractListFolderMeta(response: IDataObject): ListFolderMeta {
	const toCount = (value: unknown): number =>
		typeof value === 'number' && Number.isFinite(value) ? value : 0;

	return {
		path: typeof response.path === 'string' ? response.path : '',
		folders: Array.isArray(response.folders)
			? response.folders.filter((entry): entry is string => typeof entry === 'string')
			: [],
		total: toCount(response.total),
		total_files: toCount(response.total_files),
		total_size: toCount(response.total_size),
	};
}

/**
 * One item per file, with the sub-folder names attached to the first item so
 * they are never silently dropped. An empty folder still emits one item
 * carrying the counters and the sub-folders, otherwise listing an empty folder
 * would return nothing at all and a workflow could not tell it apart from a
 * failure.
 */
export function buildListFolderItems(files: IDataObject[], meta: ListFolderMeta): IDataObject[] {
	if (files.length === 0) {
		return [
			{
				path: meta.path,
				folders: meta.folders,
				files: [],
				total: meta.total,
				total_files: meta.total_files,
				total_size: meta.total_size,
			},
		];
	}

	return files.map((file, index) => (index === 0 ? { ...file, folders: meta.folders } : { ...file }));
}

/**
 * "Media Folder" dropdown (Appendix C), built from `GET /media/folder?tree=true`.
 * The root folder's value is the empty string, which is what every write
 * endpoint expects — `normalizeMediaPath` maps the API's `/` onto it.
 */
export function buildFolderOptions(tree: IDataObject[]): INodePropertyOptions[] {
	const seen = new Set<string>();
	const options: INodePropertyOptions[] = [];

	for (const entry of tree) {
		if (typeof entry.path !== 'string') continue;

		const value = normalizeMediaPath(entry.path);
		if (seen.has(value)) continue;
		seen.add(value);

		const files = typeof entry.files === 'number' ? entry.files : 0;
		const label = value === '' ? 'Root folder' : value;

		options.push({ name: `${label} (${files} files)`, value });
	}

	return options;
}

/**
 * "Media File" dropdown (Appendix C), built from
 * `GET /media/folder?path=<folder>&page_size=100`.
 *
 * Two value shapes are needed: Get File addresses a file by its full `path`,
 * while Move File and Delete File send a bare `name` plus a separate `folder`.
 */
export function buildFileOptions(
	files: IDataObject[],
	valueMode: 'path' | 'name',
): INodePropertyOptions[] {
	const options: INodePropertyOptions[] = [];

	for (const file of files) {
		if (typeof file.name !== 'string' || file.name === '') continue;

		const value =
			valueMode === 'name' ? file.name : joinMediaPath(file.folder, file.name);

		options.push({ name: file.name, value });
	}

	return options;
}
