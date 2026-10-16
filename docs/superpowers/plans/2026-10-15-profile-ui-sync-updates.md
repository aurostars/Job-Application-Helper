# 个人资料界面与即时同步改进 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 调整设置页信息架构，增加主要课程和兴趣爱好字段，为信息窗口字段增加独立复制按钮，并在 Popup 顶部增加即时同步入口。

**Architecture:** 保留现有 `UserProfile`、WebDAV 同步和消息通信架构，只扩展可选字段和 UI 组合。新增字段值解析、字段行复制交互、Popup 同步编排分别放入小型可测试单元；设置页继续使用现有组件和状态保存链路。

**Tech Stack:** React 19、TypeScript 6、Chrome Extension APIs、Node Test Runner、`tsx`、`react-test-renderer`、Vite

## Global Constraints

- 新增 `majorCourses` 和 `hobbies` 必须是可选字段，已有资料无需迁移。
- 专业技能与荣誉奖励只改变页面归属，不改变 `skills`、`awards` 的存储结构。
- 点击字段主体保留“尝试写入网页并复制”的现有行为；点击右侧复制图标只复制，不发送 `WRITE_FOCUSED_FIELD`。
- 复制成功图标显示为“✓”约 1000ms；复制失败不得显示成功状态。
- Popup 冲突和未配置状态跳转 `src/options/index.html?tab=data-sync`；普通同步错误留在 Popup 展示。
- 不引入新依赖，不修改同步冲突判定算法。

---

## File Structure

### Create

- `src/content/profileFieldValue.ts`：解析新增字段对应的资料值，供 `FormFiller` 调用。
- `src/content/profileFieldValue.test.ts`：验证新增字段取值及空值边界。
- `src/options/SkillsAwardsSection.tsx`：组合专业技能与荣誉奖励编辑器。
- `src/sidepanel/FieldRow.tsx`：以两个并列按钮实现字段填充与独立复制，管理 1 秒复制反馈。
- `src/sidepanel/FieldRow.test.tsx`：验证复制、阻止冒泡、失败状态和计时恢复。
- `src/popup/syncNow.ts`：编排 `SYNC_NOW` 结果与设置页跳转。
- `src/popup/syncNow.test.ts`：覆盖成功、冲突、未配置和普通失败。

### Modify

- `src/shared/types.ts`：扩展资料字段和 `FieldType`。
- `src/shared/constants.ts`：增加新增字段匹配词。
- `src/shared/backup-sync.test.ts`：证明新字段经过备份序列化仍保留。
- `src/content/formFiller.ts`：把新增字段纳入教育字段序列并读取字段值。
- `src/content/pageScan.test.ts`：验证“主要课程”“兴趣爱好”的字段识别。
- `src/options/App.tsx`：调整标签、字段、自定义信息排序和页面归属。
- `src/options/App.test.tsx`：验证标签顺序、内容归属、新字段和自定义信息排序。
- `src/options/EducationSection.tsx`：增加主要课程输入。
- `src/options/ExperienceSection.tsx`：移除技能编辑职责。
- `src/sidepanel/basicInfo.ts`：增加兴趣爱好展示配置。
- `src/sidepanel/BasicInformationSection.tsx`：使用 `FieldRow`。
- `src/sidepanel/ProfileSections.tsx`：增加主要课程并统一使用 `FieldRow`。
- `src/sidepanel/ProfileSections.test.ts`：验证新增字段展示和字段行行为。
- `src/sidepanel/index.css`：增加字段行和复制按钮样式。
- `src/popup/App.tsx`：增加同步状态与按钮。
- `src/popup/index.css`：布局右上角同步按钮和错误提示。
- `package.json`：仅把新增测试加入现有相关测试脚本；不修改依赖。

---

### Task 1: 新字段模型、匹配与自动填充值

