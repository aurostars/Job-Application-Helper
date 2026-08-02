import { parsePDF } from './pdfParser';
import { parseDOCX } from './docxParser';
import { parseMarkdown } from './markdownParser';
import { parseTXT } from './txtParser';
import { parseResumeJSON } from './jsonParser';
import type { ParsedResumeData } from '../shared/types';

/** JSON 简历自带结构，无需再经 LLM/正则推断 */
export function isStructuredType(fileType: string): boolean {
  return fileType.toLowerCase().replace('.', '') === 'json';
}

export async function parseResume(
  base64Data: string,
  fileType: string
): Promise<string> {
  const normalizedType = fileType.toLowerCase().replace('.', '');

  switch (normalizedType) {
    case 'pdf':
      // PDF 解析需要在有 DOM 环境中执行
      // 在 service worker 中，通过 offscreen document 处理
      if (typeof window === 'undefined' && typeof chrome !== 'undefined') {
        return await parsePDFInOffscreen(base64Data);
      }
      return await parsePDF(base64Data);
    case 'doc':
    case 'docx':
      return await parseDOCX(base64Data);
    case 'md':
    case 'markdown':
      return await parseMarkdown(base64Data);
    case 'txt':
    case 'json':
      // JSON 与 TXT 同为纯文本，解码方式一致
      return await parseTXT(base64Data);
    default:
      throw new Error(
        `不支持的文件格式：${fileType || '(未识别)'}。目前支持 PDF、DOC/DOCX、MD、TXT、JSON。`
      );
  }
}

/** 在 offscreen document 中解析 PDF（用于 service worker 环境） */
async function parsePDFInOffscreen(base64Data: string): Promise<string> {
  try {
    console.log('Attempting to parse PDF in offscreen document...');

    // 确保 offscreen document 存在
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
    });

    console.log('Existing offscreen contexts:', existingContexts.length);

    if (existingContexts.length === 0) {
      console.log('Creating offscreen document...');
      await chrome.offscreen.createDocument({
        url: 'src/offscreen/index.html',
        reasons: ['DOM_PARSER' as chrome.offscreen.Reason],
        justification: 'Parse PDF files using PDF.js which requires DOM',
      });
      console.log('Offscreen document created');
    }

    // 发送消息到 offscreen document
    console.log('Sending PDF data to offscreen document...');
    const response = await chrome.runtime.sendMessage({
      type: 'PARSE_PDF_OFFSCREEN',
      payload: { fileData: base64Data }
    });

    console.log('Received response from offscreen:', response);

    if (!response.success) {
      throw new Error(response.error || 'Failed to parse PDF');
    }

    return response.data;
  } catch (error) {
    console.error('Error in parsePDFInOffscreen:', error);
    throw new Error(`PDF parsing failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** 直接从 JSON 文本得到结构化简历数据 */
export function parseStructuredResume(jsonText: string): ParsedResumeData {
  return parseResumeJSON(jsonText);
}

export { parsePDF, parseDOCX, parseMarkdown, parseTXT, parseResumeJSON };
