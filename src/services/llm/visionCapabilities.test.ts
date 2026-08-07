import assert from 'node:assert/strict';
import test from 'node:test';
import { LLMProvider, type LLMConfig } from './types.ts';
import { supportsVisionInput } from './visionCapabilities.ts';

test('openai gpt-4o 被识别为支持视觉输入', () => {
  const config: LLMConfig = {
    provider: LLMProvider.OPENAI,
    apiKey: 'sk-test',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
  };

  assert.deepEqual(supportsVisionInput(config), { supported: true });
});

test('custom 服务商未显式开启视觉能力时被阻断', () => {
  const config: LLMConfig = {
    provider: LLMProvider.CUSTOM,
    apiKey: 'sk-test',
    baseUrl: 'https://example.com/v1',
    model: 'my-vision-model',
  };

  assert.deepEqual(supportsVisionInput(config), {
    supported: false,
    reason: 'CUSTOM_VISION_DISABLED',
  });
});

test('custom 服务商显式开启视觉能力后允许通过', () => {
  const config: LLMConfig = {
    provider: LLMProvider.CUSTOM,
    apiKey: 'sk-test',
    baseUrl: 'https://example.com/v1',
    model: 'my-vision-model',
    visionEnabled: true,
  };

  assert.deepEqual(supportsVisionInput(config), { supported: true });
});

test('未填写模型时返回 NO_MODEL', () => {
  const config: LLMConfig = {
    provider: LLMProvider.OPENAI,
    apiKey: 'sk-test',
    baseUrl: 'https://api.openai.com/v1',
    model: '   ',
  };

  assert.deepEqual(supportsVisionInput(config), {
    supported: false,
    reason: 'NO_MODEL',
  });
});

test('内置服务商的普通文本模型返回 PROVIDER_UNSUPPORTED', () => {
  const config: LLMConfig = {
    provider: LLMProvider.QWEN,
    apiKey: 'sk-test',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  };

  assert.deepEqual(supportsVisionInput(config), {
    supported: false,
    reason: 'PROVIDER_UNSUPPORTED',
  });
});