**Files:**
- Create: `src/content/profileFieldValue.ts`
- Create: `src/content/profileFieldValue.test.ts`
- Modify: `src/shared/types.ts:20-46,408-438`
- Modify: `src/shared/constants.ts:42-57`
- Modify: `src/content/formFiller.ts:7-16,408-503`
- Modify: `src/content/pageScan.test.ts`
- Modify: `src/shared/backup-sync.test.ts`

**Interfaces:**
- Produces: `getExtendedProfileFieldValue(fieldType: FieldType, profile: UserProfile, educationIndex?: number): string | null | undefined`
- `undefined` 表示该函数不负责当前字段；`null` 表示负责但资料为空；字符串表示可填充值。
- Produces: `FieldType.MAJOR_COURSES`、`FieldType.HOBBIES`。

- [ ] **Step 1: 写新增字段值的失败测试**

```ts
// src/content/profileFieldValue.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { getExtendedProfileFieldValue } from './profileFieldValue.ts';
import { FieldType, type UserProfile } from '../shared/types.ts';

const profile = {
  personal: { name: '董星', gender: '', birthDate: '', phone: '', email: '', hobbies: '摄影、徒步' },
  education: [{ id: 'edu-1', school: '某大学', major: '计算机', degree: '本科', startDate: '', endDate: '', majorCourses: '数据结构、操作系统' }],
  experience: [], projects: [], awards: [], customInformation: [], skills: [], certifications: [],
} satisfies UserProfile;

test('新增资料字段按类型返回完整内容', () => {
  assert.equal(getExtendedProfileFieldValue(FieldType.HOBBIES, profile), '摄影、徒步');
  assert.equal(getExtendedProfileFieldValue(FieldType.MAJOR_COURSES, profile, 0), '数据结构、操作系统');
});

test('新增资料字段为空时返回 null，其他字段返回 undefined', () => {
  const empty = { ...profile, personal: { ...profile.personal, hobbies: '' }, education: [] };
  assert.equal(getExtendedProfileFieldValue(FieldType.HOBBIES, empty), null);
  assert.equal(getExtendedProfileFieldValue(FieldType.MAJOR_COURSES, empty, 0), null);
  assert.equal(getExtendedProfileFieldValue(FieldType.NAME, profile), undefined);
});
```

- [ ] **Step 2: 运行测试并确认因接口缺失而失败**

Run: `npx tsx --test src/content/profileFieldValue.test.ts`

Expected: FAIL，提示找不到 `profileFieldValue.ts` 或新增枚举成员。

- [ ] **Step 3: 最小实现类型与字段值解析**

```ts
// src/shared/types.ts
export interface PersonalInfo {
  // existing fields
  hobbies?: string;
}

export interface EducationInfo {
  // existing fields
  majorCourses?: string;
}

export enum FieldType {
  // existing members
  MAJOR_COURSES = 'majorCourses',
  HOBBIES = 'hobbies',
}
```

```ts
// src/content/profileFieldValue.ts
import { FieldType, type UserProfile } from '../shared/types.ts';

export function getExtendedProfileFieldValue(
  fieldType: FieldType,
  profile: UserProfile,
  educationIndex = 0,
): string | null | undefined {
  if (fieldType === FieldType.HOBBIES) return profile.personal.hobbies || null;
  if (fieldType === FieldType.MAJOR_COURSES) {
    return profile.education[educationIndex]?.majorCourses || null;
  }
  return undefined;
}
```

- [ ] **Step 4: 验证字段值测试转绿**

Run: `npx tsx --test src/content/profileFieldValue.test.ts`

Expected: PASS，2 tests。

- [ ] **Step 5: 写字段识别与备份保留的失败测试**

在 `src/content/pageScan.test.ts` 使用现有页面字段夹具增加两个真实标签断言：

```ts
assert.equal(matchField('主要课程').fieldType, FieldType.MAJOR_COURSES);
assert.equal(matchField('兴趣爱好').fieldType, FieldType.HOBBIES);
```

在 `src/shared/backup-sync.test.ts` 的真实备份数据中设置：

```ts
personal: { ...personal, hobbies: '摄影、徒步' },
education: [{ ...education, majorCourses: '数据结构、操作系统' }],
```

