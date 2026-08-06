# Task 4 报告：Background 截图编排与视觉 Handler

## 任务范围

按 `task-4-brief.md`，本次只实现以下范围：

- 新增 background 视觉补填 handler：`src/background/visualRegionFill.ts`
- 在 background 消息分发中接入 `AI_FILL_VISUAL_REGION`
- 在 offscreen document 中补上截图裁剪能力
- 新增/补充 Task 4 相关测试
- 运行相关覆盖测试与全量测试
- 提交代码

明确未做：

- popup 入口接线
- content 入口改造
- 聚焦字段写入协议改造
- 视觉选择器前端交互

## TDD 执行过程

### 1. 先写失败测试

先新增 `src/background/visualRegionFill.test.ts`，覆盖三件事：

1. `handleVisualRegionFill()` 在视觉模型未开启时直接返回可读错误
2. `captureVisibleRegion()` 会调用 `chrome.tabs.captureVisibleTab`，并把整页截图交给 offscreen 裁剪
3. `src/background/index.ts` 能识别 `AI_FILL_VISUAL_REGION` 并返回视觉补填结果

初始测试文件直接引用尚不存在的 `src/background/visualRegionFill.ts`，以确保测试先失败。

### 2. 验证测试先失败

执行：

```bash
node --experimental-strip-types --test src/background/visualRegionFill.test.ts
```

首次失败符合预期，报错为：

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../src/background/visualRegionFill.ts'
```

这说明测试确实先于实现存在，满足 TDD 的 red 阶段要求。

### 3. 最小实现

随后补上最小实现，分三部分完成。

## 具体实现

### 一、`src/background/visualRegionFill.ts`

新增两个导出：

- `handleVisualRegionFill(payload)`
- `captureVisibleRegion(windowId, selectionRect)`

其中 `handleVisualRegionFill()` 的职责是：

1. 读取 LLM 配置
2. 先用 `supportsVisionInput(config)` 守住视觉模型开关
3. 读取用户资料
4. 使用 `buildVisualRegionFillPrompt(payload, profile)` 构造多模态消息
5. 调用 `LLMService.chat()`
6. 用 `parseVisualRegionFillResponse()` 解析结果
7. 用 `validateVisualRegionMappings()` 过滤非法映射
8. 当没有可靠映射时返回可读失败信息

关键实现片段：

```ts
const vision = supportsVisionInput(config);
if (!vision.supported) {
  return {
    success: false,
    error: `当前模型不支持图片输入${vision.reason ? `：${vision.reason}` : ''}`,
  };
}

const { system, userParts } = buildVisualRegionFillPrompt(payload, profile);
const result = await llm.chat([
  { role: 'system', content: system },
  { role: 'user', content: userParts },
]);

const parsed = parseVisualRegionFillResponse(result.content);
const mappings = validateVisualRegionMappings(parsed.mappings, payload, profile);
```

`captureVisibleRegion()` 的职责是：

1. 通过 `chrome.tabs.captureVisibleTab(..., { format: 'png' })` 获取当前可见页截图
2. 确保 offscreen document 存在
3. 向 offscreen 发送 `CROP_IMAGE_OFFSCREEN`
4. 返回裁剪后的 `image/png` base64 与宽高

关键实现片段：

```ts
const imageDataUrl = await deps.captureVisibleTab(windowId, { format: 'png' });
await ensureOffscreenDocument(deps);

const response = await deps.sendRuntimeMessage({
  type: 'CROP_IMAGE_OFFSCREEN',
  payload: {
    imageDataUrl,
    selectionRect: normalizeRect(selectionRect),
  },
});
```

同时新增了 `DOMRectLike` 以兼容来自页面选择框的矩形参数。

### 二、`src/background/index.ts`

在现有消息分发中增加了视觉 handler 接线：

```ts
case 'AI_FILL_VISUAL_REGION':
  return await handleVisualRegionFill((message as any).payload);
```

并引入：

```ts
import { handleVisualRegionFill } from './visualRegionFill.ts';
```

这样 Task 4 范围内只完成 background handler 接线，不改 popup/content 入口，符合 brief 约束。

### 三、`src/offscreen/index.ts`

在原有“文件解析”能力之外，新增截图裁剪能力，支持新的消息：

- `CROP_IMAGE_OFFSCREEN`

实现方式：

1. 在 offscreen DOM 环境里加载截图 data URL
2. 用 canvas 按选择框裁剪
3. 输出 `image/png` 的 base64、宽、高

关键实现片段：

```ts
const canvas = document.createElement('canvas');
canvas.width = width;
canvas.height = height;

const context = canvas.getContext('2d');
context.drawImage(image, x, y, width, height, 0, 0, width, height);
const dataUrl = canvas.toDataURL('image/png');
```

这部分没有触碰已有 `PARSE_FILE_OFFSCREEN` 协议，仍保持原有简历解析链路兼容。

### 四、消息类型补充

为支撑 background/offscreen 新链路，在 `src/shared/types.ts` 中补充了两个消息协议：

```ts
| { type: 'AI_FILL_VISUAL_REGION'; payload: VisualRegionFillPayload }
| { type: 'CROP_IMAGE_OFFSCREEN'; payload: { imageDataUrl: string; selectionRect: VisualRegionSelectionRect } }
```

这是 Task 4 所需的最小类型补充，没有接 popup/content 入口。

### 五、测试接线

将 `src/background/visualRegionFill.test.ts` 与已有 `src/services/llm/visualRegionFill.test.ts` 加入 `package.json` 的 `test` 脚本，避免新能力只在单独命令里运行、没有进入回归集。

## 变更文件

- `package.json`
- `src/background/index.ts`
- `src/background/visualRegionFill.ts`
- `src/background/visualRegionFill.test.ts`
- `src/offscreen/index.ts`
- `src/shared/types.ts`

## 测试记录

### 1. TDD 红阶段验证

执行：

```bash
node --experimental-strip-types --test src/background/visualRegionFill.test.ts
```

结果：

- 失败，报 `Cannot find module './visualRegionFill.ts'`

### 2. Task 4 定向测试

执行：

```bash
node --experimental-strip-types --test src/background/visualRegionFill.test.ts
```

结果：

- 3/3 通过

覆盖内容：

- 视觉模型未开启时直接报错
- 可见区域截图经 background 编排后交由 offscreen 裁剪
- background `handleMessage()` 能识别 `AI_FILL_VISUAL_REGION`

### 3. 相关覆盖测试

执行：

```bash
node --experimental-strip-types --experimental-test-coverage --test \
  src/services/llm/visualRegionFill.test.ts \
  src/background/visualRegionFill.test.ts \
  src/parsers/offscreen-routing.test.ts
