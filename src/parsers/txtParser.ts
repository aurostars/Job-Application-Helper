export async function parseTXT(base64Data: string): Promise<string> {
  try {
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

    return text.trim();
  } catch (error) {
    console.error('TXT parsing error:', error);
    throw new Error('Failed to parse TXT file');
  }
}