并对序列化后再解析的文档断言两个字面值仍存在。

- [ ] **Step 6: 运行测试并确认新增匹配失败**

Run: `npx tsx --test src/content/pageScan.test.ts src/shared/backup-sync.test.ts`

Expected: FAIL；“主要课程”和“兴趣爱好”尚未映射到新 `FieldType`。

- [ ] **Step 7: 增加匹配词并接入 FormFiller**

```ts
// src/shared/constants.ts
[FieldType.MAJOR_COURSES]: ['主要课程', '主修课程', '课程', 'majorcourses', 'major_courses', 'courses'],
[FieldType.HOBBIES]: ['兴趣爱好', '兴趣', '爱好', 'hobbies', 'interests'],
```

将 `FieldType.MAJOR_COURSES` 加入 `EDUCATION_FIELD_TYPES`。在 `getValueForField` 的 `switch` 之前调用：

```ts
const extendedValue = getExtendedProfileFieldValue(fieldType, profile, educationIndex);
if (extendedValue !== undefined) return extendedValue;
```

- [ ] **Step 8: 运行任务测试**

Run: `npx tsx --test src/content/profileFieldValue.test.ts src/content/pageScan.test.ts src/shared/backup-sync.test.ts`

Expected: PASS，无失败。

- [ ] **Step 9: 提交数据层改动**

```bash
git add src/shared/types.ts src/shared/constants.ts src/shared/backup-sync.test.ts src/content/formFiller.ts src/content/pageScan.test.ts src/content/profileFieldValue.ts src/content/profileFieldValue.test.ts
git commit -m "feat: add hobbies and major courses fields"
```

---

### Task 2: 设置页标签、字段和自定义信息排序

**Files:**
- Create: `src/options/SkillsAwardsSection.tsx`
- Modify: `src/options/App.tsx:23-32,302-342,465-770`
- Modify: `src/options/App.test.tsx`
- Modify: `src/options/EducationSection.tsx`
- Modify: `src/options/ExperienceSection.tsx`

**Interfaces:**
- Produces: `SkillsAwardsSection({ skills, awards, onChangeSkills, onChangeAwards })`。
- `ExperienceSection` 移除 `skills`、`onChangeSkills` props，只负责 `experience` 与 `projects`。
- `moveCustomInformation(index: number, delta: number): void` 只在合法边界交换元素。

- [ ] **Step 1: 写设置页行为失败测试**

扩展 `setup` 允许传入初始 profile，并加入以下行为断言：

```ts
test('标签顺序为实习项目、技能荣誉、自定义信息', async () => {
  const env = await setup();
  try {
    const labels = env.renderer.root.findAllByProps({ className: 'options-tab' })
      .map(item => item.children.join(''));
    assert.ok(labels.indexOf('实习项目') < labels.indexOf('技能荣誉'));
    assert.ok(labels.indexOf('技能荣誉') < labels.indexOf('自定义信息'));
  } finally { await env.cleanup(); }
});

test('技能和荣誉只在技能荣誉页展示', async () => {
  const env = await setup();
  try {
    await act(async () => button(env.renderer, '实习项目')?.props.onClick());
    assert.doesNotMatch(text(env.renderer), /专业技能|奖项 \/ 荣誉/);
    await act(async () => button(env.renderer, '技能荣誉')?.props.onClick());
    assert.match(text(env.renderer), /专业技能/);
    assert.match(text(env.renderer), /奖项 \/ 荣誉/);
  } finally { await env.cleanup(); }
});
```

对包含两条 `customInformation` 的资料，进入自定义信息页，断言“添加”按钮在两张卡片之后，并点击第一项“下移”后，第一个名称输入的值变为第二项；同时断言首项上移、末项下移禁用。

再断言个人页存在 `placeholder="请输入兴趣爱好"`，教育页存在 `placeholder="如 数据结构、操作系统、计算机网络"`。

- [ ] **Step 2: 运行测试并确认旧标签、旧归属和缺失字段导致失败**

