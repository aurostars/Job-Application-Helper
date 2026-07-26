import { createCanvas } from 'canvas';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const iconsDir = join(__dirname, '..', 'public', 'icons');

if (!existsSync(iconsDir)) {
  mkdirSync(iconsDir, { recursive: true });
}

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const padding = size * 0.08;
  const radius = size * 0.18;

  // 圆角矩形背景 - 渐变紫色
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#667eea');
  gradient.addColorStop(1, '#764ba2');

  ctx.beginPath();
  ctx.moveTo(padding + radius, padding);
  ctx.lineTo(size - padding - radius, padding);
  ctx.arcTo(size - padding, padding, size - padding, padding + radius, radius);
  ctx.lineTo(size - padding, size - padding - radius);
  ctx.arcTo(size - padding, size - padding, size - padding - radius, size - padding, radius);
  ctx.lineTo(padding + radius, size - padding);
  ctx.arcTo(padding, size - padding, padding, size - padding - radius, radius);
  ctx.lineTo(padding, padding + radius);
  ctx.arcTo(padding, padding, padding + radius, padding, radius);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // 添加轻微阴影效果
  ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
  ctx.shadowBlur = size * 0.02;

  // 绘制文档图标
  const docLeft = size * 0.25;
  const docTop = size * 0.18;
  const docWidth = size * 0.4;
  const docHeight = size * 0.55;
  const foldSize = size * 0.12;
  const docRadius = size * 0.03;

  ctx.beginPath();
  ctx.moveTo(docLeft + docRadius, docTop);
  ctx.lineTo(docLeft + docWidth - foldSize, docTop);
  ctx.lineTo(docLeft + docWidth, docTop + foldSize);
  ctx.lineTo(docLeft + docWidth, docTop + docHeight - docRadius);
  ctx.arcTo(docLeft + docWidth, docTop + docHeight, docLeft + docWidth - docRadius, docTop + docHeight, docRadius);
  ctx.lineTo(docLeft + docRadius, docTop + docHeight);
  ctx.arcTo(docLeft, docTop + docHeight, docLeft, docTop + docHeight - docRadius, docRadius);
  ctx.lineTo(docLeft, docTop + docRadius);
  ctx.arcTo(docLeft, docTop, docLeft + docRadius, docTop, docRadius);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fill();

  // 文档折角
  ctx.beginPath();
  ctx.moveTo(docLeft + docWidth - foldSize, docTop);
  ctx.lineTo(docLeft + docWidth - foldSize, docTop + foldSize);
  ctx.lineTo(docLeft + docWidth, docTop + foldSize);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.fill();

  // 文档上的横线（表示文字行）
  const lineColor = 'rgba(102, 126, 234, 0.5)';
  const lineStartX = docLeft + size * 0.06;
  const lineEndX = docLeft + docWidth - size * 0.06;
  const lineHeight = size * 0.025;

  ctx.fillStyle = lineColor;

  const lineYStart = docTop + size * 0.15;
  const lineSpacing = size * 0.08;

  for (let i = 0; i < 4; i++) {
    const y = lineYStart + i * lineSpacing;
    const width = i === 3 ? (lineEndX - lineStartX) * 0.6 : (lineEndX - lineStartX);
    ctx.beginPath();
    ctx.roundRect(lineStartX, y, width, lineHeight, lineHeight / 2);
    ctx.fill();
  }

  // 绘制绿色对勾圆圈（右下角）
  const checkCenterX = size * 0.68;
  const checkCenterY = size * 0.72;
  const checkRadius = size * 0.17;

  // 圆圈背景
  ctx.beginPath();
  ctx.arc(checkCenterX, checkCenterY, checkRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#10b981';
  ctx.fill();

  // 白色边框
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = size * 0.025;
  ctx.stroke();

  // 对勾
  ctx.beginPath();
  ctx.moveTo(checkCenterX - checkRadius * 0.45, checkCenterY);
  ctx.lineTo(checkCenterX - checkRadius * 0.1, checkCenterY + checkRadius * 0.35);
  ctx.lineTo(checkCenterX + checkRadius * 0.45, checkCenterY - checkRadius * 0.3);
  ctx.strokeStyle = 'white';
  ctx.lineWidth = size * 0.04;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  return canvas.toBuffer('image/png');
}

// 生成三种尺寸的图标
const sizes = [16, 48, 128];

for (const size of sizes) {
  const buffer = generateIcon(size);
  const filePath = join(iconsDir, `icon${size}.png`);
  writeFileSync(filePath, buffer);
  console.log(`✓ Generated icon${size}.png (${size}x${size})`);
}

console.log('\n图标生成完成！');
