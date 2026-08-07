import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveImageCropRect } from './imageCrop.ts';

test('按截图实际像素与视口 CSS 尺寸换算裁剪区域', () => {
  const rect = resolveImageCropRect(
    {
      x: 100,
      y: 40,
      width: 250,
      height: 120,
      viewportWidth: 1000,
      viewportHeight: 500,
    },
    { width: 2000, height: 1000 },
  );

  assert.deepEqual(rect, {
    x: 200,
    y: 80,
    width: 500,
    height: 240,
  });
});

test('换算后的裁剪区域会被限制在截图边界内', () => {
  const rect = resolveImageCropRect(
    {
      x: 700,
      y: 500,
      width: 200,
      height: 100,
      viewportWidth: 800,
      viewportHeight: 600,
    },
    { width: 1600, height: 1200 },
  );

  assert.deepEqual(rect, {
    x: 1400,
    y: 1000,
    width: 200,
    height: 200,
  });
});
