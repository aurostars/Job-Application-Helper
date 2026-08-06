# Task 3 报告：视觉补填 Prompt 与结果校验

## 任务范围

根据 `task-3-brief.md`，本次仅实现以下内容：

- 视觉补填 prompt 构建
- 模型返回结果解析
- 结果映射校验
- 相关测试与覆盖验证

明确不做：

- background handler 接线
- 截图流程接线
- 聚焦字段写入链路改造

## TDD 执行过程

### 1. 先写失败测试

新增 `src/services/llm/visualRegionFill.test.ts`，先覆盖三类行为：

1. prompt 中必须包含图片 block，且系统规则声明“只能输出已有 controlId”
2. `validateVisualRegionMappings()` 会过滤：
   - 不存在的 `controlId`
   - 空字符串 value
   - 不在控件 `options` 内的 value
3. `parseVisualRegionFillResponse()` 能从模型返回的 JSON 中提取 `mappings`

### 2. 验证测试先失败

执行：

```bash
node --experimental-strip-types --test src/services/llm/visualRegionFill.test.ts
```

首次失败符合预期，报错为：

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../src/services/llm/visualRegionFill.ts'
```

说明测试确实先于实现存在。

### 3. 最小实现

按 brief 实现了两部分：

#### `src/services/llm/prompts.ts`

新增 `buildVisualRegionFillPrompt(payload, profile)`：

- system prompt 明确声明截图是主语义输入
- 明确声明 `controls` 是唯一允许输出目标
- 明确声明只能输出已有 `controlId`
- 明确声明只能复用候选人已有资料值
- 明确声明 `options` 必须精确匹配
- 返回 `ChatContentPart[]`，其中包含：
  - 文本 block
  - 图片 block

#### `src/services/llm/visualRegionFill.ts`

新增：

- `parseVisualRegionFillResponse(raw)`
- `validateVisualRegionMappings(result, payload, profile)`

其中校验逻辑包括：

- `controlId` 必须存在于 `payload.controls`
- `value` 必须为非空字符串
- `matchedProfilePath` 指向的 profile 原始值必须与 `value` 完全一致
- 若控件存在 `options`，则 `value` 必须命中候选项

## 类型兼容处理

当前 worktree 中的 `src/shared/types.ts` 尚未体现 brief 所依赖的视觉补填结构；为避免实现与测试脱节，我补充了以下类型定义，并保留旧字段的兼容性：

- `VisualRegionImagePayload`
- `VisualRegionControlRect`
- `VisualRegionControlCandidate`
- `VisualRegionFillMapping`
- 扩展后的 `VisualRegionFillPayload`
- 扩展后的 `VisualRegionFillResult`

兼容策略：

- 保留原有 `value/confidence/model`
- 新增 `mappings`
- 新增字段均采用向后兼容方式扩展，没有接入 background / screenshot 流程

## 变更文件

- `src/services/llm/prompts.ts`
- `src/services/llm/visualRegionFill.ts`
- `src/services/llm/visualRegionFill.test.ts`
- `src/shared/types.ts`

## 测试记录

### 新增测试单测

执行：

```bash
node --experimental-strip-types --test src/services/llm/visualRegionFill.test.ts
```

结果：

- 3/3 通过

### 现有测试回归

执行：

```bash
npm test
```

结果：

- 88/88 通过

### 覆盖测试

执行：

```bash
node --experimental-strip-types --experimental-test-coverage --test \
  src/services/llm/visualRegionFill.test.ts \
  src/services/llm/visionCapabilities.test.ts \
  src/services/llm/llm-service.test.ts
```

结果摘要：

- 20/20 通过
- `src/services/llm/visualRegionFill.ts` 覆盖率：
  - line: 97.33%
  - branch: 72.73%
  - funcs: 100.00%

## 风险与顾虑

1. `src/shared/types.ts` 中视觉补填契约在当前 worktree 里并未完整落地，本次为支撑 Task 3 做了兼容扩展；后续若 Task 1 的正式契约再落地，需要再对齐一次，避免重复定义或字段命名漂移。
2. 当前只完成 prompt、parse、validate 三段逻辑，尚未接到 background handler 与截图采集链路，因此端到端行为仍未验证。
3. `parseVisualRegionFillResponse()` 目前只保证 JSON 结构可解析并抽取合法 mapping，对“模型输出多个同 controlId 候选”的冲突裁决未做额外策略，后续若接入真实调用链，可再根据产品规则决定去重/优先级策略。

## 结论

Task 3 范围内的 prompt 构建、结果解析、结果校验已完成，并通过新增单测、回归测试和覆盖测试验证。

---

## Fix Report（评审问题修复）

### 本次仅修复的两点

1. `VisualRegionFillPayload.image`、`controls` 改为必填，不再允许可选；`buildVisualRegionFillPrompt()` 在实现层新增无图输入保护，若缺少截图直接抛出 `缺少视觉截图输入`，避免生成无视觉输入的 prompt。
2. 不再复用 `VisualRegionFillResult` 承载 mapping 结果；新增独立的 `VisualRegionFillMappingResult` 作为视觉补填解析结果类型，同时保留旧 `VisualRegionFillResult` 仅服务于 `APPLY_FOCUSED_FIELD` 协议，并继续要求 `value` 为必填。

### 变更文件

- `src/shared/types.ts`
- `src/services/llm/prompts.ts`
- `src/services/llm/visualRegionFill.ts`
- `src/services/llm/visualRegionFill.test.ts`

### TDD 记录

先补测试，再验证失败：

- 新增“视觉补填 prompt 不允许无图输入”测试
- 新增“旧的聚焦字段结果协议仍要求 value”测试
- 将 `createPayload()` 改为直接满足正式类型约束，去掉对可选 `image/controls` 的宽松断言

失败验证命令：

```bash
node --experimental-strip-types --test src/services/llm/visualRegionFill.test.ts
```

失败现象：

```text
✖ 视觉补填 prompt 不允许无图输入
AssertionError [ERR_ASSERTION]: Missing expected exception.
```

随后补上最小实现并重新验证通过。

### 修复后验证

1. 单测：

```bash
node --experimental-strip-types --test src/services/llm/visualRegionFill.test.ts
```

结果：5/5 通过

2. 覆盖率：

```bash
node --experimental-strip-types --experimental-test-coverage --test src/services/llm/visualRegionFill.test.ts
```

结果摘要：

- 5/5 通过
- `src/services/llm/visualRegionFill.ts`
  - line: 97.33%
  - branch: 80.00%
  - funcs: 100.00%

3. 类型检查：

```bash
npx tsc -p tsconfig.app.json --noEmit
```

结果：通过

### 当前顾虑

1. 这次只收紧了 Task 3 范围内的视觉补填契约与解析结果类型，尚未扩展到 background/content 的新 mapping 接线；这与本次要求一致。
2. `prompts.ts` 的覆盖率仍偏低，因为本次只触达视觉补填分支；未修改的答题/简历/模块补填 prompt 逻辑未纳入本次测试范围。
