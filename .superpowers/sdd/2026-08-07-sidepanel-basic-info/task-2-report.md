# Task 2 Report

## status

DONE

## commit

`521a8f7267fa1636e01e6f6e214c8cf59d247185`

## scope

- 新增 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/BasicInformationSection.tsx`
- 新增 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/ProfileSections.tsx`
- 新增 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/ProfileSections.test.tsx`
- 修改 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/App.tsx`
- 修改 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/index.css`
- 修改 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/tsconfig.app.json`

## implementation summary

1. 先按 brief 新建了 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/ProfileSections.test.tsx`，覆盖：
   - 基本信息模块位于教育经历之前
   - 空值字段显示“未填写”且按钮禁用
   - 自我评价使用 `field-value-single-line` 类名，并展示 `......` 摘要
2. 使用以下命令做 fail-first 验证：

   ```bash
   npx --yes tsx --test src/sidepanel/ProfileSections.test.tsx
   ```

   首次失败原因为缺少 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/ProfileSections.tsx`。
3. 新增 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/BasicInformationSection.tsx`：
   - 消费 Task 1 提供的 `buildBasicInfoItems(personal)`
   - 用固定标题“基本信息”渲染模块
   - 对空值字段显示“未填写”并禁用写入
   - 对 `selfEvaluation` 应用 `field-value-single-line`
   - 点击时按 brief 生成 `基本信息-${key}` 的写入键
4. 新增 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/ProfileSections.tsx`：
   - 在最前面插入 `BasicInformationSection`
   - 将 App 中原有的“教育经历 / 实习经历 / 项目经历 / 自定义信息”四段 JSX 迁入并保持原顺序
   - 保留原有 `workingKey` 禁用逻辑、empty 文案、标题生成和写入 key 规则
5. 修改 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/App.tsx`：
   - 移除内联的 `RecordSection` / `CustomInformationSection` 与字段配置
   - 改为直接渲染 `<ProfileSections profile={profile} workingKey={workingKey} onFieldClick={handleFieldClick} />`
6. 修改 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/index.css`，补充 `.field-value-single-line`，让单行摘要具备 `nowrap + overflow hidden + ellipsis` 表现。
7. 修改 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/tsconfig.app.json`，排除 `src/**/*.test.tsx`，避免构建时把 Node 测试文件纳入应用编译。
8. 提交 commit：`feat: add basic info section to sidepanel views`

## test summary

### fail-first verification

命令：

```bash
npx --yes tsx --test src/sidepanel/ProfileSections.test.tsx
```

结果：FAIL

关键信息：

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../src/sidepanel/ProfileSections.tsx'
```

### targeted passing verification

命令：

```bash
npx --yes tsx --test src/sidepanel/basicInfo.test.ts src/sidepanel/ProfileSections.test.tsx
```

结果：PASS

摘要：

```text
✔ ProfileSections 把基本信息排在教育经历之前
✔ 空值字段显示未填写并禁用按钮
✔ 自我评价使用单行摘要类名和六个点摘要
✔ 基本信息字段顺序与设计稿一致
✔ 自我评价摘要固定追加六个点
✔ buildBasicInfoItems 保留完整值并给自我评价生成摘要
```

### regression verification

命令：

```bash
npm run test
```

结果：PASS

摘要：

```text
ℹ tests 100
ℹ pass 100
ℹ fail 0
```

### build verification

命令：

```bash
npm run build
```

结果：PASS

摘要：

```text
✓ built in 468ms
✅ 构建完成！可以加载 dist/ 目录到浏览器。
```

## key code notes

`/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/BasicInformationSection.tsx`

```tsx
const items = buildBasicInfoItems(personal);

return (
  <details className="record-section" open>
    <summary>
      <span>基本信息</span>
      <span className="count">{items.length}</span>
    </summary>
    <div className="field-list">
      {items.map((item) => {
        const key = `基本信息-${String(item.key)}`;
        return (
          <button
            className="field-button"
            key={String(item.key)}
            disabled={item.empty || Boolean(workingKey)}
            onClick={() => onFieldClick(key, item.value)}
          >
            <span className="field-label">{item.label}</span>
            <span
              className={
                item.singleLinePreview
                  ? 'field-value field-value-single-line'
                  : item.empty
                    ? 'field-value empty-value'
                    : 'field-value'
              }
            >
              {item.empty ? '未填写' : item.displayValue}
            </span>
          </button>
        );
      })}
    </div>
  </details>
);
```

`/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/ProfileSections.tsx`

