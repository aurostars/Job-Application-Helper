export async function parseDOCX(base64Data: string): Promise<string> {
  try {
    // 动态导入 mammoth
    const mammoth = await import('mammoth');

    // 移除 base64 前缀
    const base64String = base64Data.includes(',')
      ? base64Data.split(',')[1]
      : base64Data;

    // 转换为 ArrayBuffer
    const binaryString = atob(base64String);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // 解析 DOCX
    const result = await mammoth.extractRawText({
      arrayBuffer: bytes.buffer
    });

    return result.value.trim();
  } catch (error) {
    console.error('DOCX parsing error:', error);
    throw new Error('Failed to parse DOCX file');
  }
}
