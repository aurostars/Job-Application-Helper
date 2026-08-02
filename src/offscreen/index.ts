// Offscreen document for PDF parsing
// This runs in a DOM context, so PDF.js can access window object

import { parsePDF } from '../parsers/pdfParser';

console.log('Offscreen document loaded, waiting for PDF parsing requests...');

chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {
    console.log('Offscreen received message:', message.type);

    if (message.type === 'PARSE_PDF_OFFSCREEN') {
      console.log('Starting PDF parsing in offscreen document...');

      parsePDF(message.payload.fileData)
        .then((text) => {
          console.log('PDF parsed successfully, text length:', text.length);
          sendResponse({ success: true, data: text });
        })
        .catch((error) => {
          console.error('PDF parsing error in offscreen:', error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to parse PDF'
          });
        });
      return true; // 异步响应
    }

    return false;
  }
);

console.log('Offscreen document ready for PDF parsing');