```tsx
return (
  <>
    <BasicInformationSection
      personal={profile.personal}
      workingKey={workingKey}
      onFieldClick={onFieldClick}
    />
    <RecordSection
      title="教育经历"
      records={profile.education}
      fields={educationFields}
      workingKey={workingKey}
      onFieldClick={onFieldClick}
      getTitle={(record, index) => record.school || `教育经历 ${index + 1}`}
    />
    <RecordSection
      title="实习经历"
      records={profile.experience}
      fields={experienceFields}
      workingKey={workingKey}
      onFieldClick={onFieldClick}
      getTitle={(record, index) => record.company || `实习经历 ${index + 1}`}
    />
  </>
);
```

`/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/index.css`

```css
.field-value-single-line {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
```

## concerns

- 本仓库现有 `npm test` 脚本仍基于 `node --experimental-strip-types --test`，该方式在当前 Node 26 环境下不能直接执行 `.tsx` 测试文件；因此本次对 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/ProfileSections.test.tsx` 的执行采用了 `npx --yes tsx --test ...`。代码本身与构建已验证通过，但如果后续希望把该测试纳入统一脚本，需要单独调整测试基建。

## review fixes

### fix scope

本轮按审查意见只修 Task 2 相关问题，并把超出 Task 2 范围的 Task 3 改动回退掉：

- 将 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/App.tsx` 恢复为 Task 2 前版本，不再在该文件接入 `ProfileSections`
- 将 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/index.css` 恢复为 Task 2 前版本，移除 `.field-value-single-line`
- 将 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/tsconfig.app.json` 恢复为 Task 2 前版本，不再额外排除 `.test.tsx`

确认结果：

```text
src/sidepanel/App.tsx: MATCH
src/sidepanel/index.css: MATCH
tsconfig.app.json: MATCH
```

### data-layer ellipsis fix

为避免依赖浏览器默认 `text-overflow: ellipsis`，本轮把自我评价摘要能力完全收敛到数据层：

1. 修改 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/basicInfo.ts`
   - 去掉 `singleLinePreview` 标记
   - `selfEvaluation` 的 `displayValue` 直接由 `toSingleLinePreview(raw, 18)` 生成
   - 保留 `value` 原始完整文本用于写回网页
2. 修改 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/BasicInformationSection.tsx`
   - 去掉 `field-value-single-line` 类名分支
   - 统一渲染 `displayValue`，只让数据层提供 `......` 摘要
3. 将测试文件从 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/ProfileSections.test.tsx` 调整为 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/ProfileSections.test.ts`
   - 避开当前 Node 26 + `--experimental-strip-types` 对 `.tsx` 测试入口的不兼容
   - 新断言验证 HTML 中存在六个点摘要，且不存在 `field-value-single-line`
4. 更新 `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/basicInfo.test.ts`
   - 保留“完整值 + 六个点摘要”断言
   - 移除已不存在的 `singleLinePreview` 断言

关键代码：

`/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/basicInfo.ts`

```ts
const displayValue = field.key === 'selfEvaluation'
  ? toSingleLinePreview(raw, 18)
  : raw;

return {
  key: field.key,
  label: field.label,
  value: raw,
  displayValue,
  empty: raw === '',
};
```

`/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/BasicInformationSection.tsx`

```tsx
<span className={item.empty ? 'field-value empty-value' : 'field-value'}>
  {item.empty ? '未填写' : item.displayValue}
</span>
```

`/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/ProfileSections.test.ts`

```ts
assert.match(html, /具备扎实的软件开发基础和完整的项目....../);
assert.doesNotMatch(html, /field-value-single-line/);
```

### verification after fixes

定向测试：

```bash
npx --yes tsx --test src/sidepanel/basicInfo.test.ts src/sidepanel/ProfileSections.test.ts
```

结果：

```text
ℹ tests 6
ℹ pass 6
ℹ fail 0
```

覆盖点：

- `ProfileSections` 仍保证“基本信息”位于“教育经历”之前
- 空值字段仍显示“未填写”且保持禁用
- 自我评价摘要只依赖数据层六个点，不再依赖 CSS 类
- `buildBasicInfoItems` 仍保留完整值供写回，同时生成 `......` 摘要

回归测试：

```bash
npm run test
```

结果：

```text
ℹ tests 100
ℹ pass 100
ℹ fail 0
```

构建验证：

```bash
npm run build
```

结果：

```text
✓ built in 254ms
✅ 构建完成！可以加载 dist/ 目录到浏览器。
```

### remaining concerns after fixes

- `/Users/bytedance/Downloads/网申/Job-Application-Helper/.worktrees/sidepanel-basic-info/src/sidepanel/ProfileSections.test.ts` 目前仍需通过 `npx --yes tsx --test` 执行，尚未并入仓库默认 `npm test` 脚本；若后续要纳入统一回归，需要单独调整 sidepanel 测试基建。

### fix commit

见本次修复提交。
