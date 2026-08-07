# Task 3 报告：接入 App 与样式，并完成回归验证

## 结果概览

Task 3 已完成，侧边栏主应用现已把资料区块渲染正式委托给 `ProfileSections`，同时恢复了 `自我评价` 的单行展示样式，并补齐了侧边栏相关测试接入。

本次实现保持了既有状态管理、消息收发和写入逻辑不变，只把展示层从 `App` 内联 JSX 收敛到 `ProfileSections`，避免后续基本信息、教育经历、实习经历、项目经历和自定义信息出现重复维护。

## 需求对照

### 1. App 仅负责状态与消息收发，渲染委托给 `ProfileSections`

已在 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/App.tsx` 完成：

- 保留 `profile`、`status`、`workingKey`、`handleFieldClick()`、PiP 逻辑不变
- 删除 `App.tsx` 中内联的教育/实习/项目/自定义信息展示实现
- 改为在状态区之后直接渲染 `ProfileSections`

关键代码：

```tsx
<ProfileSections
  profile={profile}
  workingKey={workingKey}
  onFieldClick={handleFieldClick}
/>
```

### 2. 增加 `.field-value-single-line` 样式，确保单行显示

已在 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/index.css` 增加：

```css
.field-value-single-line {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: clip;
}
```

之所以使用 `clip` 而不是浏览器默认省略号，是为了继续以数据层产出的 `......` 作为唯一截断文案来源，避免出现浏览器额外补一个 `…` 导致显示不一致。

### 3. 自我评价单行显示时仍保留六个点摘要

已在 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/BasicInformationSection.tsx` 中让 `selfEvaluation` 字段附加 `field-value-single-line` 类名，但仍使用 `item.displayValue` 渲染：

```tsx
const valueClassName = [
  'field-value',
  item.empty ? 'empty-value' : '',
  item.key === 'selfEvaluation' ? 'field-value-single-line' : '',
].filter(Boolean).join(' ');
```

这样既能强制单行，又不会破坏 Task 1/2 已确认的数据层六个点摘要规则。

### 4. 顺手统一摘要阈值双源配置

按账本中的 deferred minor，一并统一了 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/basicInfo.ts` 里默认 24、调用 18 的双源配置问题。

当前实现改为单一常量：

```ts
export const SELF_EVALUATION_PREVIEW_MAX_CHARS = 18;

export function toSingleLinePreview(
  value: string,
  maxChars = SELF_EVALUATION_PREVIEW_MAX_CHARS
): string
```

`buildBasicInfoItems()` 改为直接调用 `toSingleLinePreview(raw)`，避免后续维护时两处阈值漂移。

## TDD 过程

### Red

先修改 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/ProfileSections.test.ts`，把原本“不存在 `field-value-single-line`”的断言改为“存在 `field-value-single-line` 且保留六个点文案”。

随后执行：

```bash
npx --yes tsx --test src/sidepanel/ProfileSections.test.ts src/sidepanel/navigation.test.ts
```

得到预期失败，失败点为：

- HTML 中没有 `field-value-single-line`
- 六个点摘要仍然存在，说明缺口只在样式接线而不在摘要文本本身

### Green

完成以下最小实现：

1. `App.tsx` 接入 `ProfileSections`
2. `BasicInformationSection.tsx` 为 `selfEvaluation` 追加单行样式类
3. `index.css` 增加 `.field-value-single-line`
4. `basicInfo.ts` 统一摘要阈值常量
5. `package.json` 把侧边栏测试接入测试脚本

## 验证结果

### 定向测试

命令：

```bash
npx --yes tsx --test src/sidepanel/basicInfo.test.ts src/sidepanel/ProfileSections.test.ts src/sidepanel/navigation.test.ts
```

结果：

```text
tests 8
pass 8
fail 0
```

覆盖点：

- 基本信息字段顺序
- 自我评价六个点摘要
- 基本信息在教育经历前展示
- 空值字段显示“未填写”且禁用
- 单行样式类存在且不破坏六个点文案
- 侧边栏 URL 与目标窗口参数解析

### 完整测试脚本与构建

命令：

```bash
npm test && npm run build
```

结果：

```text
npm test:
- node --experimental-strip-types 部分：98/98 通过
- sidepanel tsx runner 部分：8/8 通过

npm run build:
- tsc -b 通过
- vite build 通过
- post-build 拷贝 manifest / icons / pdf worker 成功
```

## 涉及文件

- `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/App.tsx`
- `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/BasicInformationSection.tsx`
- `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/basicInfo.ts`
- `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/index.css`
- `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/ProfileSections.test.ts`
- `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/package.json`

## concerns

- 当前 `package.json` 中的侧边栏测试使用 `npx --yes tsx --test ...`，原因是 Node 26 下 `node --experimental-strip-types --test` 不能直接加载 `.tsx` 依赖链。现在脚本已经可运行，但它仍依赖 `npx` 拉起 `tsx` 运行器；如果后续希望把测试环境完全收敛到仓库内，建议再单独决定是否把 `tsx` 固化为 devDependency，或统一迁移测试基建。
