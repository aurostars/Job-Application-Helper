# 视觉优先 AI 框选补填 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为现有 `AI 框选补填` 按钮实现一条视觉优先、单次重推理、无隐式降级的新链路，在复杂页面上提升字段理解与资料匹配准确率。

**Architecture:** 方案分成五块：模型能力与配置约束、多模态 LLM 传输、视觉补填 prompt 与结果校验、background 侧截图与视觉编排、content/popup 侧框选采集与安全写回。`快速填充` 与 `AI 扫描填充` 继续走现有文本链路；新能力只服务 `AI 框选补填`，并且只在明确配置为支持图片输入的模型上可用。

**Tech Stack:** TypeScript 6、React 19、Chrome Extension Manifest V3、Chrome `tabs.captureVisibleTab`/`offscreen`、Node test runner (`node --experimental-strip-types --test`)、Vite 8、oxlint

## Global Constraints

- 仅改造现有 `AI 框选补填` 按钮，不新增按钮，不改造 `AI 扫描填充` 为视觉优先链路。
- 新链路必须是视觉优先、单次重视觉推理，不实现“先识别后再次匹配”的两段式多模态流程。
- 必须配置支持图片输入的视觉模型；没有视觉模型时明确阻断，不允许自动降级到旧 `AI_FILL_SECTION`。
- AI 在同一次推理中同时完成字段理解、资料匹配与输出，但只能使用提供的用户资料，不能编造新值。
- AI 输出只能映射到本地采集的 `controlId`；写回前必须完成本地结构校验、目标校验和可选项校验。
- 第一版不做跨区域拼接截图、整页视觉扫描、人工确认步骤、复杂调试面板。
- `快速填充`、`AI 扫描填充`、现有文本型 `AI_FILL_SECTION` 行为必须保持不变。

---

## File Map

- `src/services/llm/types.ts`
  - 扩展 `LLMConfig`、聊天消息内容结构、服务商视觉能力元数据。
- `src/services/llm/visionCapabilities.ts`
  - 提供视觉模型可用性判断，给 popup、background、设置页共用。
- `src/services/llm/visionCapabilities.test.ts`
  - 覆盖视觉能力判定和自定义模型开关。
- `src/shared/types.ts`
  - 新增 `AI_FILL_VISUAL_REGION` 消息与视觉区域 payload/response 类型。
- `src/shared/backup.ts`
  - 接受新增的 `visionEnabled` 配置字段，保证旧备份兼容。
- `src/shared/backup-sync.test.ts`
  - 验证新配置字段导入导出兼容。
- `src/options/AISettings.tsx`
  - 暴露“当前模型支持图片输入”的配置入口，主要用于 `CUSTOM`。
- `src/services/llm/llmService.ts`
  - 支持多模态消息发送到 OpenAI 兼容与 Claude 接口。
- `src/services/llm/llm-service.test.ts`
  - 覆盖图片输入消息序列化与错误路径。
- `src/services/llm/prompts.ts`
  - 新增 `buildVisualRegionFillPrompt()`。
- `src/services/llm/visualRegionFill.ts`
  - 解析和校验视觉模型返回的结构化结果。
- `src/services/llm/visualRegionFill.test.ts`
  - 覆盖结果 JSON 清洗、资料路径校验、可选项过滤。
- `src/background/visualRegionFill.ts`
  - 处理截图、裁剪、调用视觉模型、终止和写回前结果整理。
- `src/background/visualRegionFill.test.ts`
  - 覆盖后台编排中的纯函数与 handler 关键分支。
- `src/offscreen/index.ts`
  - 增加截图裁剪消息处理，复用现有 offscreen 基础设施。
- `src/content/visualRegionFill.ts`
  - 处理框选完成后的区域采集、控件序列化、结果写回与状态提示。
- `src/content/visualRegionFill.test.ts`
  - 覆盖控件序列化、结果映射与失效控件重定位的纯函数。
- `src/content/index.ts`
  - 将 `AI 框选补填` 流量接入新模块。
- `src/popup/App.tsx`
  - 启动前先做视觉模型能力拦截。
- `package.json`
  - 将新增测试文件加入 `npm test`。

### Task 1: 模型能力与共享协议

