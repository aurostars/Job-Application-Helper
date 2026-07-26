import { parsePDF } from './pdfParser';
import { parseDOCX } from './docxParser';
import { parseMarkdown } from './markdownParser';
import { parseTXT } from './txtParser';

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
      return await parseTXT(base64Data);
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

export { parsePDF, parseDOCX, parseMarkdown, parseTXT };
