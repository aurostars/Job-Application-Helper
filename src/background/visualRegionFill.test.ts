import assert from 'node:assert/strict';
import test from 'node:test';
import { LLMProvider } from '../services/llm/types.ts';
import type {
  Message,
  UserProfile,
  VisualRegionFillPayload,
} from '../shared/types.ts';
import {
  captureVisibleRegion,
  handleVisualRegionFill,
} from './visualRegionFill.ts';

function createProfile(): UserProfile {
  return {
    personal: { name: '张三', gender: '', birthDate: '', phone: '', email: '' },
    education: [{
      id: 'edu-1',
      school: 'A',
      major: 'B',
      degree: '硕士',
      startDate: '2022-09',
      endDate: '2025-06',
    }],
    experience: [],
    projects: [],
    customInformation: [],
    skills: [],
    certifications: [],
  };
}

function createPayload(): VisualRegionFillPayload {
  return {
    requestId: 'req-1',
    domain: 'jobs.bytedance.com',
    image: {
      base64: 'ZmFrZQ==',
      mimeType: 'image/png',
      width: 800,
      height: 400,
    },
    controls: [{
      controlId: 'ctrl-degree',
      tagName: 'select',
      label: '学历',
      name: 'degree',
      placeholder: '',
      options: ['本科', '硕士'],
      rect: { left: 10, top: 10, width: 120, height: 36 },
      contextText: '教育经历 学历',
    }],
    region: {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    },
  };
}

function stubChromeForCapture() {
  const originalChrome = (globalThis as { chrome?: unknown }).chrome;
  const created: string[] = [];
  const sent: Message[] = [];

  (globalThis as { chrome?: unknown }).chrome = {
    runtime: {
      getContexts: async () => [],
      sendMessage: async (message: Message) => {
        sent.push(message);
        return {
          success: true,
          data: {
            base64: 'Y3JvcHBlZA==',
            mimeType: 'image/png',
            width: 120,
            height: 60,
          },
        };
      },
      onMessage: { addListener: () => {} },
      onInstalled: { addListener: () => {} },
      getManifest: () => ({ version: 'test' }),
      openOptionsPage: () => {},
    },
    offscreen: {
      createDocument: async (options: { url: string }) => {
        created.push(options.url);
      },
    },
    tabs: {
      captureVisibleTab: async (windowId: number, options: { format: string }) => {
        assert.equal(windowId, 7);
        assert.deepEqual(options, { format: 'png' });
        return 'data:image/png;base64,c2NyZWVuc2hvdA==';
      },
    },
    storage: {
      local: {
        get: async () => ({}),
        set: async () => {},
        remove: async () => {},
        clear: async () => {},
        getBytesInUse: async () => 0,
        QUOTA_BYTES: 1024,
      },
    },
  };

  return {
    created,
    sent,
    restore: () => {
      (globalThis as { chrome?: unknown }).chrome = originalChrome;
    },
  };
}

test('视觉模型未开启时 handler 直接返回可读错误', async () => {
  const response = await handleVisualRegionFill({
    requestId: 'req-1',
    domain: 'jobs.bytedance.com',
    image: { base64: 'ZmFrZQ==', mimeType: 'image/png', width: 10, height: 10 },
    controls: [],
    region: { x: 0, y: 0, width: 10, height: 10 },
  }, {
    getLLMConfig: async () => ({
      provider: LLMProvider.CUSTOM,
      apiKey: 'sk-test',
      baseUrl: 'https://example.com/v1',
      model: 'custom-model',
      visionEnabled: false,
    }),
    getUserProfile: async () => null,
  } as never);

  assert.equal(response.success, false);
  assert.match(response.error || '', /不支持图片输入/);
});

test('captureVisibleRegion 调用截图与 offscreen 裁剪', async () => {
  const stub = stubChromeForCapture();
  try {
    const result = await captureVisibleRegion(7, {
      x: 10,
      y: 20,
      width: 120,
      height: 60,
    });

    assert.deepEqual(result, {
      base64: 'Y3JvcHBlZA==',
      mimeType: 'image/png',
      width: 120,
      height: 60,
    });
    assert.deepEqual(stub.created, ['src/offscreen/index.html']);
    assert.deepEqual(stub.sent, [{
      type: 'CROP_IMAGE_OFFSCREEN',
      payload: {
        imageDataUrl: 'data:image/png;base64,c2NyZWVuc2hvdA==',
        selectionRect: { x: 10, y: 20, width: 120, height: 60 },
      },
    }]);
  } finally {
    stub.restore();
  }
});

test('background index 能识别 AI_FILL_VISUAL_REGION', async () => {
  const originalChrome = (globalThis as { chrome?: unknown }).chrome;
  const originalFetch = globalThis.fetch;
  const payload = createPayload();

  (globalThis as { chrome?: unknown }).chrome = {
    runtime: {
      onMessage: { addListener: () => {} },
      onInstalled: { addListener: () => {} },
      openOptionsPage: () => {},
      getManifest: () => ({ version: 'test' }),
      getContexts: async () => [],
      sendMessage: async () => ({ success: true }),
    },
    storage: {
      local: {
        get: async (key: string | string[]) => {
          if (Array.isArray(key)) return {};
          if (key === 'llmConfig') {
            return {
              llmConfig: {
                provider: LLMProvider.CUSTOM,
                apiKey: 'sk-test',
                baseUrl: 'https://example.com/v1',
                model: 'custom-model',
                visionEnabled: true,
              },
            };
          }
          if (key === 'userProfile') {
            return { userProfile: createProfile() };
          }
          return {};
        },
        set: async () => {},
        remove: async () => {},
        clear: async () => {},
        getBytesInUse: async () => 0,
        QUOTA_BYTES: 1024,
      },
    },
    tabs: {
      get: async () => ({ id: 1, url: 'https://jobs.bytedance.com' }),
      sendMessage: async () => ({ success: true, data: { written: true } }),
      captureVisibleTab: async () => 'data:image/png;base64,c2NyZWVuc2hvdA==',
    },
    offscreen: {
      createDocument: async () => {},
    },
  };

  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          mappings: [{
            controlId: 'ctrl-degree',
            fieldMeaning: '学历',
            matchedProfilePath: 'education.0.degree',
            value: '硕士',
          }],
        }),
      },
    }],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  try {
    const moduleUrl = new URL(`./index.ts?route-test=${Date.now()}`, import.meta.url).href;
    const backgroundModule = await import(moduleUrl);
    const response = await backgroundModule.handleMessage({
      type: 'AI_FILL_VISUAL_REGION',
      payload,
    } as unknown as Message, {} as chrome.runtime.MessageSender);

    assert.equal(response.success, true);
    assert.deepEqual(response.data, {
      mappings: [{
        controlId: 'ctrl-degree',
        fieldMeaning: '学历',
        matchedProfilePath: 'education.0.degree',
        value: '硕士',
      }],
    });
  } finally {
    (globalThis as { chrome?: unknown }).chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});
