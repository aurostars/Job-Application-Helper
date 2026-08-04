export async function parsePDF(base64Data: string): Promise<string> {
  try {
    console.log('[PDF Parser] Starting PDF parsing...');

    const hasDOM = typeof window !== 'undefined' && typeof document !== 'undefined';
    const runtimeGetUrl = typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL.bind(chrome.runtime)
      : null;
    const pdfjsLib = hasDOM
      ? await import('pdfjs-dist')
      : await import('pdfjs-dist/legacy/build/pdf.mjs');
    console.log('[PDF Parser] PDF.js loaded, version:', pdfjsLib.version);

    // 在扩展环境且存在 DOM 时使用打包的 worker 文件
    if (hasDOM && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.js');
      console.log('[PDF Parser] Worker path set to:', pdfjsLib.GlobalWorkerOptions.workerSrc);
    } else if (hasDOM) {
      // 开发环境备用方案
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
    } else {
      console.log('[PDF Parser] No DOM detected, parsing PDF without worker');
    }

    const toNodeResourcePath = (relativePath: string) => {
      const url = new URL(relativePath, import.meta.url);
      return decodeURIComponent(url.pathname);
    };

    const cMapUrl = runtimeGetUrl
      ? runtimeGetUrl('cmaps/')
      : (!hasDOM ? toNodeResourcePath('../../node_modules/pdfjs-dist/cmaps/') : undefined);
    const standardFontDataUrl = runtimeGetUrl
      ? runtimeGetUrl('standard_fonts/')
      : (!hasDOM ? toNodeResourcePath('../../node_modules/pdfjs-dist/standard_fonts/') : undefined);

    // 移除 base64 前缀
    const base64String = base64Data.includes(',')
      ? base64Data.split(',')[1]
      : base64Data;
    console.log('[PDF Parser] Base64 data length:', base64String.length);

    // 转换为 Uint8Array
    const binaryString = atob(base64String);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    console.log('[PDF Parser] Converted to bytes, length:', bytes.length);

    // 加载 PDF
    console.log('[PDF Parser] Loading PDF document...');
    const documentInit = {
      data: bytes,
      ...(cMapUrl ? { cMapUrl, cMapPacked: true } : {}),
      ...(standardFontDataUrl ? { standardFontDataUrl } : {}),
      ...(hasDOM ? {} : { disableWorker: true }),
    } as any;
    const pdf = await pdfjsLib.getDocument(documentInit).promise;

    console.log('[PDF Parser] PDF loaded, pages:', pdf.numPages);

    let fullText = '';

    // 遍历所有页面
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      // 提取文本
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');

      fullText += pageText + '\n';
    }

    return fullText.trim();
  } catch (error) {
    console.error('[PDF Parser] PDF parsing error:', error);
    // 返回详细的错误信息
    const errorMessage = error instanceof Error
      ? `${error.name}: ${error.message}\n${error.stack || ''}`
      : String(error);
    throw new Error(`Failed to parse PDF file: ${errorMessage}`);
  }
}
