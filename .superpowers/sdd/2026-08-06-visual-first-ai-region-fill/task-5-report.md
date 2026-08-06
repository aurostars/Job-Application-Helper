# Task 5 报告：Popup 与 Content 接线、控件写回和总回归

## 任务范围

按 `task-5-brief.md`，本次只实现以下范围：

- 新增 `src/content/visualRegionFill.ts`，承载视觉优先框选补填的 content 侧编排
- 修改 `src/content/index.ts`，只保留入口接线，把视觉链路迁出主文件
- 修改 `src/popup/App.tsx`，在启动框选前阻断不支持视觉输入的模型
- 修改 `src/background/index.ts`，让 `AI_FILL_VISUAL_REGION` 在缺图时自动补采截图后进入已有 Task 4 handler
- 修改 `src/shared/types.ts`，允许 content 先传控件与选区、由 background 补齐截图
- 修改 `package.json`，把新增测试纳入 `npm test`
- 新增 `src/content/visualRegionFill.test.ts`，覆盖控件序列化与映射写回

明确未做：

- 不改造 `AI 扫描填充`
- 不改造 `快速填充`
- 不增加人工确认步骤
- 不做无视觉模型时的隐式降级

## TDD 执行过程

### 1. 先写失败测试

先新增 `src/content/visualRegionFill.test.ts`，覆盖两件事：

1. `serializeVisualControls()` 只序列化选区内的空白可写控件，并保留 `controlId` 与 `options`
2. `applyVisualRegionMappings()` 只把命中本地 `controlsById` 的合法映射交给写回层

新增测试直接引用尚不存在的 `src/content/visualRegionFill.ts`，确保测试先失败。

### 2. 验证测试先失败

执行：

```bash
node --experimental-strip-types --test src/content/visualRegionFill.test.ts
```

首次失败符合预期，报错为：

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../src/content/visualRegionFill.ts'
```

这说明测试确实先于实现存在，满足 TDD 的 red 阶段要求。

### 3. 最小实现

随后补上最小实现，并在回归时修正两类集成问题：

1. background 路由原本直接把 payload 转给 Task 4 handler，没有在 content 缺图时补采截图；
2. `handleMessage()` 改造后误用了 `_sender` 变量名，导致全量回归中路由测试失败。

修正后重新跑定向测试、全量测试、build 与 lint，直到全部通过。

## 具体实现

### 一、`src/content/visualRegionFill.ts`

新增视觉优先 content 编排模块，导出：

- `createVisualRegionFillController()`
- `serializeVisualControls()`
- `applyVisualRegionMappings()`

其中：

1. `createVisualRegionFillController()` 复用原有框选交互体验
2. 用户完成点击选区或拖拽框选后，收集选区内空白可写控件
3. 只序列化最小可解释信息：`controlId`、`label`、`name`、`placeholder`、`options`、`rect`、`contextText`
4. 发送 `AI_FILL_VISUAL_REGION`
5. 收到 background 返回的 `mappings` 后，仅按本地 `controlId` 映射写回
6. 复用 `formFiller.fillElementValues()`，保留日期区间字段的写回顺序
7. 提示“成功 / 部分成功 / 无结果 / 失败 / 已终止”等真实状态

关键实现片段：

```ts
const response = await deps.sendRuntimeMessage<VisualRegionFillMappingResult>({
  type: 'AI_FILL_VISUAL_REGION',
  payload: {
    requestId,
    domain: window.location.hostname,
    controls,
    region: normalizeRuntimeSelectionRect(input.selectionRect),
    pageContext: normalizeContextText(input.pageContext),
  } as VisualRegionFillPayload,
});
```

```ts
return candidates
  .filter(candidate => !String(candidate.value || '').trim())
  .filter(candidate => intersectsSelection(candidate.rect, bounds))
  .map(candidate => ({
    controlId: candidate.controlId,
    tagName: candidate.tagName,
    label: candidate.label,
    name: candidate.name,
    placeholder: candidate.placeholder || '',
    options: candidate.options || [],
    rect: {
      left: candidate.rect.left,
      top: candidate.rect.top,
      width: candidate.rect.width,
      height: candidate.rect.height,
    },
    contextText: candidate.contextText || '',
  }));
