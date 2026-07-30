import { describe, expect, it } from 'vitest';

import {
	applyClientSideLimit,
	buildDeleteTemplateResponse,
	buildTemplateBody,
	buildTemplateVariableDescriptor,
	buildTemplateVariableFields,
	buildTemplateVariableList,
	buildVariableSelectOptions,
	coerceVariableDefault,
	collectSortedTags,
	extractMappedVariables,
	extractTemplateId,
	parseTagsParameter,
	templateHasTag,
	templateVariableFieldType,
	withDualTemplateId,
} from '../nodes/Json2Video/helpers/template';

describe('withDualTemplateId (Appendix B / B8)', () => {
	it('adds `id` alongside `templateId` on a Create/Update/Duplicate response', () => {
		expect(
			withDualTemplateId({
				success: true,
				templateId: 'abc123def456ghi789jk',
				timestamp: '2026-05-12T10:49:52.924Z',
			}),
		).toEqual({
			success: true,
			templateId: 'abc123def456ghi789jk',
			id: 'abc123def456ghi789jk',
			timestamp: '2026-05-12T10:49:52.924Z',
		});
	});

	it('adds `templateId` alongside `id` when only `id` is present', () => {
		expect(withDualTemplateId({ success: true, id: 'xyz987uvw654rst321qp' })).toEqual({
			success: true,
			id: 'xyz987uvw654rst321qp',
			templateId: 'xyz987uvw654rst321qp',
		});
	});

	it('keeps a duplicate response name field untouched', () => {
		expect(
			withDualTemplateId({
				success: true,
				templateId: 'xyz987uvw654rst321qp',
				name: 'Product showcase (custom)',
			}),
		).toEqual({
			success: true,
			templateId: 'xyz987uvw654rst321qp',
			id: 'xyz987uvw654rst321qp',
			name: 'Product showcase (custom)',
		});
	});

	it('passes through a response with neither key unchanged', () => {
		expect(withDualTemplateId({ success: true })).toEqual({ success: true });
	});
});

describe('parseTagsParameter', () => {
	it('splits a comma-separated string and trims each tag', () => {
		expect(parseTagsParameter('demo, showcase ,  marketing')).toEqual([
			'demo',
			'showcase',
			'marketing',
		]);
	});

	it('drops empty segments', () => {
		expect(parseTagsParameter('demo,,  ,showcase')).toEqual(['demo', 'showcase']);
	});

	it('passes an array through, trimmed and filtered', () => {
		expect(parseTagsParameter(['demo', ' showcase ', ''])).toEqual(['demo', 'showcase']);
	});

	it('returns an empty array for empty or non-string input', () => {
		expect(parseTagsParameter('')).toEqual([]);
		expect(parseTagsParameter(undefined)).toEqual([]);
		expect(parseTagsParameter(null)).toEqual([]);
	});
});

describe('applyClientSideLimit (Appendix B / B10)', () => {
	const items = [1, 2, 3, 4, 5];

	it('returns everything when Return All is on, ignoring Limit', () => {
		expect(applyClientSideLimit(items, true, 2)).toEqual([1, 2, 3, 4, 5]);
	});

	it('slices to Limit when Return All is off', () => {
		expect(applyClientSideLimit(items, false, 2)).toEqual([1, 2]);
	});

	it('returns everything when Limit is larger than the list', () => {
		expect(applyClientSideLimit(items, false, 100)).toEqual([1, 2, 3, 4, 5]);
	});

	it('falls back to the full list for a non-positive or non-finite limit', () => {
		expect(applyClientSideLimit(items, false, 0)).toEqual([1, 2, 3, 4, 5]);
		expect(applyClientSideLimit(items, false, Number.NaN)).toEqual([1, 2, 3, 4, 5]);
	});
});

describe('templateHasTag', () => {
	it('matches case-insensitively', () => {
		expect(templateHasTag({ tags: ['Showcase', 'demo'] }, 'showcase')).toBe(true);
		expect(templateHasTag({ tags: ['Showcase'] }, 'SHOWCASE')).toBe(true);
	});

	it('returns false when the tag is absent', () => {
		expect(templateHasTag({ tags: ['demo'] }, 'showcase')).toBe(false);
		expect(templateHasTag({}, 'showcase')).toBe(false);
	});

	it('treats an empty needle as matching everything', () => {
		expect(templateHasTag({ tags: [] }, '')).toBe(true);
	});
});

