import { describe, expect, it } from 'vitest';

import {
	applyClientSideLimit,
	buildDeleteTemplateResponse,
	buildTemplateBody,
	collectSortedTags,
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
