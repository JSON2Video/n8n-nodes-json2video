import { describe, expect, it } from 'vitest';

import {
	applyClientSideLimit,
	buildDeleteTemplateResponse,
	buildTemplateBody,
	buildTemplateVariableOptions,
	collectSortedTags,
	extractTemplateId,
	parseTagsParameter,
	templateHasTag,
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
// live against 20 real templates on 2026-07-30.
describe('buildTemplateVariableOptions', () => {
	it('labels an option with the human label plus the raw name, and values it with the raw name', () => {
		expect(
			buildTemplateVariableOptions([
				{ name: 'quote', label: 'Quote', type: 'text', default: 'This is my quote today' },
			]),
		).toEqual([
			{
				name: 'Quote (quote)',
				value: 'quote',
				description: 'Type: text. Default: "This is my quote today".',
			},
		]);
	});

	it('falls back to the raw name when there is no label, or the label repeats it', () => {
		const options = buildTemplateVariableOptions([
			{ name: 'headline', type: 'text' },
			{ name: 'price', label: '  ', type: 'number' },
			{ name: 'subtitle', label: 'subtitle', type: 'text' },
		]);

		expect(options.map((option) => option.name)).toEqual(['headline', 'price', 'subtitle']);
	});

	it('drops the two Make.com variables the API injects into every template', () => {
		const options = buildTemplateVariableOptions([
			{ name: 'make_webhook_url', advanced: true, type: 'text', label: 'Webhook URL' },
			{ name: 'quote', label: 'Quote', type: 'text' },
			{ name: 'client_data', advanced: true, type: 'array', label: 'Client data', spec: [] },
		]);

		expect(options.map((option) => option.value)).toEqual(['quote']);
	});

	it('keeps a real template variable that happens to be advanced', () => {
		const options = buildTemplateVariableOptions([
			{ name: 'debugMode', label: 'Debug Mode', advanced: true, type: 'text' },
		]);

		expect(options.map((option) => option.value)).toEqual(['debugMode']);
	});

	it('lists the allowed values of a select variable', () => {
		const [option] = buildTemplateVariableOptions([
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

		expect(option.name).toBe('Render Mode (renderMode)');
		expect(option.description).toBe(
			'Type: select. Allowed values: slideshow, video. Default: "video".',
		);
	});

	it('says a nested variable needs JSON and names its sub-fields', () => {
		const [scenes, voice] = buildTemplateVariableOptions([
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
				spec: [{ name: 'enabled', type: 'boolean' }, { name: 'model', type: 'text' }],
				default: '[object Object]',
			},
		]);

		expect(scenes.description).toBe(
			'Type: array — the value must be JSON. Sub-fields: layoutStyle, voiceoverText. Organize the content of your reel in scenes.',
		);
		expect(voice.description).toBe(
			'Type: collection — the value must be JSON. Sub-fields: enabled, model.',
		);
	});

	it('sorts scalar variables first and JSON-only ones last, keeping template order inside each group', () => {
		const options = buildTemplateVariableOptions([
			{ name: 'scenes', type: 'array' },
			{ name: 'quote', type: 'text' },
			{ name: 'voice1', type: 'collection' },
			{ name: 'titleWeight', type: 'number' },
			{ name: 'textTransform', type: 'select' },
		]);

		expect(options.map((option) => option.value)).toEqual([
			'quote',
			'titleWeight',
			'textTransform',
			'scenes',
			'voice1',
		]);
	});

	it('handles an unknown or missing type without hiding the variable', () => {
		const options = buildTemplateVariableOptions([
			{ name: 'brandColor', label: 'Brand Color', type: 'colorpicker' },
			{ name: 'mystery', label: 'Mystery' },
		]);

		expect(options).toEqual([
			{ name: 'Brand Color (brandColor)', value: 'brandColor', description: 'Type: colorpicker.' },
			{ name: 'Mystery (mystery)', value: 'mystery', description: 'Type: unknown.' },
		]);
	});

	it('appends the template author help text as a sentence', () => {
		const [withStop, withoutStop] = buildTemplateVariableOptions([
			{ name: 'a', type: 'text', help: 'Already a sentence.' },
			{ name: 'b', type: 'text', help: 'No full stop here' },
		]);

		expect(withStop.description).toBe('Type: text. Already a sentence.');
		expect(withoutStop.description).toBe('Type: text. No full stop here.');
	});

	it('truncates a very long default and keeps numbers and booleans readable', () => {
		const [long, number, boolean] = buildTemplateVariableOptions([
			{ name: 'imagePrompt', type: 'text', default: 'x'.repeat(200) },
			{ name: 'weight', type: 'number', default: 600 },
			{ name: 'enabled', type: 'boolean', default: false },
		]);

		expect(long.description).toBe(`Type: text. Default: "${'x'.repeat(60)}…".`);
		// Numbers and booleans are printed unquoted, so a default of 600 does not
		// read as the string "600".
		expect(number.description).toBe('Type: number. Default: 600.');
		expect(boolean.description).toBe('Type: boolean. Default: false.');
	});

	it('omits an empty default rather than printing empty quotes', () => {
		const [option] = buildTemplateVariableOptions([{ name: 'quote', type: 'text', default: '  ' }]);
		expect(option.description).toBe('Type: text.');
	});

	it('returns an empty list for a template with no variables or a malformed payload', () => {
		expect(buildTemplateVariableOptions([])).toEqual([]);
		expect(buildTemplateVariableOptions(undefined)).toEqual([]);
		expect(buildTemplateVariableOptions('nope')).toEqual([]);
		expect(buildTemplateVariableOptions([{ label: 'No name at all', type: 'text' }])).toEqual([]);
	});
});