describe('collectSortedTags', () => {
	it('unions, deduplicates and sorts tags across templates', () => {
		expect(
			collectSortedTags([
				{ tags: ['showcase', 'demo'] },
				{ tags: ['demo', 'marketing'] },
				{ tags: [] },
				{},
			]),
		).toEqual(['demo', 'marketing', 'showcase']);
	});

	it('returns an empty array when nothing has tags', () => {
		expect(collectSortedTags([{}, { tags: [] }])).toEqual([]);
	});
});

describe('buildTemplateBody', () => {
	it('builds the Create body shape', () => {
		expect(
			buildTemplateBody({
				name: 'Product showcase',
				movie: { resolution: 'full-hd', scenes: [] },
				tags: ['demo', 'showcase'],
				prompt: 'A short promo video',
			}),
		).toEqual({
			name: 'Product showcase',
			movie: { resolution: 'full-hd', scenes: [] },
			tags: ['demo', 'showcase'],
			prompt: 'A short promo video',
		});
	});

	it('omits fields that were not set (Update sends only what changed)', () => {
		expect(buildTemplateBody({ name: 'New name' })).toEqual({ name: 'New name' });
		expect(buildTemplateBody({})).toEqual({});
	});

	it('omits an empty name, empty prompt and an empty tags array', () => {
		expect(buildTemplateBody({ name: '', tags: [], prompt: '' })).toEqual({});
	});
});

describe('buildDeleteTemplateResponse', () => {
	it('echoes the deleted template ID, which the raw API response omits', () => {
		expect(buildDeleteTemplateResponse('abc123def456ghi789jk')).toEqual({
			success: true,
			templateId: 'abc123def456ghi789jk',
			deleted: true,
		});
	});
});

describe('extractTemplateId', () => {
	it('reads the ID out of a resourceLocator value', () => {
		expect(extractTemplateId({ mode: 'list', value: 'pi4ClZRP9cScS74SNFOa' })).toBe(
			'pi4ClZRP9cScS74SNFOa',
		);
		expect(extractTemplateId({ mode: 'id', value: ' pi4ClZRP9cScS74SNFOa ' })).toBe(
			'pi4ClZRP9cScS74SNFOa',
		);
	});

	it('accepts a bare string, which is what an expression produces', () => {
		expect(extractTemplateId('pi4ClZRP9cScS74SNFOa')).toBe('pi4ClZRP9cScS74SNFOa');
	});

	it('returns an empty string when nothing is selected yet', () => {
		expect(extractTemplateId({ mode: 'list', value: '' })).toBe('');
		expect(extractTemplateId(undefined)).toBe('');
		expect(extractTemplateId(null)).toBe('');
		expect(extractTemplateId(42)).toBe('');
		expect(extractTemplateId({})).toBe('');
	});
});

// Shape of `GET /templates?id=<id>&format=make` → `template.variables`, verified
// live against 101 real templates (628 variables) on 2026-07-30.
describe('templateVariableFieldType', () => {
	it('maps every type the API is known to emit onto an n8n FieldType', () => {
		expect(templateVariableFieldType('text')).toBe('string');
		expect(templateVariableFieldType('number')).toBe('number');
		expect(templateVariableFieldType('select')).toBe('options');
		expect(templateVariableFieldType('boolean')).toBe('boolean');
		expect(templateVariableFieldType('array')).toBe('array');
		expect(templateVariableFieldType('collection')).toBe('object');
	});

	it('falls back to string for an unknown or missing type, never dropping the variable', () => {
		// `url` really is returned by the live API and is not in the mapping table.
		expect(templateVariableFieldType('url')).toBe('string');
		expect(templateVariableFieldType('colorpicker')).toBe('string');
		expect(templateVariableFieldType(undefined)).toBe('string');
		expect(templateVariableFieldType(42)).toBe('string');
		expect(templateVariableFieldType('')).toBe('string');
	});
});