```

```ts
const filledCount = await applyVisualRegionMappings(
  response.data.mappings,
  controlsById,
  () => !cancelled,
  deps.fillElementValues,
);
```

### 二、`src/content/index.ts`

这里不再堆叠视觉补填细节，只保留入口接线：

```ts
const visualRegionFillController = createVisualRegionFillController({
  sendRuntimeMessage,
  fillElementValues: (values, shouldContinue) => formFiller.fillElementValues(
    values as Parameters<FormFiller['fillElementValues']>[0],
    shouldContinue,
  ),
});
```

```ts
function startAIRegionSelection() {
  visualRegionFillController.beginVisualRegionFill();
}
```

同时删除了原先内联在 `src/content/index.ts` 的旧框选逻辑，避免主文件继续膨胀。

### 三、`src/popup/App.tsx`

在点击“AI 框选补填”按钮时，先读取当前 LLM 配置，并用 `supportsVisionInput(config)` 做显式阻断。

关键实现片段：

```ts
const llmConfigResponse = await MessageService.sendMessage<LLMConfig>({
  type: 'GET_LLM_CONFIG',
});
const vision = llmConfigResponse.success && llmConfigResponse.data
  ? supportsVisionInput(llmConfigResponse.data)
  : { supported: false as const };
if (!vision.supported) {
  throw new Error('当前模型不支持图片输入，请在设置中切换到支持视觉输入的模型');
}
```

这样可以在 popup 入口就阻断不支持视觉输入的模型，不再让用户无效进入框选模式。

### 四、`src/background/index.ts`

Task 4 已有 `handleVisualRegionFill()` 与 `captureVisibleRegion()`，但原先的路由只支持“payload 已自带 image”的情况。

本次补上真正的接线层：

```ts
case 'AI_FILL_VISUAL_REGION':
  return await handleVisualRegionFillRequest((message as any).payload, sender);
```

并新增：

```ts
async function handleVisualRegionFillRequest(
  payload: VisualRegionFillPayload,
  sender: chrome.runtime.MessageSender,
): Promise<MessageResponse> {
  if (payload.image) {
    return handleVisualRegionFill(payload);
  }

  const windowId = sender.tab?.windowId;
  if (typeof windowId !== 'number') {
    return { success: false, error: '无法获取当前页面截图' };
  }

  const image = await captureVisibleRegion(windowId, payload.region);
  return handleVisualRegionFill({ ...payload, image });
}
```

这样 content 侧只需要提交控件清单与选区，background 会按 Task 4 的截图编排补齐视觉输入，再进入同一条视觉推理链路。

### 五、`src/shared/types.ts`

将 `VisualRegionFillPayload.image` 调整为可选：

```ts
image?: VisualRegionImagePayload;
```

目的不是放宽最终 prompt 约束，而是允许 content -> background 的请求在截图尚未补齐时先传输控件与选区；真正进到 prompt 之前仍由 `buildVisualRegionFillPrompt()` 强制校验必须有图。

### 六、测试接线与清理

1. 在 `package.json` 的 `test` 脚本中加入 `src/content/visualRegionFill.test.ts`
2. 顺手清掉一个历史 lint warning：删除 `scripts/package-extension.js` 中未使用的 `run()` helper
3. 顺手删掉 `src/services/llm/visualRegionFill.test.ts` 中未使用的局部变量

## 变更文件

- `package.json`
- `scripts/package-extension.js`
- `src/background/index.ts`
- `src/background/visualRegionFill.ts`
- `src/content/index.ts`
- `src/content/visualRegionFill.ts`
- `src/content/visualRegionFill.test.ts`
- `src/popup/App.tsx`
- `src/services/llm/visualRegionFill.test.ts`
- `src/shared/types.ts`

## 测试记录

### 1. TDD 红阶段验证

执行：

```bash
node --experimental-strip-types --test src/content/visualRegionFill.test.ts
```

结果：

- 失败，报 `Cannot find module './visualRegionFill.ts'`

### 2. Task 5 定向测试

执行：

```bash
node --experimental-strip-types --test src/content/visualRegionFill.test.ts
```

结果：

- 2/2 通过

覆盖内容：

- 只序列化选区内的空白可写控件
- 只把命中本地 `controlId` 的映射交给写回层

### 3. 相关覆盖测试

执行：

```bash
node --experimental-strip-types --experimental-test-coverage --test \
  src/services/llm/visualRegionFill.test.ts \
  src/background/visualRegionFill.test.ts \
  src/content/visualRegionFill.test.ts \
  src/parsers/offscreen-routing.test.ts
