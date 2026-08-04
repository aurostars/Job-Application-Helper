import { existsSync, mkdirSync, rmSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = join(__dirname, '..');
const distDir = join(projectRoot, 'dist');
const releaseDir = join(projectRoot, 'release');
const zipFile = join(releaseDir, 'job-application-helper-extension.zip');

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
  fail('未找到 dist/ 目录，请先运行 npm run build。');
}

if (!existsSync(releaseDir)) {
  mkdirSync(releaseDir, { recursive: true });
}

if (existsSync(zipFile)) {
  rmSync(zipFile, { force: true });
}

function run(command, args) {
  return spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
  });
}

function tryZip() {
  const result = spawnSync('zip', ['-r', zipFile, '.', '-x', '*.DS_Store', '__MACOSX/*'], {
    cwd: distDir,
    stdio: 'inherit',
  });
  return result.status === 0;
}

function tryPowerShell() {
  const psCommand = [
    'Compress-Archive',
    '-Path', `"${join(distDir, '*')}"`,
    '-DestinationPath', `"${zipFile}"`,
    '-Force',
  ].join(' ');

  const result = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand],
    {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: true,
    }
  );

  return result.status === 0;
}

console.log('== 打包浏览器扩展压缩包 ==');

const packed = tryZip() || tryPowerShell();

if (!packed) {
  fail('打包失败：未找到可用的压缩工具。请在 macOS 使用 zip，或在 Windows 使用 PowerShell Compress-Archive。');
}

console.log('\n打包完成。');
console.log(`压缩包位置：${zipFile}`);
console.log('注意：浏览器不能直接加载 zip，请先解压，再选择解压后的目录进行“加载已解压的扩展程序”。');
