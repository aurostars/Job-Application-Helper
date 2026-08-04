import { copyFileSync, mkdirSync, existsSync, readdirSync, cpSync } from 'fs';
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

  // 复制 PDF.js worker 文件
  const pdfWorkerSrc = join(projectRoot, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
  const pdfWorkerDest = join(distDir, 'pdf.worker.min.js');

  if (existsSync(pdfWorkerSrc)) {
    copyFileSync(pdfWorkerSrc, pdfWorkerDest);
    console.log('✓ PDF.js worker copied to dist/');
  } else {
    console.warn('⚠ PDF.js worker not found, PDF parsing may not work');
  }

  // 复制 PDF.js 中文字体与 CMap 资源
  const pdfCmapsSrc = join(projectRoot, 'node_modules', 'pdfjs-dist', 'cmaps');
  const pdfCmapsDest = join(distDir, 'cmaps');
  if (existsSync(pdfCmapsSrc)) {
    cpSync(pdfCmapsSrc, pdfCmapsDest, { recursive: true });
    console.log('✓ PDF.js cmaps copied to dist/cmaps/');
  } else {
    console.warn('⚠ PDF.js cmaps not found, CJK PDF parsing may not work');
  }

  const pdfStandardFontsSrc = join(projectRoot, 'node_modules', 'pdfjs-dist', 'standard_fonts');
  const pdfStandardFontsDest = join(distDir, 'standard_fonts');
  if (existsSync(pdfStandardFontsSrc)) {
    cpSync(pdfStandardFontsSrc, pdfStandardFontsDest, { recursive: true });
    console.log('✓ PDF.js standard fonts copied to dist/standard_fonts/');
  } else {
    console.warn('⚠ PDF.js standard fonts not found, some PDF fonts may not work');
  }

  console.log('\n✅ 构建完成！可以加载 dist/ 目录到浏览器。');
} catch (error) {
  console.error('构建后处理失败:', error);
  process.exit(1);
}
