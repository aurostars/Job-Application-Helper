# 信息窗口复制图标 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将信息窗口字段右侧的“复制”文字按钮替换为无依赖的双层方框 SVG 图标，并保留现有复制与成功反馈行为。

**Architecture:** 在现有 `FieldRow` 内渲染一个纯视觉、继承文字颜色的 SVG；按钮本身继续承担可访问名称和事件处理。测试从用户可观察行为验证默认图标、成功“✓”和定时恢复，不修改剪贴板状态机。

**Tech Stack:** React 19、TypeScript 6、Node Test Runner、react-test-renderer、CSS

## Global Constraints

- 默认状态显示 16px 双层方框复制图标，不增加依赖。
- SVG 使用 `currentColor` 且设置 `aria-hidden="true"`。
- 按钮保留动态 `aria-label="复制…内容"`，并增加 `title="复制"`。
- 成功后继续显示“✓”约 1000ms，随后恢复复制图标。
- 复制失败、并发请求、卸载清理和字段主体点击行为保持不变。
- 按钮宽度调整为 34px，保留 hover 与 focus-visible 状态。

---

### Task 1: 替换复制文字为 SVG 图标

**Files:**
- Modify: `src/sidepanel/FieldRow.test.tsx`
- Modify: `src/sidepanel/FieldRow.tsx`
- Modify: `src/sidepanel/index.css`

**Interfaces:**
- `FieldRow` props 和复制状态机保持不变。
- 默认复制按钮包含 `.field-copy-icon` SVG；成功状态不渲染 SVG，只显示文本 `✓`。

- [ ] **Step 1: 写默认图标与恢复行为的失败测试**

在 `src/sidepanel/FieldRow.test.tsx` 增加辅助断言并扩展现有测试：

```tsx
function copyIcon(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findByProps({ className: 'field-copy-icon' });
}

test('默认使用复制图标并保留可访问名称和提示', async () => {
  installClipboard(async () => {});
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <FieldRow fieldKey="phone" label="手机号" value="13800138000" onFieldClick={() => {}} />,
    );
  });
  const button = renderer.root.findByProps({ 'aria-label': '复制手机号内容' });
  assert.equal(button.props.title, '复制');
  const icon = copyIcon(renderer);
  assert.equal(icon.props['aria-hidden'], true);
  assert.equal(icon.props.width, 16);
  assert.equal(icon.props.height, 16);
  await act(async () => renderer.unmount());
});
```

将“复制成功约 1000ms 后恢复复制文本”测试改名为“复制成功约 1000ms 后恢复复制图标”，并分别断言成功时找不到 `.field-copy-icon`、计时结束后图标重新出现。

- [ ] **Step 2: 运行测试并确认因图标缺失而失败**

Run: `npx tsx --test src/sidepanel/FieldRow.test.tsx`

Expected: FAIL，找不到 `.field-copy-icon` 或 `title="复制"`。

- [ ] **Step 3: 实现无依赖 SVG 图标**

在 `FieldRow.tsx` 中增加小型视觉组件：

```tsx
function CopyIcon(): React.JSX.Element {
  return (
    <svg
      className="field-copy-icon"
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <rect x="5.25" y="5.25" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.75 3.75V3A1.25 1.25 0 0 0 9.5 1.75H3A1.25 1.25 0 0 0 1.75 3v6.5A1.25 1.25 0 0 0 3 10.75h.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
```

复制按钮增加 `title="复制"`，内容改为：

```tsx
{copied ? '✓' : <CopyIcon />}
```

- [ ] **Step 4: 调整按钮与图标样式**

```css
.field-copy-button {
  display: grid;
  place-items: center;
  width: 34px;
  /* 保留其余现有声明 */
}

.field-copy-icon {
  display: block;
  width: 16px;
  height: 16px;
}
```

- [ ] **Step 5: 运行聚焦测试**

Run: `npx tsx --test src/sidepanel/FieldRow.test.tsx src/sidepanel/ProfileSections.test.ts`

Expected: PASS，0 failures。

- [ ] **Step 6: 运行完整验证**

Run: `npm test && npm run build && git diff --check`

Expected: 全部 exit 0。

- [ ] **Step 7: 提交**

```bash
git add src/sidepanel/FieldRow.tsx src/sidepanel/FieldRow.test.tsx src/sidepanel/index.css
git commit -m "style: replace copy text with icon"
```
