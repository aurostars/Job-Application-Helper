import { createCanvas, loadImage } from 'canvas';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const iconsDir = join(__dirname, '..', 'public', 'icons');
const sourceIcon = join(iconsDir, 'job-application-autofill-icon.svg');

if (!existsSync(iconsDir)) {
  mkdirSync(iconsDir, { recursive: true });
}

async function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const image = await loadImage(sourceIcon);
  ctx.drawImage(image, 0, 0, size, size);
  return canvas.toBuffer('image/png');
}

// 从设计源文件生成清单使用的各尺寸图标
const sizes = [16, 32, 48, 128];

for (const size of sizes) {
  const buffer = await generateIcon(size);
  const filePath = join(iconsDir, `icon${size}.png`);
  writeFileSync(filePath, buffer);
  console.log(`✓ Generated icon${size}.png (${size}x${size})`);
}

console.log('\n图标生成完成！');
