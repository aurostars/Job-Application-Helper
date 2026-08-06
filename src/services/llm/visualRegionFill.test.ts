import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  VisualRegionFillMappingResult,
  VisualRegionFillPayload,
  VisualRegionFillResult,
  UserProfile,
} from '../../shared/types.ts';
import { buildVisualRegionFillPrompt } from './prompts.ts';
import {
  parseVisualRegionFillResponse,
  validateVisualRegionMappings,
} from './visualRegionFill.ts';

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

test('视觉补填 prompt 包含图片 block 与只允许输出已有 controlId 的规则', () => {
  const prompt = buildVisualRegionFillPrompt(createPayload(), createProfile());

  assert.match(prompt.system, /只能输出已有 controlId/);
  assert.equal(prompt.userParts.length, 2);
  assert.deepEqual(prompt.userParts[1], {
    type: 'image',
    mimeType: 'image/png',
    data: 'ZmFrZQ==',
  });
});

test('视觉补填 prompt 不允许无图输入', () => {
  const payloadWithoutImage = {
    ...createPayload(),
    image: undefined,
  } as unknown as VisualRegionFillPayload;

  assert.throws(
    () => buildVisualRegionFillPrompt(payloadWithoutImage, createProfile()),
    /缺少视觉截图输入/,
  );
});

test('过滤不存在 controlId、空值和不在 options 中的结果', () => {
  const payload = createPayload();
  const profile = createProfile();

  const mappings = validateVisualRegionMappings([
    {
      controlId: 'ctrl-degree',
      fieldMeaning: '学历',
      matchedProfilePath: 'education.0.degree',
      value: '硕士',
    },
    {
      controlId: 'ghost',
      fieldMeaning: '学历',
      matchedProfilePath: 'education.0.degree',
      value: '硕士',
    },
    {
      controlId: 'ctrl-degree',
      fieldMeaning: '学历',
      matchedProfilePath: 'education.0.degree',
      value: '',
    },
    {
      controlId: 'ctrl-degree',
      fieldMeaning: '学历',
      matchedProfilePath: 'education.0.degree',
      value: '博士',
    },
  ], payload, createProfile());

  assert.deepEqual(mappings, [{
    controlId: 'ctrl-degree',
    fieldMeaning: '学历',
    matchedProfilePath: 'education.0.degree',
    value: '硕士',
  }]);
});

test('解析模型 JSON 后返回校验前的 mappings', () => {
  const result: VisualRegionFillMappingResult = parseVisualRegionFillResponse(`{
    "mappings": [
      {
        "controlId": "ctrl-degree",
        "fieldMeaning": "学历",
        "matchedProfilePath": "education.0.degree",
        "value": "硕士"
      }
    ]
  }`);

  assert.deepEqual(result, {
    mappings: [{
      controlId: 'ctrl-degree',
      fieldMeaning: '学历',
      matchedProfilePath: 'education.0.degree',
      value: '硕士',
    }],
  });
});

test('旧的聚焦字段结果协议仍要求 value', () => {
  const legacyResult: VisualRegionFillResult = {
    value: '硕士',
    confidence: 0.9,
    model: 'test-model',
  };

  assert.equal(legacyResult.value, '硕士');
});