Run: `npx tsx --test src/options/App.test.tsx`

Expected: FAIL，至少包含找不到“技能荣誉”“兴趣爱好”或排序按钮。

- [ ] **Step 3: 拆分技能荣誉组合组件**

```tsx
// src/options/SkillsAwardsSection.tsx
import type { AwardInfo } from '../shared/types.ts';
import { AwardsSection } from './AwardsSection.tsx';
import { SkillsEditor } from './SkillsEditor.tsx';

export function SkillsAwardsSection(props: {
  skills: string[];
  awards: AwardInfo[];
  onChangeSkills: (skills: string[]) => void;
  onChangeAwards: (awards: AwardInfo[]) => void;
}) {
  return (
    <>
      <SkillsEditor skills={props.skills} onChange={props.onChangeSkills} />
      <AwardsSection awards={props.awards} onChange={props.onChangeAwards} />
    </>
  );
}
```

从 `ExperienceSection` 删除 `SkillsEditor` import、技能 props 和末尾渲染。

- [ ] **Step 4: 调整 App 标签和页面归属**

将 `skills-awards` 插入 `OPTION_TABS` 的 `experience` 后。标签文案使用“实习项目”“技能荣誉”“自定义信息”。`experience` 分支只渲染 `ExperienceSection`；新增分支渲染 `SkillsAwardsSection`。

在个人基本信息的“自我评价”之前增加：

```tsx
<div style={styles.formGroup}>
  <label style={styles.label}>兴趣爱好</label>
  <textarea
    value={profile.personal.hobbies || ''}
    onChange={event => handlePersonalChange('hobbies', event.target.value)}
    style={{ ...styles.input, ...styles.autoGrowTextarea }}
    placeholder="请输入兴趣爱好"
    rows={1}
  />
</div>
```

在 `EducationSection` 的 GPA/排名行之后增加绑定 `majorCourses` 的多行文本输入。

- [ ] **Step 5: 实现自定义信息移动并下移添加按钮**

```ts
const moveCustomInformation = (index: number, delta: number) => {
  const current = profile.customInformation || [];
  const target = index + delta;
  if (target < 0 || target >= current.length) return;
  const next = [...current];
  [next[index], next[target]] = [next[target], next[index]];
  setProfile({ ...profile, customInformation: next });
};
```

标题区使用与教育经历一致的“上移”“下移”“删除”动作；把“添加”按钮放到空态或列表之后，确保永远位于最后一张卡片下方。

- [ ] **Step 6: 运行设置页测试**

Run: `npx tsx --test src/options/App.test.tsx src/options/SkillsEditor.test.tsx src/options/AwardsSection.test.tsx`

Expected: PASS。

- [ ] **Step 7: 提交设置页改动**

```bash
git add src/options/App.tsx src/options/App.test.tsx src/options/EducationSection.tsx src/options/ExperienceSection.tsx src/options/SkillsAwardsSection.tsx
git commit -m "feat: reorganize profile settings sections"
```

---

### Task 3: 信息窗口统一字段行与独立复制按钮

**Files:**
- Create: `src/sidepanel/FieldRow.tsx`
- Create: `src/sidepanel/FieldRow.test.tsx`
- Modify: `src/sidepanel/BasicInformationSection.tsx`
- Modify: `src/sidepanel/ProfileSections.tsx`
- Modify: `src/sidepanel/basicInfo.ts`
- Modify: `src/sidepanel/ProfileSections.test.ts`
- Modify: `src/sidepanel/index.css`

**Interfaces:**
- Produces: `FieldRow({ fieldKey, label?, value, displayValue?, empty?, working?, disabled?, className?, onFieldClick })`。
- 字段主体按钮调用 `onFieldClick(fieldKey, value)`；复制按钮只调用 `navigator.clipboard.writeText(value)`。
- 复制按钮 `aria-label` 为 `复制${label || '字段'}内容`，成功时文本/图标为 `✓`，1000ms 后恢复。

- [ ] **Step 1: 写复制交互失败测试**

