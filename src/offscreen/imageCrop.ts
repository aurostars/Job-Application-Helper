import type { VisualRegionSelectionRect } from '../shared/types.ts';

interface ImageSize {
  width: number;
  height: number;
}

interface ImageCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function resolveImageCropRect(
  selectionRect: VisualRegionSelectionRect,
  imageSize: ImageSize,
): ImageCropRect {
  const viewportWidth = Math.max(1, Math.round(selectionRect.viewportWidth ?? imageSize.width));
  const viewportHeight = Math.max(1, Math.round(selectionRect.viewportHeight ?? imageSize.height));
  const imageWidth = Math.max(1, Math.round(imageSize.width));
  const imageHeight = Math.max(1, Math.round(imageSize.height));
  const scaleX = imageWidth / viewportWidth;
  const scaleY = imageHeight / viewportHeight;
  const maxX = Math.max(0, imageWidth - 1);
  const maxY = Math.max(0, imageHeight - 1);
  const x = clamp(Math.round(selectionRect.x * scaleX), 0, maxX);
  const y = clamp(Math.round(selectionRect.y * scaleY), 0, maxY);
  const width = clamp(Math.round(selectionRect.width * scaleX), 1, imageWidth - x);
  const height = clamp(Math.round(selectionRect.height * scaleY), 1, imageHeight - y);

  return { x, y, width, height };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
