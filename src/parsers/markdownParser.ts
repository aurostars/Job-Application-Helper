export async function parseMarkdown(base64Data: string): Promise<string> {
  try {
    // 动态导入 marked
    const { marked } = await import('marked');

    // 移除 base64 前缀
    const base64String = base64Data.includes(',')
      ? base64Data.split(',')[1]
      : base64Data;

    // 解码 base64 为文本
    const text = decodeURIComponent(
      atob(base64String)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );

    // 解析 Markdown 为 HTML，然后提取纯文本
    const html = await marked(text);

    // 移除 HTML 标签，保留文本
    const plainText = html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();

    return plainText;
  } catch (error) {
    console.error('Markdown parsing error:', error);
    throw new Error('Failed to parse Markdown file');
  }
}
