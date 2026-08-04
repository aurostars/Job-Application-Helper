import assert from 'node:assert/strict';
import test from 'node:test';
import { parseResume } from './index.ts';

/**
 * 这些用例守住一件事：service worker 里不能直接跑需要 DOM 的解析库。
 * DOCX 曾因 mammoth 的依赖 bluebird 在无 DOM 环境挑选调度器时触碰
 * document，报 "document is not defined"。
 */

interface SentMessage {
  type: string;
  payload: { fileData: string; fileType: string };
}

/** 模拟 service worker：无 window，chrome.offscreen 可用 */
function stubServiceWorker(offscreenReply: string) {
  const sent: SentMessage[] = [];
  const created: string[] = [];
  const originalChrome = (globalThis as any).chrome;

  (globalThis as any).chrome = {
    runtime: {
      getContexts: async () => [],
      sendMessage: async (message: SentMessage) => {
        sent.push(message);
        return { success: true, data: offscreenReply };
      },
    },
    offscreen: {
      createDocument: async (opts: { url: string }) => { created.push(opts.url); },
    },
  };

  return {
    sent,
    created,
    restore: () => { (globalThis as any).chrome = originalChrome; },
  };
}

test('service worker 中 DOCX 交给 offscreen 解析', async () => {
  const stub = stubServiceWorker('DOCX 文本');
  try {
    const text = await parseResume('ZmFrZQ==', 'docx');
    assert.equal(text, 'DOCX 文本');
    assert.equal(stub.sent.length, 1);
    assert.equal(stub.sent[0].type, 'PARSE_FILE_OFFSCREEN');
    assert.equal(stub.sent[0].payload.fileType, 'docx');
  } finally {
    stub.restore();
  }
});

test('service worker 中 PDF 同样交给 offscreen 解析', async () => {
  const stub = stubServiceWorker('PDF 文本');
  try {
    assert.equal(await parseResume('ZmFrZQ==', 'pdf'), 'PDF 文本');
    assert.equal(stub.sent[0].payload.fileType, 'pdf');
  } finally {
    stub.restore();
  }
});

test('.doc 与带点的扩展名也走 offscreen', async () => {
  for (const fileType of ['doc', '.docx', 'DOCX']) {
    const stub = stubServiceWorker('文本');
    try {
      await parseResume('ZmFrZQ==', fileType);
      assert.equal(stub.sent.length, 1, `${fileType} 未走 offscreen`);
    } finally {
      stub.restore();
    }
  }
});

test('offscreen document 只创建一次并复用', async () => {
  const stub = stubServiceWorker('文本');
  try {
    await parseResume('ZmFrZQ==', 'docx');
    assert.deepEqual(stub.created, ['src/offscreen/index.html']);
  } finally {
    stub.restore();
  }
});

test('纯文本格式不经过 offscreen', async () => {
  const stub = stubServiceWorker('不应被使用');
  try {
    // "abc" 的 base64
    const text = await parseResume('YWJj', 'txt');
    assert.equal(text, 'abc');
    assert.equal(stub.sent.length, 0, 'TXT 不应发送 offscreen 消息');
  } finally {
    stub.restore();
  }
});

test('offscreen 返回失败时抛出可读错误', async () => {
  const originalChrome = (globalThis as any).chrome;
  (globalThis as any).chrome = {
    runtime: {
      getContexts: async () => [],
      sendMessage: async () => ({ success: false, error: '磁盘已满' }),
    },
    offscreen: { createDocument: async () => {} },
  };
  try {
    await assert.rejects(parseResume('ZmFrZQ==', 'docx'), /磁盘已满/);
  } finally {
    (globalThis as any).chrome = originalChrome;
  }
});

test('不支持的格式给出明确提示', async () => {
  await assert.rejects(parseResume('ZmFrZQ==', 'xlsx'), /不支持的文件格式/);
});