```tsx
// src/sidepanel/FieldRow.test.tsx
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { FieldRow } from './FieldRow.tsx';

test('复制按钮只复制字段内容且阻止冒泡', async () => {
  let filled = 0;
  let stopped = 0;
  let copied = '';
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (value: string) => { copied = value; } },
  });
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => { renderer = TestRenderer.create(
    <FieldRow fieldKey="basic-hobbies" label="兴趣爱好" value="摄影、徒步" onFieldClick={() => { filled += 1; }} />
  ); });
  const copy = renderer.root.findByProps({ 'aria-label': '复制兴趣爱好内容' });
  await act(async () => copy.props.onClick({ stopPropagation: () => { stopped += 1; } }));
  assert.equal(copied, '摄影、徒步');
  assert.equal(stopped, 1);
  assert.equal(filled, 0);
  assert.equal(copy.children.join(''), '✓');
});
```

另写两个测试：剪贴板 reject 时不显示 `✓`；使用受控 fake timer 或等待 1050ms 后恢复复制图标。

- [ ] **Step 2: 运行测试并确认组件缺失**

Run: `npx tsx --test src/sidepanel/FieldRow.test.tsx`

Expected: FAIL，找不到 `FieldRow.tsx`。

- [ ] **Step 3: 实现兄弟按钮结构，避免嵌套 button**

```tsx
// src/sidepanel/FieldRow.tsx
export function FieldRow({ fieldKey, label, value, displayValue = value, empty = false, working = false, disabled = false, className = '', onFieldClick }: FieldRowProps) {
  const [copied, setCopied] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const copy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={`field-row ${className}`.trim()}>
      <button type="button" className="field-button" disabled={empty || disabled} onClick={() => onFieldClick(fieldKey, value)}>
        {label && <span className="field-label">{label}</span>}
        <span className={empty ? 'field-value empty-value' : 'field-value'}>{empty ? '未填写' : displayValue}</span>
        {working && <span className="field-working">写入中</span>}
      </button>
      {!empty && (
        <button type="button" className="field-copy-button" aria-label={`复制${label || '字段'}内容`} onClick={copy}>
          {copied ? '✓' : '复制'}
        </button>
      )}
    </div>
  );
}
```

实现时复制图标可使用内联 SVG，但可访问名称和 `✓` 文本必须保持上述契约。

- [ ] **Step 4: 验证 FieldRow 测试转绿**

Run: `npx tsx --test src/sidepanel/FieldRow.test.tsx`

Expected: PASS。

- [ ] **Step 5: 写新增字段展示失败测试**

在 `ProfileSections.test.ts` 的 profile 中加入 `hobbies`、教育记录的 `majorCourses`，断言“兴趣爱好”“摄影、徒步”“主要课程”“数据结构、操作系统”均出现，并断言每个非空字段具有对应复制按钮。

- [ ] **Step 6: 接入全部信息窗口字段**

- `basicInfo.ts` 将 `{ key: 'hobbies', label: '兴趣爱好' }` 放在自我评价之前。
- `ProfileSections.tsx` 将 `{ key: 'majorCourses', label: '主要课程' }` 加入 `educationFields`。
- `BasicInformationSection`、`RecordSection`、`SkillsSection`、`CustomInformationSection` 全部改用 `FieldRow`。
- 保留现有 `workingKey` 禁用填充主体的逻辑，但复制按钮在其他字段写入期间仍可独立使用。
- `App.tsx` 的 `handleFieldClick` 不修改，继续执行“写入 + 复制 + toast”。

CSS 使用 `.field-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; }`，复制按钮宽度固定、视觉弱化，并为 hover/focus-visible 提供清晰状态。

- [ ] **Step 7: 运行信息窗口测试**

Run: `npx tsx --test src/sidepanel/FieldRow.test.tsx src/sidepanel/basicInfo.test.ts src/sidepanel/ProfileSections.test.ts src/sidepanel/headerLayout.test.ts src/sidepanel/navigation.test.ts`

Expected: PASS。