**Files:**
- Create: `src/services/llm/visionCapabilities.ts`
- Modify: `src/services/llm/types.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/shared/backup.ts`
- Modify: `src/shared/backup-sync.test.ts`
- Modify: `src/options/AISettings.tsx`
- Test: `src/services/llm/visionCapabilities.test.ts`

**Interfaces:**
- Consumes: `LLMConfig`, `PROVIDER_PRESETS`, `BackupDocument`, `Message`
- Produces:
  - `supportsVisionInput(config: LLMConfig): { supported: boolean; reason?: 'NO_MODEL' | 'PROVIDER_UNSUPPORTED' | 'CUSTOM_VISION_DISABLED' }`
  - `VisualRegionControlPayload`
  - `VisualRegionFillPayload`
  - `VisualRegionFillResult`
  - `LLMConfig['visionEnabled']?: boolean`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/services/llm/visionCapabilities.test.ts`

Expected: FAIL with `Cannot find module './visionCapabilities.ts'` or missing `visionEnabled` / type export errors

- [ ] **Step 3: Write minimal implementation**

```ts
// src/services/llm/types.ts
export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  visionEnabled?: boolean;
}

// src/services/llm/visionCapabilities.ts
import { LLMProvider, type LLMConfig } from './types.ts';

const BUILTIN_VISION_MODELS: Record<LLMProvider, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini'],
  claude: ['claude-sonnet-4-5', 'claude-haiku-4-5'],
  deepseek: [],
  qwen: ['qwen-vl-max', 'qwen-vl-plus'],
  glm: ['glm-4v-plus', 'glm-4.1v-thinking'],
  minimax: ['MiniMax-Text-01', 'MiniMax-VL-01'],
  mimo: [],
  kimi: ['moonshot-v1-vision-preview'],
  custom: [],
};

