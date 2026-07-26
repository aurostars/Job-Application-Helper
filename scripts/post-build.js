import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = join(__dirname, '..');
const distDir = join(projectRoot, 'dist');

try {
  // 复制 manifest.json
  const manifestSrc = join(projectRoot, 'manifest.json');
  const manifestDest = join(distDir, 'manifest.json');
  copyFileSync(manifestSrc, manifestDest);
  console.log('✓ manifest.json copied to dist/');

  // 复制 icons
  const iconsSrcDir = join(projectRoot, 'public', 'icons');
  const iconsDestDir = join(distDir, 'icons');

  if (!existsSync(iconsDestDir)) {
    mkdirSync(iconsDestDir, { recursive: true });
  }

  if (existsSync(iconsSrcDir)) {
    const iconFiles = readdirSync(iconsSrcDir).filter(f => f.endsWith('.png'));
    for (const file of iconFiles) {
      copyFileSync(join(iconsSrcDir, file), join(iconsDestDir, file));
    }
    console.log(`✓ ${iconFiles.length} icon files copied to dist/icons/`);
  }

  console.log('\n✅ 构建完成！可以加载 dist/ 目录到浏览器。');
} catch (error) {
  console.error('构建后处理失败:', error);
  process.exit(1);
}
