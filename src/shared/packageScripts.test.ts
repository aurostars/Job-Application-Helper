import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '../..');

async function readJson(filePath: string) {
  return JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>;
}

test('npm test 使用仓库内受版本控制的 tsx 依赖，而不是 npx 临时下载', async () => {
  const packageJson = await readJson(path.join(repoRoot, 'package.json')) as {
    scripts?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const packageLock = await readJson(path.join(repoRoot, 'package-lock.json')) as {
    packages?: Record<string, { devDependencies?: Record<string, string> }>;
  };

  assert.equal(typeof packageJson.scripts?.test, 'string');
  assert.doesNotMatch(packageJson.scripts!.test, /\bnpx\b/);
  assert.match(packageJson.scripts!.test, /\bnpm run test:sidepanel\b/);
  assert.equal(typeof packageJson.scripts?.['test:sidepanel'], 'string');
  assert.match(packageJson.scripts!['test:sidepanel'], /\btsx\b/);
  assert.doesNotMatch(packageJson.scripts!['test:sidepanel'], /\bnpx\b/);
  assert.ok(packageJson.devDependencies?.tsx, 'package.json 应声明 tsx 为 devDependency');
  assert.equal(
    packageLock.packages?.['']?.devDependencies?.tsx,
    packageJson.devDependencies?.tsx
  );
  assert.ok(packageLock.packages?.['node_modules/tsx'], 'package-lock.json 应锁定 node_modules/tsx');
});