describe('coerceVariableDefault', () => {
	it('turns the stringified numeric default back into a number', () => {
		// `format=make` stringifies every default, so 600 arrives as "600".
		expect(coerceVariableDefault('600', 'number')).toBe(600);
		expect(coerceVariableDefault('76.5', 'number')).toBe(76.5);
		expect(coerceVariableDefault('0', 'number')).toBe(0);
		expect(coerceVariableDefault(600, 'number')).toBe(600);
	});

	it('omits a numeric default that is not a number', () => {
		expect(coerceVariableDefault('', 'number')).toBeUndefined();
		expect(coerceVariableDefault('   ', 'number')).toBeUndefined();
		expect(coerceVariableDefault('auto', 'number')).toBeUndefined();
		expect(coerceVariableDefault(Number.NaN, 'number')).toBeUndefined();
	});

	it('turns the stringified boolean default back into a boolean', () => {
		// "false" is a truthy string: left alone it would switch the toggle on.
		expect(coerceVariableDefault('false', 'boolean')).toBe(false);
		expect(coerceVariableDefault('true', 'boolean')).toBe(true);
		expect(coerceVariableDefault('TRUE', 'boolean')).toBe(true);
		expect(coerceVariableDefault(false, 'boolean')).toBe(false);
		expect(coerceVariableDefault('yes', 'boolean')).toBeUndefined();
	});

	it('keeps a text default as text and drops an empty one', () => {
		expect(coerceVariableDefault('This is my quote today', 'string')).toBe('This is my quote today');
		expect(coerceVariableDefault('  ', 'string')).toBeUndefined();
		expect(coerceVariableDefault(undefined, 'string')).toBeUndefined();
	});

	it('drops the stringified object defaults the Make payload produces', () => {
		expect(coerceVariableDefault('[object Object]', 'string')).toBeUndefined();
		expect(coerceVariableDefault('[object Object],[object Object]', 'string')).toBeUndefined();
	});

	it('never pre-fills a JSON editor, whatever the payload says', () => {
		expect(coerceVariableDefault('[object Object]', 'object')).toBeUndefined();
		expect(coerceVariableDefault('anything', 'array')).toBeUndefined();
	});
});

describe('buildVariableSelectOptions', () => {
	it('rewrites { label, value } into n8n { name, value }', () => {
		expect(
			buildVariableSelectOptions([
				{ label: 'Test (image slideshow)', value: 'slideshow' },
				{ label: 'Final video (avatar video)', value: 'video' },
			]),
		).toEqual([
			{ name: 'Test (image slideshow)', value: 'slideshow' },
			{ name: 'Final video (avatar video)', value: 'video' },
		]);
	});

	it('keeps numeric-looking values as the strings the API sends', () => {
		// Real template: volume presets whose values are "0", "0.05", "1".
		expect(
			buildVariableSelectOptions([
				{ label: 'Muted', value: '0' },
				{ label: 'Normal', value: '1' },
			]),
		).toEqual([
			{ name: 'Muted', value: '0' },
			{ name: 'Normal', value: '1' },
		]);
	});

	it('falls back to the value when there is no label, and skips unusable entries', () => {
		expect(
			buildVariableSelectOptions([
				{ value: 'slideshow' },
				{ label: 'No value here' },
				{ label: '', value: '' },
				'not an object',
			]),
		).toEqual([{ name: 'slideshow', value: 'slideshow' }]);
	});

	it('returns an empty list for a malformed payload', () => {
		expect(buildVariableSelectOptions(undefined)).toEqual([]);
		expect(buildVariableSelectOptions('nope')).toEqual([]);
	});
});

