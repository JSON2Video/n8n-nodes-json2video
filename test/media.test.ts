import { describe, expect, it } from 'vitest';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import { appendErrorHint } from '../nodes/Json2Video/helpers/errors';
import {
	buildCreateFolderOutput,
	buildDeleteFileBody,
	buildDeleteFileOutput,
	buildDeleteFolderOutput,
	buildFileOptions,
	buildFolderOptions,
	buildListFolderItems,
	buildListFolderQuery,
	buildMoveFileBody,
	buildMoveFileOutput,
	buildUploadBody,
	buildUploadOutput,
	describeDeleteFolderError,
	describeUploadRegistrationError,
	describeUploadTransferError,
	extractListFolderMeta,
	extractPresignedUpload,
	joinMediaPath,
	MAX_UPLOAD_SIZE_BYTES,
	normalizeMediaPath,
	resolveUploadContentType,
	resolveUploadFileName,
	sanitizeMediaFileName,
	toListFolderPath,
	validateUploadSize,
} from '../nodes/Json2Video/helpers/media';

const NODE = { id: '1', name: 'JSON2Video', typeVersion: 1, type: 'json2Video', position: [0, 0] as [number, number], parameters: {} };

describe('normalizeMediaPath', () => {
	it('strips leading, trailing and repeated slashes', () => {
		expect(normalizeMediaPath('/videos/')).toBe('videos');
		expect(normalizeMediaPath('videos//raw')).toBe('videos/raw');
		expect(normalizeMediaPath('  /videos/raw/  ')).toBe('videos/raw');
	});

	it('maps every spelling of the root folder onto the empty string', () => {
		expect(normalizeMediaPath('/')).toBe('');
		expect(normalizeMediaPath('')).toBe('');
		expect(normalizeMediaPath('   ')).toBe('');
		expect(normalizeMediaPath(undefined)).toBe('');
		expect(normalizeMediaPath(null)).toBe('');
		expect(normalizeMediaPath(42)).toBe('');
	});

	it('trims each segment', () => {
		expect(normalizeMediaPath('videos / raw')).toBe('videos/raw');
	});
});

describe('toListFolderPath', () => {
	it('uses `/` for the root folder, which is what GET /media/folder wants', () => {
		expect(toListFolderPath('')).toBe('/');
		expect(toListFolderPath('/')).toBe('/');
		expect(toListFolderPath(undefined)).toBe('/');
	});

	it('passes a normalized folder through', () => {
		expect(toListFolderPath('/videos/')).toBe('videos');
	});
});

describe('joinMediaPath', () => {
	it('joins folder and name', () => {
		expect(joinMediaPath('videos', 'clip.mp4')).toBe('videos/clip.mp4');
		expect(joinMediaPath('/videos/raw/', 'clip.mp4')).toBe('videos/raw/clip.mp4');
	});

	it('returns the bare name at the root', () => {
		expect(joinMediaPath('', 'clip.mp4')).toBe('clip.mp4');
		expect(joinMediaPath('/', 'clip.mp4')).toBe('clip.mp4');
	});
});

describe('sanitizeMediaFileName', () => {
	it('replaces every character the API would rewrite', () => {
		expect(sanitizeMediaFileName('my clip (final).mp4')).toBe('my_clip__final_.mp4');
		expect(sanitizeMediaFileName('vidéo.mp4')).toBe('vid_o.mp4');
	});

	it('leaves an already safe name untouched', () => {
		expect(sanitizeMediaFileName('clip-01_final.mp4')).toBe('clip-01_final.mp4');
	});
});

describe('resolveUploadFileName', () => {
	it('prefers the File Name override', () => {
		expect(resolveUploadFileName('override.mp4', 'binary.mp4')).toBe('override.mp4');
	});

	it('falls back to the binary file name', () => {
		expect(resolveUploadFileName('', 'binary.mp4')).toBe('binary.mp4');
		expect(resolveUploadFileName(undefined, 'binary.mp4')).toBe('binary.mp4');
	});

	it('sanitizes whichever name it uses', () => {
		expect(resolveUploadFileName(undefined, 'my clip.mp4')).toBe('my_clip.mp4');
	});

	it('returns undefined when there is no name at all — the API requires one', () => {
		expect(resolveUploadFileName(undefined, undefined)).toBeUndefined();
		expect(resolveUploadFileName('  ', '')).toBeUndefined();
	});
});

describe('resolveUploadContentType', () => {
	it('prefers the MIME Type override, then the binary MIME type', () => {
		expect(resolveUploadContentType('video/mp4', 'application/octet-stream')).toBe('video/mp4');
		expect(resolveUploadContentType('', 'image/png')).toBe('image/png');
	});

	it('falls back to a generic binary type so step 1 never misses contentType', () => {
		expect(resolveUploadContentType(undefined, undefined)).toBe('application/octet-stream');
	});
});

