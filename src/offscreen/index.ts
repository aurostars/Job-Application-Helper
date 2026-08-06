// Offscreen document：在有 DOM 的上下文里解析简历文件。
// PDF.js 需要 DOM；mammoth 的依赖 bluebird 在挑选调度器时也可能触碰
// document，两者都不宜在 service worker 中直接运行。

import { parsePDF } from '../parsers/pdfParser';
import { parseDOCX } from '../parsers/docxParser';
import type { VisualRegionImagePayload, VisualRegionSelectionRect } from '../shared/types.ts';
import { resolveImageCropRect } from './imageCrop.ts';

console.log('Offscreen document loaded, waiting for parsing requests...');

function parseByType(fileType: string, fileData: string): Promise<string> {
  switch (fileType.toLowerCase().replace('.', '')) {
    case 'pdf':
      return parsePDF(fileData);
    case 'doc':
    case 'docx':
      return parseDOCX(fileData);
    default:
      return Promise.reject(new Error(`Offscreen 不支持的格式：${fileType}`));
  }
}

async function cropImageDataUrl(
  imageDataUrl: string,
  selectionRect: VisualRegionSelectionRect,
): Promise<VisualRegionImagePayload> {
  const image = await loadImage(imageDataUrl);
  const { x, y, width, height } = resolveImageCropRect(selectionRect, {
    width: image.naturalWidth,
    height: image.naturalHeight,
  });

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('无法创建截图裁剪画布');
  }

  context.drawImage(image, x, y, width, height, 0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/png');
  return {
    base64: dataUrl.replace(/^data:image\/png;base64,/, ''),
    mimeType: 'image/png',
    width,
    height,
  };
}

function loadImage(imageDataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('截图数据无法加载'));
    image.src = imageDataUrl;
  });
}

chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {
    if (message?.type === 'PARSE_FILE_OFFSCREEN') {
      const { fileType, fileData } = message.payload ?? {};
      console.log(`Starting ${fileType} parsing in offscreen document...`);

      parseByType(String(fileType ?? ''), String(fileData ?? ''))
        .then((text) => {
          console.log('Parsed successfully, text length:', text.length);
          sendResponse({ success: true, data: text });
        })
        .catch((error) => {
          console.error('Parsing error in offscreen:', error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to parse file'
          });
        });

      return true; // 异步响应
    }

    if (message?.type === 'CROP_IMAGE_OFFSCREEN') {
      const { imageDataUrl, selectionRect } = message.payload ?? {};

      cropImageDataUrl(
        String(imageDataUrl ?? ''),
        selectionRect as VisualRegionSelectionRect,
      )
        .then((image) => {
          sendResponse({ success: true, data: image });
        })
        .catch((error) => {
          console.error('Crop error in offscreen:', error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to crop image',
          });
        });

      return true;
    }

    return false;
  }
);

console.log('Offscreen document ready for parsing');