describe('buildTemplateVariableFields', () => {
	it('renders one field per variable, labelled by the template and keyed by the raw name', () => {
		expect(
			buildTemplateVariableFields([
				{ name: 'quote', label: 'Quote', type: 'text', default: 'This is my quote today' },
				{ name: 'author', label: 'Author', type: 'text', default: 'John Doe' },
			]),
		).toEqual([
			{
				id: 'quote',
				displayName: 'Quote',
				required: false,
				defaultMatch: false,
				canBeUsedToMatch: false,
				display: true,
				removed: false,
				type: 'string',
				defaultValue: 'This is my quote today',
			},
			{
				id: 'author',
				displayName: 'Author',
				required: false,
				defaultMatch: false,
				canBeUsedToMatch: false,
				display: true,
				removed: false,
				type: 'string',
				defaultValue: 'John Doe',
			},
		]);
	});

	it('falls back to the raw name when the template has no label', () => {
		const fields = buildTemplateVariableFields([
			{ name: 'headline', type: 'text' },
			{ name: 'price', label: '  ', type: 'number' },
		]);

		expect(fields.map((field) => field.displayName)).toEqual(['headline', 'price']);
		expect(fields.map((field) => field.id)).toEqual(['headline', 'price']);
	});

	it('drops the two Make.com variables the API injects into every template', () => {
		const fields = buildTemplateVariableFields([
			{ name: 'make_webhook_url', advanced: true, type: 'text', label: 'Webhook URL' },
			{ name: 'quote', label: 'Quote', type: 'text' },
			{ name: 'client_data', advanced: true, type: 'array', label: 'Client data', spec: [] },
		]);

		expect(fields.map((field) => field.id)).toEqual(['quote']);
	});

	it('keeps a real template variable that happens to be advanced', () => {
		const fields = buildTemplateVariableFields([
			{ name: 'debugMode', label: 'Debug Mode', advanced: true, type: 'text' },
		]);

		expect(fields.map((field) => field.id)).toEqual(['debugMode']);
	});

	it('turns a select variable into a dropdown carrying its allowed values', () => {
		const [field] = buildTemplateVariableFields([
			{
				name: 'renderMode',
				label: 'Render Mode',
				type: 'select',
				options: [
					{ label: 'Test (image slideshow)', value: 'slideshow' },
					{ label: 'Final video (avatar video)', value: 'video' },
				],
				default: 'video',
				validate: false,
				dynamic: true,
			},
		]);

		expect(field.type).toBe('options');
		expect(field.options).toEqual([
			{ name: 'Test (image slideshow)', value: 'slideshow' },
			{ name: 'Final video (avatar video)', value: 'video' },
		]);
		expect(field.defaultValue).toBe('video');
	});

	it('degrades a select with no usable choices to a text box', () => {
		const [field] = buildTemplateVariableFields([
			{ name: 'broken', label: 'Broken', type: 'select', options: [], default: 'x' },
		]);

		expect(field.type).toBe('string');
		expect(field.options).toBeUndefined();
		expect(field.defaultValue).toBe('x');
	});

	it('gives array and collection variables a JSON editor and no junk default', () => {
		const [scenes, voice] = buildTemplateVariableFields([
			{
				name: 'scenes',
				label: 'Scenes',
				type: 'array',
				help: 'Organize the content of your reel in scenes',
				spec: [
					{ name: 'layoutStyle', label: 'Layout Style', type: 'text' },
					{ name: 'voiceoverText', label: 'Voiceover Text', type: 'text' },
				],
				// The Make-shaped payload stringifies nested defaults.
				default: '[object Object],[object Object]',
			},
			{
				name: 'voice1',
				label: 'Voice1',
				type: 'collection',
				spec: [{ name: 'model', type: 'text' }],
				default: '[object Object]',
			},
		]);

		expect(scenes.type).toBe('array');
		expect(scenes.displayName).toBe('Scenes');
		expect(scenes.defaultValue).toBeUndefined();
		expect(voice.type).toBe('object');
		expect(voice.defaultValue).toBeUndefined();
	});

	it('coerces the stringified defaults of number and boolean variables', () => {
		const [weight, flip] = buildTemplateVariableFields([
			{ name: 'titleWeight', label: 'Title Weight', type: 'number', default: '600' },
			{ name: 'flip_horizontally', label: 'Flip Horizontally', type: 'boolean', default: 'false' },
		]);

		expect(weight.type).toBe('number');
		expect(weight.defaultValue).toBe(600);
		expect(flip.type).toBe('boolean');
		expect(flip.defaultValue).toBe(false);
	});

	it('keeps an unknown type visible as a text box', () => {
		const fields = buildTemplateVariableFields([
			{ name: 'video_URL', label: 'Video URL', type: 'url', default: '' },
			{ name: 'brandColor', label: 'Brand Color', type: 'colorpicker' },
			{ name: 'mystery', label: 'Mystery' },
		]);

		expect(fields.map((field) => field.id)).toEqual(['video_URL', 'brandColor', 'mystery']);
		expect(fields.every((field) => field.type === 'string')).toBe(true);
	});

	it('honours the rare required flag and leaves everything else optional', () => {
		const [video, audio] = buildTemplateVariableFields([
			{ name: 'video_URL', label: 'Video URL', type: 'url', required: true, default: '' },
			{ name: 'audio_URL', label: 'Audio URL', type: 'url', default: '' },
		]);

		expect(video.required).toBe(true);
		expect(audio.required).toBe(false);
	});

	it('never marks a variable as a matching column: there is no record to match', () => {
		const fields = buildTemplateVariableFields([
			{ name: 'quote', label: 'Quote', type: 'text' },
			{ name: 'scenes', label: 'Scenes', type: 'array' },
		]);

		for (const field of fields) {
			expect(field.defaultMatch).toBe(false);
			expect(field.canBeUsedToMatch).toBe(false);
			expect(field.display).toBe(true);
			expect(field.removed).toBe(false);
		}
	});

	it("keeps the template's own declared order, nested variables included", () => {
		// 0.3.0's dropdown pushed array/collection entries to the bottom because the
		// key/value UI could not send JSON. Every type now has a working widget, so
		// the author's order is what the form shows.
		const fields = buildTemplateVariableFields([
			{ name: 'scenes', type: 'array' },
			{ name: 'quote', type: 'text' },
			{ name: 'voice1', type: 'collection' },
			{ name: 'titleWeight', type: 'number' },
			{ name: 'textTransform', type: 'select', options: [{ label: 'Up', value: 'uppercase' }] },
		]);

		expect(fields.map((field) => field.id)).toEqual([
			'scenes',
			'quote',
			'voice1',
			'titleWeight',
			'textTransform',
		]);
	});

	it('returns an empty list for a template with no variables or a malformed payload', () => {
		expect(buildTemplateVariableFields([])).toEqual([]);
		expect(buildTemplateVariableFields(undefined)).toEqual([]);
		expect(buildTemplateVariableFields('nope')).toEqual([]);
		expect(buildTemplateVariableFields([{ label: 'No name at all', type: 'text' }])).toEqual([]);
	});
});

