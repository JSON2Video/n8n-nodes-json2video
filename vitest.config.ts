import { defineConfig } from 'vitest/config';

export default defineConfig({
	// `logLevel: 'error'` silences Vite's "Sourcemap points to missing source
	// files" warnings: `n8n-workflow` ships source maps without their sources.
	// Test results come from Vitest's own reporter and are unaffected.
	logLevel: 'error',
	test: {
		include: ['test/**/*.test.ts'],
		environment: 'node',
	},
});