describe('buildUploadBody', () => {
	it('builds the step 1 body with the folder', () => {
		expect(
			buildUploadBody({ name: 'clip.mp4', contentType: 'video/mp4', size: 3145728, folder: '/videos/' }),
		).toEqual({ name: 'clip.mp4', contentType: 'video/mp4', size: 3145728, folder: 'videos' });
	});

	it('omits the folder at the root', () => {
		expect(buildUploadBody({ name: 'clip.mp4', contentType: 'video/mp4', size: 12 })).toEqual({
			name: 'clip.mp4',
			contentType: 'video/mp4',
			size: 12,
		});
	});
});

describe('validateUploadSize', () => {
	it('accepts a normal size', () => {
		expect(validateUploadSize(3145728)).toBeUndefined();
		expect(validateUploadSize(MAX_UPLOAD_SIZE_BYTES)).toBeUndefined();
	});

	it('rejects an empty binary field', () => {
		expect(validateUploadSize(0)).toMatch(/empty/i);
		expect(validateUploadSize(Number.NaN)).toMatch(/empty/i);
	});

	it('rejects anything over 500 MB before the round trip', () => {
		const message = validateUploadSize(MAX_UPLOAD_SIZE_BYTES + 1);
		expect(message).toMatch(/500 MB/);
		expect(message).toMatch(/500\.0 MB/);
	});
});

describe('extractPresignedUpload', () => {
	it('reads uploadUrl, fileUrl and expiresIn', () => {
		expect(
			extractPresignedUpload({
				success: true,
				uploadUrl: 'https://s3.example/put?X-Amz-Signature=abc',
				fileUrl: 'https://media.json2video.com/c1/files/videos/clip.mp4',
				expiresIn: 120,
			}),
		).toEqual({
			uploadUrl: 'https://s3.example/put?X-Amz-Signature=abc',
			fileUrl: 'https://media.json2video.com/c1/files/videos/clip.mp4',
			expiresIn: 120,
		});
	});

	it('defaults expiresIn to the documented 120 seconds', () => {
		expect(extractPresignedUpload({ uploadUrl: 'https://s3.example/put' })?.expiresIn).toBe(120);
	});

	it('returns undefined without an upload URL, so step 2 is never attempted', () => {
		expect(extractPresignedUpload({ success: true })).toBeUndefined();
		expect(extractPresignedUpload({ uploadUrl: '' })).toBeUndefined();
	});
});

describe('buildUploadOutput', () => {
	it('emits the public URL and path, and never the presigned upload URL', () => {
		const output = buildUploadOutput({
			name: 'clip.mp4',
			folder: '/videos/',
			contentType: 'video/mp4',
			size: 3145728,
			url: 'https://media.json2video.com/c1/files/videos/clip.mp4',
		});

		expect(output).toEqual({
			success: true,
			name: 'clip.mp4',
			folder: 'videos',
			path: 'videos/clip.mp4',
			contentType: 'video/mp4',
			size: 3145728,
			url: 'https://media.json2video.com/c1/files/videos/clip.mp4',
		});
		expect(JSON.stringify(output)).not.toMatch(/uploadUrl/i);
	});

	it('reports the root folder as an empty string with a bare path', () => {
		expect(
			buildUploadOutput({ name: 'clip.mp4', folder: '/', contentType: 'video/mp4', size: 1, url: 'u' }),
		).toMatchObject({ folder: '', path: 'clip.mp4' });
	});
});

describe('describeUploadRegistrationError (step 1)', () => {
	it('tells the user how to resolve a duplicate name', () => {
		expect(
			describeUploadRegistrationError(409, 'A file with this name already exists. Delete it first.'),
		).toMatch(/Delete File/);
	});

	it('separates blocked storage from an insufficient role on 403', () => {
		expect(
			describeUploadRegistrationError(403, 'Storage is blocked. Add credits to continue uploading.'),
		).toMatch(/credits/i);
		expect(describeUploadRegistrationError(403, 'Insufficient permissions')).toMatch(/Render role/);
	});

	it('explains the 500 MB ceiling on 413', () => {
		expect(describeUploadRegistrationError(413, 'File exceeds maximum size of 500 MB')).toMatch(
			/500 MB/,
		);
	});

	it('adds nothing when the API message already stands on its own', () => {
		expect(describeUploadRegistrationError(400, 'name is required')).toBeUndefined();
	});
});

