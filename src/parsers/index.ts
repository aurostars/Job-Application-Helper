import { parsePDF } from './pdfParser.ts';
import { parseDOCX } from './docxParser.ts';
import { parseMarkdown } from './markdownParser.ts';
import { parseTXT } from './txtParser.ts';
import { parseResumeJSON } from './jsonParser.ts';
import type { ParsedResumeData } from '../shared/types';

/** JSON 简历自带结构，无需再经 LLM/正则推断 */
export function isStructuredType(fileType: string): boolean {
  return fileType.toLowerCase().replace('.', '') === 'json';
}

/**
 * 必须在有 DOM 的上下文中解析的格式。
 *
 * - PDF：PDF.js 需要 DOM。
 * - DOC/DOCX：mammoth 本身用纯 JS 的 @xmldom/xmldom，但其依赖 bluebird 在
 *   模块求值时挑选调度器：service worker 没有 process 却有 MutationObserver，
 *   一旦 bluebird 判定拿不到原生 Promise，就会走 document.createElement 分支
 *   并抛 ReferenceError。与其依赖该判定的结果，不如始终放到有 DOM 的上下文里跑。
 */
const DOM_REQUIRED_TYPES = ['pdf', 'doc', 'docx'];

export async function parseResume(
  base64Data: string,
  fileType: string
): Promise<string> {
  const normalizedType = fileType.toLowerCase().replace('.', '');

  // 在 service worker 中，通过 offscreen document 处理
  if (
    DOM_REQUIRED_TYPES.includes(normalizedType) &&
    typeof window === 'undefined' &&
    typeof chrome !== 'undefined' &&
    canUseOffscreenDocument()
  ) {
    return await parseInOffscreen(base64Data, normalizedType);
  }

  switch (normalizedType) {
    case 'pdf':
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

function canUseOffscreenDocument(): boolean {
  return Boolean(
    typeof chrome !== 'undefined' &&
    chrome.runtime &&
    chrome.offscreen &&
    typeof chrome.offscreen.createDocument === 'function'
  );
}

/** 在 offscreen document 中解析需要 DOM 的格式（用于 service worker 环境） */
async function parseInOffscreen(base64Data: string, fileType: string): Promise<string> {
  const parseDirectly = () => (fileType === 'pdf' ? parsePDF(base64Data) : parseDOCX(base64Data));

  try {
    console.log(`Attempting to parse ${fileType} in offscreen document...`);

    if (!canUseOffscreenDocument()) {
      console.warn('Offscreen API unavailable, falling back to direct parsing');
      return await parseDirectly();
    }

    // 确保 offscreen document 存在
    const existingContexts = typeof chrome.runtime.getContexts === 'function'
      ? await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
      })
      : [];

    console.log('Existing offscreen contexts:', existingContexts.length);

    if (existingContexts.length === 0) {
      console.log('Creating offscreen document...');
      await chrome.offscreen.createDocument({
        url: 'src/offscreen/index.html',
        reasons: ['DOM_PARSER' as chrome.offscreen.Reason],
        justification: 'Parse PDF and DOCX resumes with libraries that require DOM',
      });
      console.log('Offscreen document created');
    }

    // 发送消息到 offscreen document
    console.log(`Sending ${fileType} data to offscreen document...`);
    const response = await chrome.runtime.sendMessage({
      type: 'PARSE_FILE_OFFSCREEN',
      payload: { fileData: base64Data, fileType }
    });

    console.log('Received response from offscreen:', response);

    if (!response?.success) {
      throw new Error(response?.error || `Failed to parse ${fileType}`);
    }

    return response.data;
  } catch (error) {
    console.error('Error in parseInOffscreen:', error);
    throw new Error(
      `${fileType.toUpperCase()} parsing failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/** 直接从 JSON 文本得到结构化简历数据 */
export function parseStructuredResume(jsonText: string): ParsedResumeData {
  return parseResumeJSON(jsonText);
}

export { parsePDF, parseDOCX, parseMarkdown, parseTXT, parseResumeJSON };
