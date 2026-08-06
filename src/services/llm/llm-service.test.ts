import assert from 'node:assert/strict';
import test from 'node:test';
import { LLMService } from './llmService.ts';
import {
  LLMProvider,
  PROVIDER_PRESETS,
  PROVIDER_ORDER,
  DEFAULT_MAX_TOKENS,
  MAX_TOKENS_CEILING,
} from './types.ts';

const baseConfig = {
  provider: LLMProvider.MIMO,
  apiKey: 'test-key',
  baseUrl: 'https://example.com/v1',
  model: 'mimo-v2.5-pro',
};

/** 记录每次请求的 max_tokens，并按 handler 决定返回体 */
function stubFetch(handler: (maxTokens: number, call: number) => unknown) {
  const budgets: number[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (_input: unknown, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? '{}');
    budgets.push(body.max_tokens);
    return new Response(JSON.stringify(handler(body.max_tokens, budgets.length)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof globalThis.fetch;

  return { budgets, restore: () => { globalThis.fetch = originalFetch; } };
}

/** 推理模型思考耗尽额度时的响应：finish_reason=length 且正文为空 */
const truncated = { choices: [{ message: { content: '' }, finish_reason: 'length' }] };
const ok = { choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }] };

test('默认输出上限不再是导致推理模型返回空正文的 4096', () => {
  assert.ok(DEFAULT_MAX_TOKENS >= 8192, `默认额度过低：${DEFAULT_MAX_TOKENS}`);
});

test('未配置 maxTokens 时使用默认额度', async () => {
  const stub = stubFetch(() => ok);
  try {
    await new LLMService(baseConfig).chat([{ role: 'user', content: 'hi' }]);
    assert.deepEqual(stub.budgets, [DEFAULT_MAX_TOKENS]);
  } finally {
    stub.restore();
  }
});

test('思考耗尽额度返回空正文时自动加倍重试', async () => {
  const stub = stubFetch((_max, call) => (call === 1 ? truncated : ok));
  try {
    const result = await new LLMService(baseConfig).chat([{ role: 'user', content: 'hi' }]);
    assert.equal(result.content, '{"ok":true}');
    assert.deepEqual(stub.budgets, [DEFAULT_MAX_TOKENS, DEFAULT_MAX_TOKENS * 2]);
  } finally {
    stub.restore();
  }
});

test('加倍到 32768 上限即停止使用 AI 解析', async () => {
  const stub = stubFetch(() => truncated);
  try {
    await assert.rejects(
      new LLMService(baseConfig).chat([{ role: 'user', content: 'hi' }]),
      (error: Error) => {
        assert.match(error.message, new RegExp(String(MAX_TOKENS_CEILING)));
        assert.match(error.message, /已停止使用 AI 解析/);
        assert.match(error.message, /非推理模型/);
        return true;
      }
    );
    // 8192 → 16384 → 32768 后停止，不会无限重试
    assert.deepEqual(stub.budgets, [8192, 16384, 32768]);
  } finally {
    stub.restore();
  }
});

test('旧配置里较小的 maxTokens 不会把额度压到 8192 以下', async () => {
  const stub = stubFetch(() => ok);
  try {
    await new LLMService({ ...baseConfig, maxTokens: 2048 })
      .chat([{ role: 'user', content: 'hi' }]);
    assert.deepEqual(stub.budgets, [DEFAULT_MAX_TOKENS]);
  } finally {
    stub.restore();
  }
});

test('额度请求不超过上限', async () => {
  const stub = stubFetch(() => ok);
  try {
    await new LLMService({ ...baseConfig, maxTokens: 999999 })
      .chat([{ role: 'user', content: 'hi' }]);
    assert.deepEqual(stub.budgets, [MAX_TOKENS_CEILING]);
  } finally {
    stub.restore();
  }
});

test('非截断类错误不触发重试', async () => {
  const stub = stubFetch(() => ({ choices: [{ message: { content: '' }, finish_reason: 'stop' }] }));
  try {
    await assert.rejects(
      new LLMService(baseConfig).chat([{ role: 'user', content: 'hi' }]),
      /返回内容为空/
    );
    assert.equal(stub.budgets.length, 1, '不应重试');
  } finally {
    stub.restore();
  }
});

test('Claude 开启 thinking 时取文本 block 而非思考 block', async () => {
  const stub = stubFetch(() => ({
    content: [
      { type: 'thinking', thinking: '让我想想…' },
      { type: 'text', text: '{"ok":true}' },
    ],
    stop_reason: 'end_turn',
  }));
  try {
    const result = await new LLMService({
      ...baseConfig,
      provider: LLMProvider.CLAUDE,
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-5',
    }).chat([{ role: 'user', content: 'hi' }]);
    assert.equal(result.content, '{"ok":true}');
  } finally {
    stub.restore();
  }
});

test('各服务商默认模型不是推理模型', () => {
  for (const provider of PROVIDER_ORDER) {
    const preset = PROVIDER_PRESETS[provider];
    if (!preset.defaultModel || preset.reasoningOnly) continue;

    assert.ok(
      !(preset.reasoningModels ?? []).includes(preset.defaultModel),
      `${preset.label} 的默认模型 ${preset.defaultModel} 是推理模型`
    );
    assert.ok(
      preset.models.includes(preset.defaultModel),
      `${preset.label} 的默认模型 ${preset.defaultModel} 不在非推理模型候选中`
    );
  }
});

test('仅有推理模型的服务商被标记出来', () => {
  for (const provider of PROVIDER_ORDER) {
    const preset = PROVIDER_PRESETS[provider];
    if (provider === LLMProvider.CUSTOM) continue;

    if (preset.models.length === 0) {
      assert.equal(
        preset.reasoningOnly, true,
        `${preset.label} 没有非推理模型候选，应标记 reasoningOnly 以便界面提示`
      );
    }
  }
});

test('Claude 因 max_tokens 截断时同样自动重试', async () => {
  const stub = stubFetch((_max, call) => (call === 1
    ? { content: [{ type: 'thinking', thinking: '…' }], stop_reason: 'max_tokens' }
    : { content: [{ type: 'text', text: 'done' }], stop_reason: 'end_turn' }));
  try {
    const result = await new LLMService({
      ...baseConfig,
      provider: LLMProvider.CLAUDE,
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-5',
    }).chat([{ role: 'user', content: 'hi' }]);
    assert.equal(result.content, 'done');
    assert.deepEqual(stub.budgets, [DEFAULT_MAX_TOKENS, DEFAULT_MAX_TOKENS * 2]);
  } finally {
    stub.restore();
  }
});

test('openai 兼容接口会把图片消息序列化为 image_url block', async () => {
  let requestBody = '';
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (_url, init) => {
    requestBody = String(init?.body);
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
    }), { status: 200 });
  }) as typeof globalThis.fetch;

  try {
    const llm = new LLMService({
      provider: LLMProvider.OPENAI,
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
    });

    await llm.chat([{
      role: 'user',
      content: [
        { type: 'text', text: '看图并返回 JSON' },
        { type: 'image', mimeType: 'image/png', data: 'ZmFrZQ==' },
      ],
    }]);

    assert.match(requestBody, /image_url/);
    assert.match(requestBody, /data:image\/png;base64,ZmFrZQ==/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
