import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const checks = [
  {
    packageDir: 'apps/api',
    resolves: ['@acds/core-types/package.json', '@acds/persistence-pg/package.json'],
  },
  {
    packageDir: 'apps/worker',
    resolves: ['@acds/execution-orchestrator/package.json', '@acds/persistence-pg/package.json'],
  },
  {
    packageDir: 'apps/grits-worker',
    resolves: ['@acds/grits/package.json', '@acds/persistence-pg/package.json'],
  },
  {
    packageDir: 'tests',
    resolves: ['@acds/provider-broker/package.json', '@acds/routing-engine/package.json'],
  },
];

function assertExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Expected path does not exist: ${filePath}`);
  }
}

for (const check of checks) {
  const packageJsonPath = path.join(workspaceRoot, check.packageDir, 'package.json');
  assertExists(packageJsonPath);
  const requireFromPackage = createRequire(packageJsonPath);

  console.log(`[verify:install] Checking ${check.packageDir}`);

  for (const request of check.resolves) {
    const resolved = requireFromPackage.resolve(request);
    assertExists(resolved);
    console.log(`[verify:install]   resolved ${request} -> ${path.relative(workspaceRoot, resolved)}`);
  }
}

console.log('[verify:install] Workspace dependency resolution succeeded.');
console.log('[verify:install] Next step: pnpm typecheck');