```

结果摘要：

- 15/15 通过
- `src/background/visualRegionFill.ts`
  - line: 90.85%
  - branch: 57.14%
  - funcs: 100.00%
- `src/services/llm/visualRegionFill.ts`
  - line: 97.33%
  - branch: 80.00%
  - funcs: 100.00%

说明：

- 分支覆盖没有继续刻意堆测试去追求 100%，当前已覆盖 Task 4 主链路、错误链路与 routing 链路
- `src/background/index.ts` 是大文件，coverage 里整体行覆盖率较低是因为本次只验证了新增路由分支，不属于 Task 4 范围外缺口

### 4. 全量回归测试

执行：

```bash
npm test
```

结果：

- 96/96 通过

## 提交信息

提交信息为：

```bash
feat: add background visual region fill handler
```

## 风险与顾虑

1. `captureVisibleRegion()` 当前只完成了“整页截图 -> offscreen 裁剪”的编排，默认假设传入坐标已经与可见区域截图坐标系对齐；若后续前端选择框坐标存在缩放、DPR 或页面滚动换算偏差，还需要在入口层补偿。
2. offscreen 裁剪当前复用了 `DOM_PARSER` offscreen reason，因为项目已有 offscreen 文档就是用它创建的；这在当前实现上可工作，但如果后续对 offscreen 用途做更细粒度治理，可能需要统一抽象成共享的 offscreen 管理器。
3. `src/background/index.ts` 仍然较大，本次仅做最小接线；如果后续继续在 background 堆叠视觉相关流程，建议再拆分消息路由与业务 handler，降低回归成本。

## 结论

Task 4 已按 brief 完成：

- background 视觉补填 handler 已实现
- 截图编排与 offscreen 裁剪已打通
- background 路由已接入 `AI_FILL_VISUAL_REGION`
- 未接 popup/content 入口
- 已完成 TDD、相关覆盖测试与全量回归测试

## Fix report（Task 4 单条评审意见）

### 评审意见

`src/background/visualRegionFill.ts` 在无视觉模型时返回的错误文案泄漏了内部 reason code（如 `NO_MODEL`、`PROVIDER_UNSUPPORTED`、`CUSTOM_VISION_DISABLED`），需要改为面向用户的中文提示，并补上能拦住该问题的最小测试。

### 本次修复范围

仅修改：

- `src/background/visualRegionFill.ts`
- `src/background/visualRegionFill.test.ts`

明确未改：

- popup/content 接线
- `src/services/llm/llmService.ts` 的其他错误文案
- Task 4 既有截图编排与 offscreen 流程

### TDD 记录

1. 先在 `src/background/visualRegionFill.test.ts` 增加断言，要求错误文案：
   - 返回中文可读提示
   - 不包含 `NO_MODEL|PROVIDER_UNSUPPORTED|CUSTOM_VISION_DISABLED`
2. 执行最小验证：

```bash
node --experimental-strip-types --test src/background/visualRegionFill.test.ts
```

首次失败，失败原因为：

```text
AssertionError [ERR_ASSERTION]:
'当前模型不支持图片输入：CUSTOM_VISION_DISABLED'
```

这说明测试成功拦住了内部 reason code 泄漏问题。

### 修复实现

在 `src/background/visualRegionFill.ts` 中新增 `mapVisionSupportError(reason)`，把内部 reason code 映射为中文提示：

- `NO_MODEL` → `请先在设置中选择支持图片输入的模型`
- `CUSTOM_VISION_DISABLED` → `当前自定义模型未开启视觉输入，请在设置中启用视觉能力后重试`
- `PROVIDER_UNSUPPORTED` → `当前模型不支持图片输入，请在设置中切换到支持视觉输入的模型`

并将原先直接拼接 `vision.reason` 的逻辑：

```ts
error: `当前模型不支持图片输入${vision.reason ? `：${vision.reason}` : ''}`,
```

替换为：

```ts
error: mapVisionSupportError(vision.reason),
```

### 最小验证结果

执行：

```bash
node --experimental-strip-types --test src/background/visualRegionFill.test.ts
```

结果：

- 3/3 通过

其中新增拦截断言验证了：

- 自定义模型未开启视觉能力时，返回明确中文提示
- 返回文案不再包含内部 reason code

### 提交

本次修复提交信息：

```bash
fix: hide visual capability reason codes in background errors
```

### 顾虑

1. 本次按评审要求只修了 background handler 对外返回文案；`src/services/llm/llmService.ts` 里仍存在内部 reason code 的异常拼接，但当前不在这条评审的修复范围内。
2. 当前最小测试只锁定了 `CUSTOM_VISION_DISABLED` 这条路径；`NO_MODEL` 与 `PROVIDER_UNSUPPORTED` 的映射由同一 helper 覆盖，但未额外扩展更多用例，以保持修改最小。
