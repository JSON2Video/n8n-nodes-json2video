import type { IDataObject, ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';

import { buildFileOptions, buildFolderOptions, toListFolderPath } from '../helpers/media';
import {
	buildTemplateVariableOptions,
	collectSortedTags,
	extractTemplateId,
} from '../helpers/template';
import { json2VideoApiRequest } from '../transport';

/** Cap what a dropdown renders so a big Drive cannot freeze the parameter panel. */
const MAX_FILE_OPTIONS = 100;

/**
 * "Template Tag" dropdown (Appendix C): the union of every tag across the
 * account's templates, deduplicated and sorted. Backs Template: Get Many →
 * Additional Options → Tag.
 *
 * Degrades gracefully: an expired key, a key whose role is too low, or a
 * transient failure returns an empty list instead of breaking the parameter
 * panel.
 */
export async function getTemplateTags(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	try {
		const response = await json2VideoApiRequest.call(this, 'GET', '/templates');
		const templates = Array.isArray(response.templates) ? (response.templates as IDataObject[]) : [];

		return collectSortedTags(templates).map((tag) => ({ name: tag, value: tag }));
	} catch {
		return [];
	}
}

/**
 * "Template Variable" dropdown (Appendix C): the variables of the template
 * currently selected in the `templateId` resource locator
 * (`loadOptionsDependsOn: ['templateId.value']`), from
 * `GET /templates?id=<id>&format=make`.
 *
 * `format=make` is the only shape that returns typed variable descriptors
 * (name, label, type, default, help, select options, nested `spec`); the
 * default and `format=jsonschema` shapes do not. It is an internal format —
 * see `operations.md` → "Template — Get" and Appendix A.4.
 *
 * Degrades gracefully: no template selected yet, an expired key, a key whose
 * role is too low or a transient failure all return an empty list instead of
 * breaking the parameter panel. The field still accepts a name typed in
 * directly or supplied by an expression.
 */
export async function getTemplateVariables(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	try {
		const templateId = extractTemplateId(this.getCurrentNodeParameter('templateId'));
		if (templateId === '') return [];

		const response = await json2VideoApiRequest.call(this, 'GET', '/templates', {
			qs: { id: templateId, format: 'make' },
		});

		const template =
			typeof response.template === 'object' && response.template !== null
				? (response.template as IDataObject)
				: {};

		return buildTemplateVariableOptions(template.variables);
	} catch {
		return [];
	}
}

/**
 * "Media Folder" dropdown (Appendix C): every folder in the Drive, from
 * `GET /media/folder?tree=true`, labelled with its file count.
 *
 * The root folder's value is the empty string — what every write endpoint
 * expects — even though the tree reports it as `/`.
 *
 * Degrades gracefully: an empty list never breaks the parameter panel, and any
 * folder can still be typed in through an expression.
 */
export async function getMediaFolders(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	try {
		const response = await json2VideoApiRequest.call(this, 'GET', '/media/folder', {
			qs: { tree: true },
		});
		const tree = Array.isArray(response.tree) ? (response.tree as IDataObject[]) : [];

		return buildFolderOptions(tree);
	} catch {
		return [];
	}
}

/**
 * Files of the folder currently selected in the `folder` parameter
 * (`loadOptionsDependsOn: ['folder']`), from
 * `GET /media/folder?path=<folder>&page_size=100`.
 */
async function loadMediaFiles(
	context: ILoadOptionsFunctions,
	valueMode: 'path' | 'name',
): Promise<INodePropertyOptions[]> {
	try {
		const folder = context.getCurrentNodeParameter('folder');

		const response = await json2VideoApiRequest.call(context, 'GET', '/media/folder', {
			qs: { path: toListFolderPath(folder), page: 0, page_size: MAX_FILE_OPTIONS },
		});

		const files = Array.isArray(response.files) ? (response.files as IDataObject[]) : [];

		return buildFileOptions(files.slice(0, MAX_FILE_OPTIONS), valueMode);
	} catch {
		return [];
	}
}

/**
 * "Media File" dropdown for Media: Get File — the value is the full
 * `folder/name` path, because `GET /media/file` addresses files by `path`.
 */
export async function getMediaFiles(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return await loadMediaFiles(this, 'path');
}

/**
 * "Media File" dropdown for Media: Move File and Media: Delete File — the value
 * is the bare file name, because those endpoints take `name` plus a separate
 * `folder` (Appendix B / B12).
 */
export async function getMediaFileNames(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await loadMediaFiles(this, 'name');
}