// Template: Get Variables output shape (Appendix D / D10). Reuses the same
// `format=make` mapping the Variables resourceMapper uses
// (`templateVariableFieldType`, `coerceVariableDefault`,
// `buildVariableSelectOptions`), so these tests focus on what is different
// about the flat, discovery-oriented shape rather than re-testing the shared
// helpers (already covered above).
describe('buildTemplateVariableDescriptor', () => {
	it('maps the minimum shape: name, label, type', () => {
		expect(
			buildTemplateVariableDescriptor({ name: 'quote', label: 'Quote', type: 'text' }),
		).toEqual({ name: 'quote', label: 'Quote', type: 'text' });
	});

	it('falls back to the raw name when there is no label', () => {
		expect(buildTemplateVariableDescriptor({ name: 'headline', type: 'text' })).toEqual({
			name: 'headline',
			label: 'headline',
			type: 'text',
		});
	});

	it('defaults a missing type to "text", matching the resourceMapper\'s text-box fallback', () => {
		expect(buildTemplateVariableDescriptor({ name: 'mystery', label: 'Mystery' })).toEqual({
			name: 'mystery',
			label: 'Mystery',
			type: 'text',
		});
	});

	it('keeps an unrecognised type verbatim rather than rewriting it', () => {
		// `url` is real (observed live) and is not in the resourceMapper's type table.
		expect(
			buildTemplateVariableDescriptor({ name: 'video_URL', label: 'Video URL', type: 'url' }),
		).toEqual({ name: 'video_URL', label: 'Video URL', type: 'url' });
	});

	it('returns undefined for a descriptor with no name', () => {
		expect(buildTemplateVariableDescriptor({ label: 'No name at all', type: 'text' })).toBeUndefined();
	});

	it('includes help only when the template set it', () => {
		expect(
			buildTemplateVariableDescriptor({
				name: 'scenes',
				label: 'Scenes',
				type: 'array',
				help: 'Organize the content of your reel in scenes',
			}),
		).toMatchObject({ help: 'Organize the content of your reel in scenes' });

		expect(buildTemplateVariableDescriptor({ name: 'quote', label: 'Quote', type: 'text' })).not.toHaveProperty(
			'help',
		);
	});

	it('includes required only when true, never as an explicit false', () => {
		expect(
			buildTemplateVariableDescriptor({ name: 'video_URL', type: 'url', required: true }),
		).toMatchObject({ required: true });

		expect(
			buildTemplateVariableDescriptor({ name: 'audio_URL', type: 'url', required: false }),
		).not.toHaveProperty('required');

		expect(buildTemplateVariableDescriptor({ name: 'audio_URL', type: 'url' })).not.toHaveProperty(
			'required',
		);
	});

	it('coerces number and boolean defaults back to their real type, like the resourceMapper', () => {
		expect(
			buildTemplateVariableDescriptor({ name: 'titleWeight', type: 'number', default: '600' }),
		).toMatchObject({ default: 600 });

		expect(
			buildTemplateVariableDescriptor({
				name: 'flip_horizontally',
				type: 'boolean',
				default: 'false',
			}),
		).toMatchObject({ default: false });
	});

	it('drops the junk stringified-object default for array/collection, same as the resourceMapper', () => {
		expect(
			buildTemplateVariableDescriptor({
				name: 'scenes',
				type: 'array',
				default: '[object Object],[object Object]',
			}),
		).not.toHaveProperty('default');
	});

	it('gives a select variable its rewritten { name, value } options', () => {
		expect(
			buildTemplateVariableDescriptor({
				name: 'renderMode',
				label: 'Render Mode',
				type: 'select',
				options: [
					{ label: 'Test (image slideshow)', value: 'slideshow' },
					{ label: 'Final video (avatar video)', value: 'video' },
				],
				default: 'video',
			}),
		).toEqual({
			name: 'renderMode',
			label: 'Render Mode',
			type: 'select',
			default: 'video',
			options: [
				{ name: 'Test (image slideshow)', value: 'slideshow' },
				{ name: 'Final video (avatar video)', value: 'video' },
			],
		});
	});

	it('omits options for a select with no usable choices, but keeps the type as select', () => {
		expect(
			buildTemplateVariableDescriptor({ name: 'broken', type: 'select', options: [] }),
		).toEqual({ name: 'broken', label: 'broken', type: 'select' });
	});

	it('recurses into spec for array/collection variables, one level deep', () => {
		const descriptor = buildTemplateVariableDescriptor({
			name: 'scenes',
			label: 'Scenes',
			type: 'array',
			spec: [
				{ name: 'layoutStyle', label: 'Layout Style', type: 'text' },
				{ name: 'voiceoverText', label: 'Voiceover Text', type: 'text', help: 'Spoken text' },
			],
		});

		expect(descriptor?.spec).toEqual([
			{ name: 'layoutStyle', label: 'Layout Style', type: 'text' },
			{ name: 'voiceoverText', label: 'Voiceover Text', type: 'text', help: 'Spoken text' },
		]);
	});

	it('omits spec when the nested list is empty or absent', () => {
		expect(buildTemplateVariableDescriptor({ name: 'voice1', type: 'collection' })).not.toHaveProperty(
			'spec',
		);
		expect(
			buildTemplateVariableDescriptor({ name: 'voice1', type: 'collection', spec: [] }),
		).not.toHaveProperty('spec');
	});
});