- [ ] **Step 8: 提交信息窗口改动**

```bash
git add src/sidepanel/FieldRow.tsx src/sidepanel/FieldRow.test.tsx src/sidepanel/BasicInformationSection.tsx src/sidepanel/ProfileSections.tsx src/sidepanel/ProfileSections.test.ts src/sidepanel/basicInfo.ts src/sidepanel/index.css
git commit -m "feat: add copy actions to profile fields"
```

---

### Task 4: Popup 即时同步编排与顶部按钮

**Files:**
- Create: `src/popup/syncNow.ts`
- Create: `src/popup/syncNow.test.ts`
- Modify: `src/popup/App.tsx`
- Modify: `src/popup/index.css`

**Interfaces:**
- Produces: `runPopupSync(dependencies): Promise<'synced' | 'redirected' | 'error'>`。
- Consumes: `MessageService.sendMessage<SyncExecutionResult>({ type: 'SYNC_NOW' })`。
- 冲突或 `disabled` 调用 `openSyncSettings()`；`error` 或消息失败返回错误，不跳转。

- [ ] **Step 1: 写同步分支失败测试**

```ts
// src/popup/syncNow.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { runPopupSync } from './syncNow.ts';

for (const status of ['conflict', 'disabled'] as const) {
  test(`${status} 打开数据同步设置页`, async () => {
    let opened = 0;
    const result = await runPopupSync({
      sync: async () => ({ success: true, data: { status } }),
      openSyncSettings: async () => { opened += 1; },
    });
    assert.equal(result, 'redirected');
    assert.equal(opened, 1);
  });
}

test('普通同步错误留在 Popup', async () => {
  let opened = 0;
  const result = await runPopupSync({
    sync: async () => ({ success: true, data: { status: 'error' } }),
    openSyncSettings: async () => { opened += 1; },
  });
  assert.equal(result, 'error');
  assert.equal(opened, 0);
});

test('同步成功不跳转', async () => {
  const result = await runPopupSync({
    sync: async () => ({ success: true, data: { status: 'synced', action: 'no-change' } }),
    openSyncSettings: async () => { throw new Error('不应跳转'); },
  });
  assert.equal(result, 'synced');
});
```

- [ ] **Step 2: 运行测试并确认模块缺失**

Run: `npx tsx --test src/popup/syncNow.test.ts`

Expected: FAIL，找不到 `syncNow.ts`。

- [ ] **Step 3: 最小实现同步编排**

```ts
// src/popup/syncNow.ts
import type { MessageResponse, SyncExecutionResult } from '../shared/types.ts';

export async function runPopupSync(deps: {
  sync: () => Promise<MessageResponse<SyncExecutionResult>>;
  openSyncSettings: () => Promise<void>;
}): Promise<'synced' | 'redirected' | 'error'> {
  const response = await deps.sync();
  if (!response.success || !response.data || response.data.status === 'error') return 'error';
  if (response.data.status === 'conflict' || response.data.status === 'disabled') {
    await deps.openSyncSettings();
    return 'redirected';
  }
  return response.data.status === 'synced' ? 'synced' : 'error';
}
```

- [ ] **Step 4: 验证同步编排测试转绿**

Run: `npx tsx --test src/popup/syncNow.test.ts`

Expected: PASS，4 tests。

- [ ] **Step 5: 写 Popup UI 失败测试**

在 `src/popup/applicationRecordsEntry.test.tsx` 的静态渲染测试中补充顶部存在 `aria-label="立即同步"` 的按钮；新增交互测试时只 mock Chrome 外部 API，真实渲染 `App`，让 `SYNC_NOW` 返回 synced，并断言按钮从“同步中…”恢复到“同步成功”，且重复点击期间按钮 disabled。

- [ ] **Step 6: 接入 Popup 状态与设置页跳转**

在 `App.tsx` 增加：

