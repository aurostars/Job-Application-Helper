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

      fullText += itemsToText(textContent.items) + '\n';
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

interface PDFTextItem {
  str?: string;
  hasEOL?: boolean;
  width?: number;
  height?: number;
  transform?: number[];
}

interface PositionedItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 把一页的文本块还原成带换行、且符合视觉顺序的文本。
 *
 * 两个必须处理的问题：
 *
 * 1. PDF 没有「行」的概念，只有一堆带坐标的文本块。直接用空格拼接会让
 *    整页变成一行，后续按行工作的字段提取全部失效。
 * 2. 内容流顺序不等于视觉顺序。Canva 等设计工具常把章节标题放在独立
 *    图层最后绘制，于是「教育经历」「实习经历」这类标题会排到全文末尾，
 *    与各自的内容彻底脱节，LLM 和正则都无法判断段落归属。
 *
 * 因此这里不沿用内容流顺序，而是按坐标重排：先用 Y 坐标聚成行
 * （自上而下），行内再按 X 排序（自左而右）。
 */
function itemsToText(items: unknown[]): string {
  const positioned: PositionedItem[] = [];

  for (const raw of items) {
    const item = raw as PDFTextItem;
    // getTextContent 的结果里混有标记内容项，没有 str 字段
    if (typeof item.str !== 'string' || !item.str.trim()) continue;

    const transform = Array.isArray(item.transform) ? item.transform : null;
    if (!transform || !Number.isFinite(transform[4]) || !Number.isFinite(transform[5])) {
      continue;
    }

    positioned.push({
      str: item.str,
      x: transform[4] as number,
      y: transform[5] as number,
      width: Number.isFinite(item.width) ? (item.width as number) : 0,
      height: Number.isFinite(item.height) && (item.height as number) > 0
        ? (item.height as number)
        : 12,
    });
  }

  if (positioned.length === 0) return '';

  return groupIntoLines(positioned)
    .map(joinLine)
    .join('\n')
    .replace(/[ \t]+$/gm, '');
}

/** 按 Y 坐标把文本块聚成行，行内按 X 升序 */
function groupIntoLines(items: PositionedItem[]): PositionedItem[][] {
  // Y 降序（PDF 坐标系原点在左下，Y 大者在上）
  const sorted = [...items].sort((a, b) => b.y - a.y);

  const lines: PositionedItem[][] = [];
  let currentLine: PositionedItem[] = [];
  let lineY = sorted[0].y;
  let lineHeight = sorted[0].height;

  for (const item of sorted) {
    // 同一视觉行的基线可能有零点几的抖动（如日期块比正文高 0.8），
    // 用半个字高作容差；超出则判为新行。
    const tolerance = Math.max(lineHeight, item.height) * 0.5;

    if (currentLine.length > 0 && Math.abs(item.y - lineY) > tolerance) {
      lines.push(currentLine);
      currentLine = [];
    }

    if (currentLine.length === 0) {
      lineY = item.y;
      lineHeight = item.height;
    } else {
      // 以行内最大字高为准，避免小字块把容差压得过小
      lineHeight = Math.max(lineHeight, item.height);
    }

    currentLine.push(item);
  }

  if (currentLine.length > 0) lines.push(currentLine);

  return lines.map(line => line.sort((a, b) => a.x - b.x));
}

/**
 * 拼接一行内的文本块。中文 PDF 常把相邻字拆成多个块，
 * 无条件加空格会在词内插入空格，因此只在水平间距明显时补空格。
 */
function joinLine(line: PositionedItem[]): string {
  let text = '';
  let prevEndX: number | null = null;
  let prevHeight = 0;

  for (const item of line) {
    const gapThreshold = Math.max(item.height, prevHeight) * 0.25;

    if (
      text &&
      prevEndX !== null &&
      item.x - prevEndX > gapThreshold &&
      !/\s$/.test(text)
    ) {
      text += ' ';
    }

    text += item.str;
    prevEndX = item.x + item.width;
    prevHeight = item.height;
  }

  return text.trim();
}
