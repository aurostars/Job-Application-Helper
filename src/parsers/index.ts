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

/** 直接从 JSON 文本得到结构化简历数据 */
export function parseStructuredResume(jsonText: string): ParsedResumeData {
  return parseResumeJSON(jsonText);
}

export { parsePDF, parseDOCX, parseMarkdown, parseTXT, parseResumeJSON };
