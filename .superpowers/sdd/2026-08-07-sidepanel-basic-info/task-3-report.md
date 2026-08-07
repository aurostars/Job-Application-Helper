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

## Review follow-up：修复 `npm test` 对 `npx --yes tsx` 的依赖

### finding

review 指出 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/package.json` 的 `npm test` 仍依赖：

```bash
npx --yes tsx --test ...
```

这会在测试时触发临时下载，不满足“使用仓库内、受版本控制的依赖与脚本”的要求。

### Red

先新增 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/shared/packageScripts.test.ts`，断言：

- `npm test` 不包含 `npx`
- sidepanel 测试通过仓库脚本调用本地 `tsx`
- `package.json` 声明 `tsx` 为 devDependency
- `package-lock.json` 锁定 `node_modules/tsx`

执行：

```bash
node --experimental-strip-types --test src/shared/packageScripts.test.ts
```

首次按预期失败，失败点是 `package.json` 里的 `test` 脚本仍包含 `npx --yes tsx`。

### Green

修复如下：

1. 在 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/package.json` 新增：

```json
"test:sidepanel": "tsx --test src/sidepanel/basicInfo.test.ts src/sidepanel/ProfileSections.test.ts src/sidepanel/navigation.test.ts"
```

2. 将 `test` 脚本改为先跑 `node --experimental-strip-types --test ...`，再执行：

```bash
npm run test:sidepanel
```

3. 在 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/package.json` 的 `devDependencies` 中固化：

```json
"tsx": "^4.23.10"
```

4. 更新 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/package-lock.json`，把 `tsx` 与其锁定产物纳入版本控制。

### 验证

#### 配置回归测试

```bash
node --experimental-strip-types --test src/shared/packageScripts.test.ts
```

结果：

```text
tests 1
pass 1
fail 0
```

#### 完整测试

```bash
npm test
```

结果：

```text
node --experimental-strip-types --test: 99/99 通过
tsx sidepanel tests: 8/8 通过
总计: 107/107 通过
```

覆盖到的关键点：

- 原有 shared / parser / background / content / offscreen / llm 回归未回退
- 新增脚本配置测试覆盖 `npm test`、`test:sidepanel`、`package.json`、`package-lock.json`
- sidepanel 基本信息与导航测试继续通过

#### 构建验证

```bash
npm run build
```

结果：`tsc -b`、`vite build`、`post-build` 全部通过。

### 修复后 concerns

- 当前 `npm test` 已不再依赖 `npx --yes tsx`，review finding 已关闭。
- 仍存在 1 个已知但与本次修复无关的仓库级 concern：`npm install` 输出提示 1 个 high severity vulnerability；本次未扩展处理依赖安全审计，因为不属于该 review finding 的修复范围。