describe('describeUploadTransferError (step 2)', () => {
	it('blames the 120-second presigned URL on a 403 from storage', () => {
		const message = describeUploadTransferError(403, 'videos/clip.mp4');
		expect(message).toMatch(/videos\/clip\.mp4/);
		expect(message).toMatch(/120 seconds/);
		expect(message).toMatch(/expired/i);
	});

	it('names the status code for any other storage failure', () => {
		expect(describeUploadTransferError(500, 'clip.mp4')).toMatch(/HTTP 500/);
	});

	it('stays readable when the failure carried no status code', () => {
		const message = describeUploadTransferError(undefined, 'clip.mp4');
		expect(message).toMatch(/clip\.mp4/);
		expect(message).not.toMatch(/HTTP/);
	});
});

describe('buildMoveFileBody', () => {
	it('always sends destination, even for the root folder', () => {
		expect(buildMoveFileBody('clip.mp4', 'videos', '')).toEqual({
			name: 'clip.mp4',
			folder: 'videos',
			destination: '',
		});
	});

	it('normalizes both folders', () => {
		expect(buildMoveFileBody('clip.mp4', '/videos/', '/videos/raw/')).toEqual({
			name: 'clip.mp4',
			folder: 'videos',
			destination: 'videos/raw',
		});
	});
});

describe('buildMoveFileOutput', () => {
	it('reports where the file ended up', () => {
		expect(buildMoveFileOutput('clip.mp4', 'videos/raw')).toEqual({
			success: true,
			name: 'clip.mp4',
			folder: 'videos/raw',
			path: 'videos/raw/clip.mp4',
			moved: true,
		});
	});

	it('handles a move to the root folder', () => {
		expect(buildMoveFileOutput('clip.mp4', '')).toMatchObject({ folder: '', path: 'clip.mp4' });
	});
});

describe('buildDeleteFileBody / buildDeleteFileOutput', () => {
	it('sends name plus folder as a JSON body', () => {
		expect(buildDeleteFileBody('clip.mp4', '/videos/')).toEqual({
			name: 'clip.mp4',
			folder: 'videos',
		});
	});

	it('echoes what was deleted, which the raw response omits', () => {
		expect(buildDeleteFileOutput('clip.mp4', 'videos')).toEqual({
			success: true,
			name: 'clip.mp4',
			folder: 'videos',
			path: 'videos/clip.mp4',
			deleted: true,
		});
	});
});

describe('buildCreateFolderOutput', () => {
	it('reports a freshly created folder', () => {
		expect(buildCreateFolderOutput('videos/raw', { success: true })).toEqual({
			success: true,
			folder: 'videos/raw',
			created: true,
		});
	});

	it('passes the idempotent "already exists" message through', () => {
		expect(
			buildCreateFolderOutput('videos', { success: true, message: 'Folder already exists' }),
		).toEqual({
			success: true,
			folder: 'videos',
			created: false,
			message: 'Folder already exists',
		});
	});
});

describe('buildDeleteFolderOutput', () => {
	it('echoes the deleted folder', () => {
		expect(buildDeleteFolderOutput('videos/raw')).toEqual({
			success: true,
			folder: 'videos/raw',
			deleted: true,
		});
	});
});

describe('describeDeleteFolderError', () => {
	it('explains the empty-folder rule', () => {
		const hint = describeDeleteFolderError(400, 'Folder is not empty. Delete all files first.');
		expect(hint).toMatch(/only deletes empty folders/i);
		expect(hint).toMatch(/Delete File/);
	});

	it('explains the two undeletable folders', () => {
		expect(describeDeleteFolderError(400, 'Cannot delete root folder')).toMatch(/root folder/i);
		expect(describeDeleteFolderError(400, 'Cannot delete the temp folder')).toMatch(/temp folder/i);
	});

	it('explains a role failure', () => {
		expect(describeDeleteFolderError(403, 'Insufficient permissions')).toMatch(/Render role/);
	});

	it('adds nothing to an unrelated failure', () => {
		expect(describeDeleteFolderError(400, 'folder is required')).toBeUndefined();
	});
});

describe('buildListFolderQuery', () => {
	it('sends the root folder as `/` with zero-based paging', () => {
		expect(buildListFolderQuery({ path: '', page: 0, pageSize: 50 })).toEqual({
			path: '/',
			page: 0,
			page_size: 50,
		});
	});

	it('adds the type filter and the search needle only when set', () => {
		expect(
			buildListFolderQuery({ path: 'videos', page: 2, pageSize: 100, type: 'video', search: ' intro ' }),
		).toEqual({ path: 'videos', page: 2, page_size: 100, type: 'video', q: 'intro' });
	});

	it('drops empty filters', () => {
		expect(buildListFolderQuery({ path: 'videos', page: 0, pageSize: 20, type: '', search: '  ' })).toEqual(
			{ path: 'videos', page: 0, page_size: 20 },
		);
	});
});