export function supportsVisionInput(config: LLMConfig) {
  const model = config.model.trim();
  if (!model) return { supported: false as const, reason: 'NO_MODEL' as const };
  if (config.provider === LLMProvider.CUSTOM) {
    return config.visionEnabled
      ? { supported: true as const }
      : { supported: false as const, reason: 'CUSTOM_VISION_DISABLED' as const };
  }

  const supported = BUILTIN_VISION_MODELS[config.provider]?.includes(model) ?? false;
  return supported
    ? { supported: true as const }
    : { supported: false as const, reason: 'PROVIDER_UNSUPPORTED' as const };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test src/services/llm/visionCapabilities.test.ts src/shared/backup-sync.test.ts`

Expected: PASS，并且旧备份测试仍通过，说明 `visionEnabled` 为可选兼容字段

- [ ] **Step 5: Commit**

```bash
git add src/services/llm/types.ts src/services/llm/visionCapabilities.ts src/services/llm/visionCapabilities.test.ts src/shared/types.ts src/shared/backup.ts src/shared/backup-sync.test.ts src/options/AISettings.tsx
git commit -m "feat: add vision model capability contracts"
```

### Task 2: 多模态 LLM 传输

**Files:**
- Modify: `src/services/llm/types.ts`
- Modify: `src/services/llm/llmService.ts`
- Test: `src/services/llm/llm-service.test.ts`

**Interfaces:**
- Consumes:
  - `LLMConfig`
  - `supportsVisionInput(config: LLMConfig)`
- Produces:
  - `ChatContentPart = { type: 'text'; text: string } | { type: 'image'; mimeType: string; data: string }`
  - `ChatMessage['content']: string | ChatContentPart[]`
  - `llm.chat(messages, signal?)` 支持视觉消息

- [ ] **Step 1: Write the failing test**

```ts
test('openai 兼容接口会把图片消息序列化为 image_url block', async () => {
  let requestBody = '';
  globalThis.fetch = async (_url, init) => {
    requestBody = String(init?.body);
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
    }), { status: 200 });
  };

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
  assert.match(requestBody, /data:image\\/png;base64,ZmFrZQ==/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/services/llm/llm-service.test.ts`

Expected: FAIL，因为当前 `ChatMessage['content']` 仅支持字符串，或者请求体里没有 `image_url`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/services/llm/types.ts
export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; data: string };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContentPart[];
}

// src/services/llm/llmService.ts
function toOpenAIContent(content: ChatMessage['content']) {
  if (typeof content === 'string') return content;
  return content.map(part => (
    part.type === 'text'
      ? { type: 'text', text: part.text }
      : {
          type: 'image_url',
          image_url: { url: `data:${part.mimeType};base64,${part.data}` },
        }
  ));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test src/services/llm/llm-service.test.ts`

Expected: PASS，并保留现有文本模型测试全部通过

- [ ] **Step 5: Commit**

```bash
git add src/services/llm/types.ts src/services/llm/llmService.ts src/services/llm/llm-service.test.ts
git commit -m "feat: add multimodal llm transport"
```

### Task 3: 视觉补填 Prompt 与结果校验

**Files:**
- Modify: `src/services/llm/prompts.ts`
- Create: `src/services/llm/visualRegionFill.ts`
- Test: `src/services/llm/visualRegionFill.test.ts`

**Interfaces:**
- Consumes:
  - `VisualRegionFillPayload`
  - `UserProfile`
  - `ChatContentPart[]`
- Produces:
  - `buildVisualRegionFillPrompt(payload: VisualRegionFillPayload, profile: UserProfile): { system: string; userParts: ChatContentPart[] }`
  - `parseVisualRegionFillResponse(raw: string): VisualRegionFillResult`
  - `validateVisualRegionMappings(result, payload, profile): VisualRegionFillResult['mappings']`

- [ ] **Step 1: Write the failing test**

```ts
test('过滤不存在 controlId、空值和不在 options 中的结果', () => {
  const payload: VisualRegionFillPayload = {
    requestId: 'req-1',
    domain: 'jobs.bytedance.com',
    image: { base64: 'ZmFrZQ==', mimeType: 'image/png', width: 800, height: 400 },
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
  };

  const profile = {
    personal: { name: '张三', gender: '', birthDate: '', phone: '', email: '' },
    education: [{ id: 'edu-1', school: 'A', major: 'B', degree: '硕士', startDate: '2022-09', endDate: '2025-06' }],
    experience: [],
    projects: [],
    customInformation: [],
    skills: [],
    certifications: [],
  };

  const mappings = validateVisualRegionMappings([
    { controlId: 'ctrl-degree', fieldMeaning: '学历', matchedProfilePath: 'education.0.degree', value: '硕士' },
    { controlId: 'ghost', fieldMeaning: '学历', matchedProfilePath: 'education.0.degree', value: '硕士' },
    { controlId: 'ctrl-degree', fieldMeaning: '学历', matchedProfilePath: 'education.0.degree', value: '博士' },
  ], payload, profile as any);

  assert.deepEqual(mappings, [
    { controlId: 'ctrl-degree', fieldMeaning: '学历', matchedProfilePath: 'education.0.degree', value: '硕士' },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/services/llm/visualRegionFill.test.ts`

Expected: FAIL with `Cannot find module './visualRegionFill.ts'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/services/llm/prompts.ts
export function buildVisualRegionFillPrompt(payload: VisualRegionFillPayload, profile: UserProfile) {
  return {
    system: `你是网申视觉补填助手。截图是主语义输入，controls 是唯一允许输出目标。只能使用候选人资料中的已有值，不确定时返回空字符串，只返回严格 JSON。`,
    userParts: [
      { type: 'text', text: `网站：${payload.domain}\n候选人资料：${JSON.stringify(profile, null, 2)}\n控件清单：${JSON.stringify(payload.controls, null, 2)}\n请返回 {"mappings":[...]} JSON。` },
      { type: 'image', mimeType: payload.image.mimeType, data: payload.image.base64 },
    ],
  };
}

// src/services/llm/visualRegionFill.ts
export function validateVisualRegionMappings(mappings, payload, profile) {
  const controls = new Map(payload.controls.map(control => [control.controlId, control]));
  const getProfileValue = (path: string) => path.split('.').reduce<any>((acc, key) => acc?.[Number.isNaN(Number(key)) ? key : Number(key)], profile);

  return mappings.filter(item => {
    const control = controls.get(item.controlId);
    if (!control) return false;
    if (typeof item.value !== 'string' || !item.value.trim()) return false;
    if (getProfileValue(item.matchedProfilePath) !== item.value) return false;
    return control.options.length === 0 || control.options.includes(item.value);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test src/services/llm/visualRegionFill.test.ts`

Expected: PASS，并且 prompt 中包含图片 block 和“只能输出已有 controlId”的规则

- [ ] **Step 5: Commit**

```bash
git add src/services/llm/prompts.ts src/services/llm/visualRegionFill.ts src/services/llm/visualRegionFill.test.ts
git commit -m "feat: add visual region fill prompt and validation"
```

### Task 4: Background 截图编排与视觉 Handler

**Files:**
- Create: `src/background/visualRegionFill.ts`
- Modify: `src/background/index.ts`
- Modify: `src/offscreen/index.ts`
- Test: `src/background/visualRegionFill.test.ts`

**Interfaces:**
- Consumes:
  - `supportsVisionInput(config)`
  - `buildVisualRegionFillPrompt(payload, profile)`
  - `validateVisualRegionMappings(...)`
  - `chrome.tabs.captureVisibleTab`
- Produces:
  - `handleVisualRegionFill(payload: VisualRegionFillPayload): Promise<MessageResponse<VisualRegionFillResult>>`
  - `captureVisibleRegion(windowId: number, selectionRect: DOMRectLike): Promise<{ base64: string; mimeType: 'image/png'; width: number; height: number }>`

- [ ] **Step 1: Write the failing test**

```ts
test('视觉模型未开启时 handler 直接返回可读错误', async () => {
  const response = await handleVisualRegionFill({
    requestId: 'req-1',
    domain: 'jobs.bytedance.com',
    image: { base64: 'ZmFrZQ==', mimeType: 'image/png', width: 10, height: 10 },
    controls: [],
  }, {
    getLLMConfig: async () => ({
      provider: LLMProvider.CUSTOM,
      apiKey: 'sk-test',
      baseUrl: 'https://example.com/v1',
      model: 'custom-model',
      visionEnabled: false,
    }),
    getUserProfile: async () => null,
  } as any);

  assert.equal(response.success, false);
  assert.match(response.error || '', /不支持图片输入/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/background/visualRegionFill.test.ts`

Expected: FAIL with `Cannot find module './visualRegionFill.ts'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/background/visualRegionFill.ts
export async function handleVisualRegionFill(payload: VisualRegionFillPayload, deps = defaultDeps) {
  const config = await deps.getLLMConfig();
  if (!config?.apiKey) {
    return { success: false, error: '请先在设置中配置 AI 服务' };
  }

  const vision = supportsVisionInput(config);
  if (!vision.supported) {
    return { success: false, error: '当前模型不支持图片输入，请在设置中切换到支持视觉输入的模型' };
  }

  const profile = await deps.getUserProfile();
  if (!profile) {
    return { success: false, error: '请先保存个人资料' };
  }

  const { system, userParts } = buildVisualRegionFillPrompt(payload, profile);
  const llm = new LLMService(config);
  const result = await llm.chat([
    { role: 'system', content: system },
    { role: 'user', content: userParts },
  ]);

  const parsed = parseVisualRegionFillResponse(result.content);
  const mappings = validateVisualRegionMappings(parsed.mappings, payload, profile);
  return mappings.length > 0
    ? { success: true, data: { mappings } }
    : { success: false, error: 'AI 未返回可写入的可靠结果' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test src/background/visualRegionFill.test.ts`

Expected: PASS，并且 `src/background/index.ts` 能识别 `AI_FILL_VISUAL_REGION`

- [ ] **Step 5: Commit**

```bash
git add src/background/visualRegionFill.ts src/background/visualRegionFill.test.ts src/background/index.ts src/offscreen/index.ts
git commit -m "feat: add background visual region fill handler"
```

### Task 5: Popup 与 Content 接线、控件写回和总回归

**Files:**
- Create: `src/content/visualRegionFill.ts`
- Modify: `src/content/index.ts`
- Modify: `src/popup/App.tsx`
- Modify: `package.json`
- Test: `src/content/visualRegionFill.test.ts`

**Interfaces:**
- Consumes:
  - `supportsVisionInput(config)`
  - `VisualRegionFillPayload`
  - `VisualRegionFillResult`
  - `formFiller.fillElementValues(values, shouldContinue)`
- Produces:
  - `beginVisualRegionFill(): void`
  - `serializeVisualControls(root, selectionRect): VisualRegionFillPayload['controls']`
  - `applyVisualRegionMappings(mappings, controlsById, shouldContinue): Promise<number>`

- [ ] **Step 1: Write the failing test**

```ts
test('只序列化选区内的空白可写控件，并保留 controlId 与 options', () => {
  const controls = serializeVisualControls([
    {
      controlId: 'ctrl-phone',
      value: '',
      rect: { left: 10, top: 10, width: 120, height: 36 },
      label: '手机号',
      name: 'phone',
      tagName: 'input',
      options: [],
    },
    {
      controlId: 'ctrl-degree',
      value: '',
      rect: { left: 10, top: 80, width: 120, height: 36 },
      label: '学历',
      name: 'degree',
      tagName: 'select',
      options: ['本科', '硕士'],
    },
    {
      controlId: 'ctrl-filled',
      value: '已有值',
      rect: { left: 10, top: 160, width: 120, height: 36 },
      label: '邮箱',
      name: 'email',
      tagName: 'input',
      options: [],
    },
  ], { left: 0, top: 0, right: 200, bottom: 140 });

  assert.deepEqual(controls.map(item => item.controlId), ['ctrl-phone', 'ctrl-degree']);
  assert.deepEqual(controls[1].options, ['本科', '硕士']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/content/visualRegionFill.test.ts`

Expected: FAIL with `Cannot find module './visualRegionFill.ts'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/popup/App.tsx
const llmConfigResponse = await MessageService.sendMessage<LLMConfig>({ type: 'GET_LLM_CONFIG' });
const vision = llmConfigResponse.success && llmConfigResponse.data
  ? supportsVisionInput(llmConfigResponse.data)
  : { supported: false };
if (!vision.supported) {
  throw new Error('当前模型不支持图片输入，请在设置中切换到支持视觉输入的模型');
}

// src/content/visualRegionFill.ts
export function serializeVisualControls(candidates, selectionRect) {
  return candidates
    .filter(item => !item.value?.trim())
    .filter(item => !(item.rect.right < selectionRect.left || item.rect.left > selectionRect.right || item.rect.bottom < selectionRect.top || item.rect.top > selectionRect.bottom))
    .map(item => ({
      controlId: item.controlId,
      tagName: item.tagName,
      label: item.label,
      name: item.name,
      placeholder: item.placeholder || '',
      options: item.options,
      rect: { left: item.rect.left, top: item.rect.top, width: item.rect.width, height: item.rect.height },
      contextText: item.contextText || '',
    }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test src/content/visualRegionFill.test.ts && npm test && npm run build && npm run lint`

Expected: PASS，且 `npm test` 包含新增测试文件，`build` 和 `lint` 仍通过

- [ ] **Step 5: Commit**

```bash
git add src/content/visualRegionFill.ts src/content/visualRegionFill.test.ts src/content/index.ts src/popup/App.tsx package.json
git commit -m "feat: wire visual-first ai region fill flow"
```

## Self-Review

### Spec coverage

- 视觉优先、单次重推理：Task 2、Task 3、Task 4
- 无视觉模型阻断且不降级：Task 1、Task 4、Task 5
- AI 同时做字段理解和资料匹配：Task 3、Task 4
- 输出只能映射到本地 `controlId`：Task 1、Task 3、Task 5
- 结果写回前必须做本地校验：Task 3、Task 4、Task 5
- 不影响 `快速填充` 和 `AI 扫描填充`：Task 4、Task 5 的接线范围控制
- 第一版不做项：计划中没有任何整页视觉扫描、人工确认或隐式降级任务

### Placeholder scan

- 未使用 `TODO`、`TBD`、`类似 Task N` 等占位写法
- 每个任务都给出了明确文件、接口、测试样例、命令和提交信息

### Type consistency

- 共享 payload 统一命名为 `VisualRegionFillPayload`
- 返回结构统一命名为 `VisualRegionFillResult`
- 视觉能力判断统一使用 `supportsVisionInput(config)`
- 新消息统一命名为 `AI_FILL_VISUAL_REGION`

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-06-visual-first-ai-region-fill.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
