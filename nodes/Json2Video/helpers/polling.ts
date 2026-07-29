// Polling design for Movie → Render and Wait. Kept as pure functions so the
// backoff can be unit-tested without an n8n runtime.
// Contract: `integrations/shared/operations.md` → "Movie — Render and Wait".

/** Documented hard minimum: never poll a render faster than every 5 seconds. */
export const MIN_POLL_INTERVAL_SECONDS = 5;
export const MAX_POLL_INTERVAL_SECONDS = 300;
export const DEFAULT_POLL_INTERVAL_SECONDS = 5;

/** Ceiling the backoff converges to, in seconds. */
export const POLL_INTERVAL_CAP_SECONDS = 30;

export const MIN_TIMEOUT_SECONDS = 30;
export const MAX_TIMEOUT_SECONDS = 3600;
export const DEFAULT_TIMEOUT_SECONDS = 600;

/** Consecutive transient poll failures tolerated before giving up. */
export const MAX_CONSECUTIVE_POLL_FAILURES = 3;

function clamp(value: number, min: number, max: number, fallback: number): number {
	if (!Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, value));
}

export function clampPollInterval(seconds: number): number {
	return clamp(seconds, MIN_POLL_INTERVAL_SECONDS, MAX_POLL_INTERVAL_SECONDS, DEFAULT_POLL_INTERVAL_SECONDS);
}

export function clampTimeout(seconds: number): number {
	return clamp(seconds, MIN_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS, DEFAULT_TIMEOUT_SECONDS);
}

/**
 * Gentle backoff: the effective interval grows one tier every 60 seconds of
 * elapsed wait and is capped at 30 seconds.
 *
 *   tier     = floor(elapsedSeconds / 60)
 *   interval = min(30, round(baseInterval * 1.5 ^ tier))
 *
 * With the default base interval of 5 s: 5, 8, 11, 17, 25, 30, 30…
 *
 * The 30 s cap only ever slows polling down: a user who deliberately picked an
 * interval above the cap keeps their own interval (the catalogue formula taken
 * literally would speed them back up to 30 s, which is not what they asked for).
 */
export function computePollInterval(baseIntervalSeconds: number, elapsedSeconds: number): number {
	const base = clampPollInterval(baseIntervalSeconds);
	const elapsed = Number.isFinite(elapsedSeconds) && elapsedSeconds > 0 ? elapsedSeconds : 0;
	const tier = Math.floor(elapsed / 60);
	const backedOff = Math.min(POLL_INTERVAL_CAP_SECONDS, Math.round(base * Math.pow(1.5, tier)));
	return Math.max(base, backedOff);
}