describe('extractListFolderMeta', () => {
	it('reads the folder counters and sub-folder names', () => {
		expect(
			extractListFolderMeta({
				success: true,
				path: 'videos',
				total_size: 8388608,
				total_files: 4,
				total: 4,
				folders: ['raw', 42, 'archive'],
			}),
		).toEqual({
			path: 'videos',
			folders: ['raw', 'archive'],
			total: 4,
			total_files: 4,
			total_size: 8388608,
		});
	});

	it('defaults every counter when the response is bare', () => {
		expect(extractListFolderMeta({})).toEqual({
			path: '',
			folders: [],
			total: 0,
			total_files: 0,
			total_size: 0,
		});
	});
});

describe('buildListFolderItems', () => {
	const meta = {
		path: 'videos',
		folders: ['raw'],
		total: 2,
		total_files: 2,
		total_size: 100,
	};

	it('emits one item per file and attaches the sub-folders to the first', () => {
		const items = buildListFolderItems([{ name: 'a.mp4' }, { name: 'b.mp4' }], meta);

		expect(items).toEqual([
			{ name: 'a.mp4', folders: ['raw'] },
			{ name: 'b.mp4' },
		]);
	});

	it('never silently drops an empty folder', () => {
		expect(buildListFolderItems([], meta)).toEqual([
			{
				path: 'videos',
				folders: ['raw'],
				files: [],
				total: 2,
				total_files: 2,
				total_size: 100,
			},
		]);
	});

	it('does not mutate the input files', () => {
		const files = [{ name: 'a.mp4' }];
		buildListFolderItems(files, meta);
		expect(files[0]).toEqual({ name: 'a.mp4' });
	});
});

describe('buildFolderOptions (Appendix C — Media Folder)', () => {
	it('labels each folder with its file count and maps the root onto an empty value', () => {
		expect(
			buildFolderOptions([
				{ path: '/', files: 2, size: 1048576 },
				{ path: 'temp', files: 0, size: 0 },
				{ path: 'videos', files: 4, size: 8388608 },
			]),
		).toEqual([
			{ name: 'Root folder (2 files)', value: '' },
			{ name: 'temp (0 files)', value: 'temp' },
			{ name: 'videos (4 files)', value: 'videos' },
		]);
	});

	it('deduplicates and skips entries without a path', () => {
		expect(buildFolderOptions([{ path: 'videos', files: 1 }, { path: '/videos', files: 1 }, { files: 3 }])).toEqual([
			{ name: 'videos (1 files)', value: 'videos' },
		]);
	});
});

describe('buildFileOptions (Appendix C — Media File)', () => {
	const files = [
		{ name: 'clip.mp4', folder: 'videos' },
		{ name: 'logo.png', folder: '' },
		{ folder: 'videos' },
	];

	it('uses the full path as the value for Get File', () => {
		expect(buildFileOptions(files, 'path')).toEqual([
			{ name: 'clip.mp4', value: 'videos/clip.mp4' },
			{ name: 'logo.png', value: 'logo.png' },
		]);
	});

	it('uses the bare name as the value for Move File and Delete File', () => {
		expect(buildFileOptions(files, 'name')).toEqual([
			{ name: 'clip.mp4', value: 'clip.mp4' },
			{ name: 'logo.png', value: 'logo.png' },
		]);
	});
});

describe('appendErrorHint', () => {
	it('adds a description to a NodeApiError without touching the API message', () => {
		const error = new NodeApiError(NODE, { message: 'A file with this name already exists.' });
		appendErrorHint(error, 'Use Media → Delete File first.');

		expect(error.message).toMatch(/already exists/);
		expect(error.description).toMatch(/Delete File/);
	});

	it('appends to an existing description instead of replacing it', () => {
		const error = new NodeOperationError(NODE, 'Boom', { description: 'First.' });
		appendErrorHint(error, 'Second.');

		expect(error.description).toBe('First. Second.');
	});

	it('is a no-op without a hint, or on a plain Error', () => {
		const error = new NodeOperationError(NODE, 'Boom', { description: 'Only.' });
		expect(appendErrorHint(error, undefined).description).toBe('Only.');

		const plain = new Error('Boom');
		expect(appendErrorHint(plain, 'ignored')).toBe(plain);
		expect((plain as unknown as { description?: string }).description).toBeUndefined();
	});
});