describe('buildTemplateVariableList', () => {
	it('returns one descriptor per variable, in the template\'s own order', () => {
		expect(
			buildTemplateVariableList([
				{ name: 'quote', label: 'Quote', type: 'text', default: 'Ship it' },
				{ name: 'author', label: 'Author', type: 'text', default: 'John Doe' },
			]),
		).toEqual([
			{ name: 'quote', label: 'Quote', type: 'text', default: 'Ship it' },
			{ name: 'author', label: 'Author', type: 'text', default: 'John Doe' },
		]);
	});

	it('drops the two Make.com variables the API injects into every template', () => {
		const list = buildTemplateVariableList([
			{ name: 'make_webhook_url', advanced: true, type: 'text', label: 'Webhook URL' },
			{ name: 'quote', label: 'Quote', type: 'text' },
			{ name: 'client_data', advanced: true, type: 'array', label: 'Client data', spec: [] },
		]);

		expect(list.map((variable) => variable.name)).toEqual(['quote']);
	});

	it('honours the rare required flag', () => {
		const [video, audio] = buildTemplateVariableList([
			{ name: 'video_URL', label: 'Video URL', type: 'url', required: true },
			{ name: 'audio_URL', label: 'Audio URL', type: 'url' },
		]);

		expect(video.required).toBe(true);
		expect(audio.required).toBeUndefined();
	});

	it('returns an empty list for a template with no variables or a malformed payload', () => {
		expect(buildTemplateVariableList([])).toEqual([]);
		expect(buildTemplateVariableList(undefined)).toEqual([]);
		expect(buildTemplateVariableList('nope')).toEqual([]);
		expect(buildTemplateVariableList([{ label: 'No name at all', type: 'text' }])).toEqual([]);
	});
});

