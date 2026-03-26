import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];

const globsByTarget = {
  api: [
    'tests/unit/bootstrap/createDiContainer.test.ts',
    'tests/integration/apiDispatch.test.ts',
    'tests/integration/adminApiControllers.test.ts',
    'tests/integration/adminApiRoutes.test.ts',
    'tests/integration/adaptationApi.test.ts',
    'tests/integration/adaptiveControlApi.test.ts',
  ],
  worker: [],
  'grits-worker': ['apps/grits-worker/src'],
  'persistence-pg': ['tests/unit/persistence'],
};

if (!target || !(target in globsByTarget)) {
  console.error(`[run-package-tests] Unknown target "${target ?? ''}"`);
  console.error(`[run-package-tests] Expected one of: ${Object.keys(globsByTarget).join(', ')}`);
  process.exit(1);
}

if (globsByTarget[target].length === 0) {
  console.log(`[run-package-tests] No explicit test globs configured for ${target}; treating as pass.`);
  process.exit(0);
}

const args = [
  'exec',
  'vitest',
  'run',
  '--config',
  'vitest.config.ts',
  '--passWithNoTests',
  ...globsByTarget[target],
];

const result = spawnSync('pnpm', args, {
  cwd: workspaceRoot,
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
