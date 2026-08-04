// Offscreen document：在有 DOM 的上下文里解析简历文件。
// PDF.js 需要 DOM；mammoth 的依赖 bluebird 在挑选调度器时也可能触碰
// document，两者都不宜在 service worker 中直接运行。

import { parsePDF } from '../parsers/pdfParser';
import { parseDOCX } from '../parsers/docxParser';

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

chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {
    if (message?.type !== 'PARSE_FILE_OFFSCREEN') return false;

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
);

console.log('Offscreen document ready for parsing');
