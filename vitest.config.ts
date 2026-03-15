import { defineConfig } from 'vitest/config';
import path from 'node:path';

const resolve = (pkg: string) =>
  path.resolve(__dirname, `packages/${pkg}/src/index.ts`);

export default defineConfig({
  resolve: {
    alias: {
      '@acds/core-types': resolve('core-types'),
      '@acds/security': resolve('security'),
      '@acds/audit-ledger': resolve('audit-ledger'),
      '@acds/provider-adapters': resolve('provider-adapters'),
      '@acds/provider-broker': resolve('provider-broker'),
      '@acds/policy-engine': resolve('policy-engine'),
      '@acds/routing-engine': resolve('routing-engine'),
      '@acds/execution-orchestrator': resolve('execution-orchestrator'),
      '@acds/sdk': resolve('sdk'),
      '@acds/evaluation': resolve('evaluation'),
      '@acds/adaptive-optimizer': resolve('adaptive-optimizer'),
      '@acds/shared-utils': resolve('shared-utils'),
    },
  },
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
  },
});