```

结果摘要：

- 17/17 通过
- `src/background/visualRegionFill.ts`
  - line: 90.32%
  - branch: 53.33%
  - funcs: 100.00%
- `src/content/visualRegionFill.ts`
  - line: 23.11%
  - branch: 62.50%
  - funcs: 34.78%
- `src/services/llm/visualRegionFill.ts`
  - line: 97.33%
  - branch: 80.00%
  - funcs: 100.00%

说明：

- `src/content/visualRegionFill.ts` 当前覆盖率偏低，原因是这次只按 brief 做了纯函数与关键接线验证，没有在 Node 侧补大量 DOM 交互模拟；
- 但核心约束“控件序列化”和“映射只按本地 controlId 写回”已经被最小测试锁住；
- background 与 prompt/parse/validate 主链路都进入了覆盖回归。

### 4. 全量回归测试

执行：

```bash
npm test
```

结果：

- 98/98 通过

### 5. 构建与静态检查

执行：

```bash
npm run build
npm run lint
```

结果：

- `build` 通过
- `lint` 通过，0 warning / 0 error

## 提交信息

提交信息为：

```bash
feat: wire visual-first ai region fill flow
```

## 风险与顾虑

1. 当前 `src/content/visualRegionFill.ts` 的定向测试主要锁住了纯函数与接线边界，尚未对完整框选 DOM 交互做端到端模拟；后续若需要进一步稳固，可再补浏览器级 UI 测试。
2. `AI_FILL_VISUAL_REGION` 现在由 background 在缺图时补采截图，依赖 `sender.tab.windowId`；若未来有非 tab 场景复用这条消息，需要再补更明确的上下文约束。
3. `npm run build` 仍会输出既有 PDF.js 资源提醒（worker/cmaps/fonts），但本次命令已通过，且不属于 Task 5 变更引入的问题。

## 结论

Task 5 已按 brief 完成：

- popup 已在入口处阻断无视觉模型
- content 已拆出视觉补填模块并完成接线
- 控件序列化与按 `controlId` 写回已实现
- background 已在真实入口上补齐截图编排
- 新测试已纳入 `npm test`
- 已完成 TDD、覆盖测试、全量测试、build 与 lint 验证

---

## Fix Report（评审意见：保持主链路严格有图类型）

### 修复范围

只修这一条评审意见，不扩展到其他重构：

- 恢复 `VisualRegionFillPayload.image` 为必填，保证进入视觉推理主链路的 payload 始终是严格有图类型
- 新增仅供 content -> background 入口使用的 `VisualRegionFillRequestPayload`
- 由 background 在无图入口补齐截图后，再组装成严格 `VisualRegionFillPayload` 传给 `handleVisualRegionFill()`

### TDD 记录

先新增类型断言文件 `src/shared/visualRegionFillPayload.typecheck.ts`，约束两件事：

1. content/background 无图入口必须使用单独的 `VisualRegionFillRequestPayload`
2. `VisualRegionFillPayload` 不能接受缺图对象

先执行：

```bash
npx tsc -b
```

失败结果符合预期：

```text
error TS2724: "./types.ts" has no exported member named 'VisualRegionFillRequestPayload'
error TS2578: Unused '@ts-expect-error' directive.
```

随后做最小实现，并重新执行验证直到通过。

### 实际修改

1. `src/shared/types.ts`
   - 抽出 `VisualRegionFillPayloadBase`
   - `VisualRegionFillPayload` 改回 `image: VisualRegionImagePayload`
   - 新增 `VisualRegionFillRequestPayload`
   - `AI_FILL_VISUAL_REGION` 消息 payload 改为 `VisualRegionFillPayload | VisualRegionFillRequestPayload`

2. `src/content/visualRegionFill.ts`
   - content 发消息时不再伪装成严格 `VisualRegionFillPayload`
   - 改为用 `satisfies VisualRegionFillRequestPayload` 明确声明这是“无图入口请求”

3. `src/background/index.ts`
   - `handleVisualRegionFillRequest()` 接受联合类型入口
   - 若已是严格有图 payload，直接进入 `handleVisualRegionFill()`
   - 若是无图请求，则先 `captureVisibleRegion()`，再组装：

```ts
const strictPayload: VisualRegionFillPayload = { ...payload, image };
return handleVisualRegionFill(strictPayload);
```

4. `src/background/visualRegionFill.test.ts`
   - 将背景路由测试改成“无图请求”场景
   - 断言 background 确实先发出 `CROP_IMAGE_OFFSCREEN`，再走后续主链路

### 本次最小验证

执行：

```bash
npx tsc -b
node --experimental-strip-types --test src/background/visualRegionFill.test.ts
```

结果：

- `npx tsc -b` 通过，说明严格有图类型与无图入口类型都已正确收敛
- 定向测试 3/3 通过，其中新增覆盖了“background 为无图请求补截图后再进入主链路”

### 本次提交前顾虑

1. `AI_FILL_VISUAL_REGION` 目前仍以联合类型作为消息入口，这符合“入口可无图、主链路必须有图”的要求；若未来继续扩展其他调用方，需要继续沿用这一边界，避免再次把严格主链路类型放宽。
2. 这次最小验证主要锁住了类型边界与 background 补图编排，没有重跑与本条评审无关的更大范围回归。