```ts
const [syncing, setSyncing] = useState(false);
const [syncNotice, setSyncNotice] = useState<'success' | 'error' | null>(null);

const openSyncSettings = () => chrome.tabs.create({
  url: getRuntimeUrl('src/options/index.html?tab=data-sync'),
}).then(() => undefined);

const handleSyncNow = async () => {
  if (syncing) return;
  setSyncing(true);
  setSyncNotice(null);
  try {
    const result = await runPopupSync({
      sync: () => MessageService.sendMessage<SyncExecutionResult>({ type: 'SYNC_NOW' }),
      openSyncSettings,
    });
    if (result === 'synced') setSyncNotice('success');
    if (result === 'error') setSyncNotice('error');
  } catch {
    setSyncNotice('error');
  } finally {
    setSyncing(false);
  }
};
```

把按钮放在 `.popup-brand-row` 的右侧，使用 `margin-left: auto` 或单独的 `.popup-header-top` 网格定位。按钮文案依次为“同步”“同步中…”“✓”；普通失败在按钮附近显示“同步失败，请重试”。冲突和未配置跳转后不显示错误。

将 `syncing` 加入 `interactionDisabled`，避免同步和资料切换/填充并发。

- [ ] **Step 7: 运行 Popup 测试**

Run: `npx tsx --test src/popup/syncNow.test.ts src/popup/applicationRecordsEntry.test.tsx src/popup/ResumeProfileSelector.test.tsx`

Expected: PASS。

- [ ] **Step 8: 提交 Popup 改动**

```bash
git add src/popup/syncNow.ts src/popup/syncNow.test.ts src/popup/App.tsx src/popup/index.css src/popup/applicationRecordsEntry.test.tsx
git commit -m "feat: add manual sync action to popup"
```

---

### Task 5: 测试脚本整合与全量验证

**Files:**
- Modify: `package.json`

**Interfaces:**
- `test:sidepanel` 必须包含 `src/sidepanel/FieldRow.test.tsx`。
- 主 `test` 或对应子脚本必须包含 `src/content/profileFieldValue.test.ts` 和 `src/popup/syncNow.test.ts`。

- [ ] **Step 1: 更新测试脚本**

把新增测试加入现有脚本，不改变依赖：

```json
{
  "test:sidepanel": "tsx --test src/sidepanel/FieldRow.test.tsx src/sidepanel/basicInfo.test.ts src/sidepanel/ProfileSections.test.ts src/sidepanel/headerLayout.test.ts src/sidepanel/navigation.test.ts"
}
```

在主 `test` 命令中加入 `src/content/profileFieldValue.test.ts` 和 `src/popup/syncNow.test.ts`。

- [ ] **Step 2: 运行相关测试**

Run: `npm run test:sidepanel && npm run test:resume-profiles && npx tsx --test src/content/profileFieldValue.test.ts src/content/pageScan.test.ts src/shared/backup-sync.test.ts src/popup/syncNow.test.ts src/popup/applicationRecordsEntry.test.tsx`

Expected: 全部 PASS，0 failures。

- [ ] **Step 3: 运行完整测试**

Run: `npm test`

Expected: exit 0，0 failures。

- [ ] **Step 4: 运行 TypeScript 与扩展构建**

Run: `npm run build`

Expected: `tsc -b`、Vite build 和 post-build 均 exit 0。

- [ ] **Step 5: 检查差异与工作区**

Run: `git diff --check && git status --short`

Expected: 无 whitespace error；仅出现本计划内文件。

- [ ] **Step 6: 提交测试脚本整合**

```bash
git add package.json
git commit -m "test: include profile UI and sync coverage"
```

- [ ] **Step 7: 最终人工验收**

在 Chrome 加载构建产物并依次检查：

1. 设置页标签顺序与“技能荣誉”内容正确。
2. 自定义信息添加按钮位于最后一张卡片下方，上下移动边界正确。
3. 主要课程和兴趣爱好保存后在信息窗口出现。
4. 点击字段主体仍执行原行为；点击复制图标只复制，图标约 1 秒后恢复。
5. Popup 右上角同步成功有反馈；未配置或冲突会打开数据同步设置页；断网只在 Popup 报错。
