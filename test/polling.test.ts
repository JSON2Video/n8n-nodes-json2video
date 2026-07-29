import { describe, expect, it } from 'vitest';

import {
	clampPollInterval,
	clampTimeout,
	computePollInterval,
	DEFAULT_POLL_INTERVAL_SECONDS,
	DEFAULT_TIMEOUT_SECONDS,
} from '../nodes/Json2Video/helpers/polling';

describe('computePollInterval', () => {
	it('follows the documented backoff tiers for the default 5 s interval', () => {
		// One sample inside every 60 s tier, per operations.md → Render and Wait.
		const samples: Array<[number, number]> = [
			[0, 5],
			[59, 5],
			[60, 8],
			[119, 8],
			[120, 11],
			[179, 11],
			[180, 17],
			[239, 17],
			[240, 25],
			[299, 25],
			[300, 30],
			[3599, 30],
		];

		for (const [elapsed, expected] of samples) {
			expect(computePollInterval(5, elapsed)).toBe(expected);
		}
	});

	it('produces the documented interval sequence 5, 8, 11, 17, 25, 30', () => {
		const tiers = [0, 60, 120, 180, 240, 300].map((elapsed) => computePollInterval(5, elapsed));
		expect(tiers).toEqual([5, 8, 11, 17, 25, 30]);
	});

	it('never polls faster than the documented 5 s minimum', () => {
		expect(computePollInterval(1, 0)).toBe(5);
		expect(computePollInterval(0, 0)).toBe(5);
		expect(computePollInterval(-10, 0)).toBe(5);
	});

	it('never speeds up an interval the user deliberately set above the cap', () => {
		expect(computePollInterval(60, 0)).toBe(60);
		expect(computePollInterval(60, 600)).toBe(60);
	});

	it('treats invalid elapsed values as zero elapsed time', () => {
		expect(computePollInterval(5, Number.NaN)).toBe(5);
		expect(computePollInterval(5, -30)).toBe(5);
	});
});

describe('clampPollInterval', () => {
	it('clamps to the documented 5-300 s range', () => {
		expect(clampPollInterval(1)).toBe(5);
		expect(clampPollInterval(5)).toBe(5);
		expect(clampPollInterval(42)).toBe(42);
		expect(clampPollInterval(1000)).toBe(300);
	});

	it('falls back to the default when the value is not a number', () => {
		expect(clampPollInterval(Number.NaN)).toBe(DEFAULT_POLL_INTERVAL_SECONDS);
	});
});

describe('clampTimeout', () => {
	it('clamps to the documented 30-3600 s range', () => {
		expect(clampTimeout(1)).toBe(30);
		expect(clampTimeout(600)).toBe(600);
		expect(clampTimeout(99999)).toBe(3600);
	});

	it('falls back to the default when the value is not a number', () => {
		expect(clampTimeout(Number.NaN)).toBe(DEFAULT_TIMEOUT_SECONDS);
	});
});
