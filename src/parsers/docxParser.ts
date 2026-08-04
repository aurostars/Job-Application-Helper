export async function parseDOCX(base64Data: string): Promise<string> {
  try {
    // 动态导入 mammoth
    const mammothModule = await import('mammoth');
    const mammoth = mammothModule.default ?? mammothModule;

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

    const BufferCtor = (globalThis as typeof globalThis & {
      Buffer?: { from(data: Uint8Array): Uint8Array };
    }).Buffer;
    const buffer = BufferCtor?.from(bytes);
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

    let result;
    try {
      // Node / 部分打包环境下 mammoth 更偏好 buffer
      result = buffer
        ? await mammoth.extractRawText({ buffer })
        : await mammoth.extractRawText({ arrayBuffer });
    } catch (firstError) {
      if (!buffer) throw firstError;
      result = await mammoth.extractRawText({ arrayBuffer });
    }

    return result.value.trim();
  } catch (error) {
    console.error('DOCX parsing error:', error);
    throw new Error(`Failed to parse DOCX file: ${error instanceof Error ? error.message : String(error)}`);
  }
}