describe('extractMappedVariables', () => {
	const schema = [
		{ id: 'quote', displayName: 'Quote', type: 'string', display: true },
		{ id: 'author', displayName: 'Author', type: 'string', display: true },
		{ id: 'titleWeight', displayName: 'Title Weight', type: 'number', display: true },
	];

	it('sends the values of the fields the user filled in (defineBelow)', () => {
		expect(
			extractMappedVariables(
				{
					mappingMode: 'defineBelow',
					value: { quote: 'Ship it', author: 'Anon', titleWeight: 600 },
					matchingColumns: [],
					schema,
				},
				{},
			),
		).toEqual({ quote: 'Ship it', author: 'Anon', titleWeight: 600 });
	});

	it('preserves the types the typed widgets produce', () => {
		expect(
			extractMappedVariables(
				{
					mappingMode: 'defineBelow',
					value: { titleWeight: 600, enabled: false, ratio: 0, blank: '' },
					schema: [],
				},
				{},
			),
		).toEqual({ titleWeight: 600, enabled: false, ratio: 0, blank: '' });
	});

	it('skips fields left empty, which n8n represents as null', () => {
		expect(
			extractMappedVariables(
				{ mappingMode: 'defineBelow', value: { quote: 'Ship it', author: null }, schema },
				{},
			),
		).toEqual({ quote: 'Ship it' });
	});

	it('takes the matching keys of the incoming item (autoMapInputData)', () => {
		expect(
			extractMappedVariables(
				{ mappingMode: 'autoMapInputData', value: null, matchingColumns: [], schema },
				{ quote: 'From the item', titleWeight: 700, unrelated: 'ignored' },
			),
		).toEqual({ quote: 'From the item', titleWeight: 700 });
	});

	it('ignores schema fields the item does not carry, and null item values', () => {
		expect(
			extractMappedVariables(
				{ mappingMode: 'autoMapInputData', value: null, schema },
				{ quote: 'Only this one', author: null },
			),
		).toEqual({ quote: 'Only this one' });
	});

	it('sends nothing in autoMapInputData mode when the schema could not be loaded', () => {
		// Without a schema there is nothing to match on, and guessing would turn
		// every unrelated item field into a template variable.
		expect(
			extractMappedVariables(
				{ mappingMode: 'autoMapInputData', value: null, schema: [] },
				{ quote: 'Ship it' },
			),
		).toEqual({});
	});

	it('treats a missing mappingMode as defineBelow', () => {
		expect(extractMappedVariables({ value: { quote: 'Ship it' } }, {})).toEqual({
			quote: 'Ship it',
		});
	});

	it('returns an empty object for an untouched or malformed parameter', () => {
		expect(extractMappedVariables(undefined, {})).toEqual({});
		expect(extractMappedVariables('nope', {})).toEqual({});
		expect(extractMappedVariables({}, {})).toEqual({});
		expect(extractMappedVariables({ mappingMode: 'defineBelow', value: null }, {})).toEqual({});
		expect(
			extractMappedVariables({ mappingMode: 'autoMapInputData', schema }, undefined),
		).toEqual({});
	});
});
