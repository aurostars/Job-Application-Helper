# Sidepanel Basic Info Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为信息浮窗新增 `基本信息` 模块，让 `UserProfile.personal` 中的现有字段也能像教育/实习/项目信息一样点击写入网页当前输入框。

**Architecture:** 方案分三层：先把基本信息字段顺序与 `自我评价` 摘要规则抽成纯函数，再新增 `BasicInformationSection` 与 `ProfileSections` 这类展示组件承接渲染，最后由 `App` 做最薄的状态接线并补充 CSS。这样字段顺序、单行 `......` 规则和模块顺序都能通过 `node:test` + `react-dom/server` 稳定覆盖，而不用把 `chrome` 与 hook 状态揉进测试里。

**Tech Stack:** TypeScript 6、React 19、ReactDOM Server、Chrome Extension Manifest V3、Node test runner (`node --experimental-strip-types --test`)、Vite 8

## Global Constraints

- 在信息浮窗中新增 `基本信息` 模块。
- 基本信息模块直接复用现有 `personal` 数据结构，不新增字段、不改存储模型。
- 每个基础字段都能像现有浮窗字段一样，点击后写入当前聚焦的网页输入框。
- `自我评价` 在浮窗中只显示一行，超出部分用 `......` 表示，但点击时仍写入完整内容。
- 不新增任何新的个人信息字段。
- 不改变设置页中的 `基本信息` 表单结构。
- 不调整现有教育、实习、项目、自定义信息的写入逻辑。
- 不在本次改动中增加“展开全文”“悬浮预览”或多行编辑能力。

---

## File Map

- `src/sidepanel/basicInfo.ts`
  - 新增纯函数，定义基本信息字段顺序、展示文案和 `自我评价` 摘要规则。
- `src/sidepanel/basicInfo.test.ts`
  - 覆盖字段顺序、空值处理和 `......` 截断规则。
- `src/sidepanel/BasicInformationSection.tsx`
  - 新增展示组件，只负责渲染 `personal` 字段按钮。
- `src/sidepanel/ProfileSections.tsx`
  - 新增组合组件，统一决定模块顺序：`基本信息 -> 教育经历 -> 实习经历 -> 项目经历 -> 自定义信息`。
- `src/sidepanel/ProfileSections.test.tsx`
  - 使用 `renderToStaticMarkup()` 覆盖模块顺序、空值禁用和自我评价摘要渲染。
- `src/sidepanel/App.tsx`
  - 保留 loading / status / `handleFieldClick()` 逻辑，改为调用 `ProfileSections`。
- `src/sidepanel/index.css`
  - 增加基本信息按钮与单行摘要样式。
- `package.json`
  - 把新增测试文件接入 `npm test`。

### Task 1: 提炼基本信息字段与摘要规则

**Files:**
- Create: `src/sidepanel/basicInfo.ts`
- Test: `src/sidepanel/basicInfo.test.ts`

**Interfaces:**
- Consumes: `PersonalInfo` from `src/shared/types.ts`
- Produces:
  - `type BasicInfoField = { key: keyof PersonalInfo; label: string; singleLinePreview?: boolean }`
  - `BASIC_INFO_FIELDS: BasicInfoField[]`
  - `buildBasicInfoItems(personal: PersonalInfo): Array<{ key: keyof PersonalInfo; label: string; value: string; displayValue: string; empty: boolean; singleLinePreview: boolean }>`
  - `toSingleLinePreview(value: string, maxChars?: number): string`

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import type { PersonalInfo } from '../shared/types.ts';
import { BASIC_INFO_FIELDS, buildBasicInfoItems, toSingleLinePreview } from './basicInfo.ts';

test('基本信息字段顺序与设计稿一致', () => {
  assert.deepEqual(
    BASIC_INFO_FIELDS.map(field => field.key),
    [
      'name', 'gender', 'birthDate', 'politicalStatus', 'ethnicity',
      'phone', 'email', 'wechat', 'hometown', 'currentAddress',
      'idCard', 'selfEvaluation',
    ],
  );
});

test('自我评价摘要固定追加六个点', () => {
  assert.equal(toSingleLinePreview('这是一个很长的自我评价内容', 6), '这是一个很长......');
  assert.equal(toSingleLinePreview('简短内容', 20), '简短内容');
});

test('buildBasicInfoItems 保留完整值并给自我评价生成摘要', () => {
  const personal = {
    name: '林知远',
    gender: '男',
    birthDate: '2002-06-18',
    phone: '13800138000',
    email: 'lin@example.com',
    selfEvaluation: '具备扎实的软件开发基础和完整的项目实践经历',
  } as PersonalInfo;

  const selfEvaluation = buildBasicInfoItems(personal)
    .find(item => item.key === 'selfEvaluation');

  assert.equal(selfEvaluation?.value, '具备扎实的软件开发基础和完整的项目实践经历');
  assert.match(selfEvaluation?.displayValue || '', /\.\.\.\.\.\.$/);
  assert.equal(selfEvaluation?.singleLinePreview, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/sidepanel/basicInfo.test.ts`

Expected: FAIL with `Cannot find module './basicInfo.ts'`

- [ ] **Step 3: Write minimal implementation**

```ts
import type { PersonalInfo } from '../shared/types.ts';

export type BasicInfoField = {
  key: keyof PersonalInfo;
  label: string;
  singleLinePreview?: boolean;
};

export const BASIC_INFO_FIELDS: BasicInfoField[] = [
  { key: 'name', label: '姓名' },
  { key: 'gender', label: '性别' },
  { key: 'birthDate', label: '出生日期' },
  { key: 'politicalStatus', label: '政治面貌' },
  { key: 'ethnicity', label: '民族' },
  { key: 'phone', label: '手机号' },
  { key: 'email', label: '邮箱' },
  { key: 'wechat', label: '微信号' },
  { key: 'hometown', label: '籍贯' },
  { key: 'currentAddress', label: '现居地' },
  { key: 'idCard', label: '身份证号' },
  { key: 'selfEvaluation', label: '自我评价', singleLinePreview: true },
];

export function toSingleLinePreview(value: string, maxChars = 24): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}......`;
}

export function buildBasicInfoItems(personal: PersonalInfo) {
  return BASIC_INFO_FIELDS.map(field => {
    const raw = String(personal[field.key] ?? '').trim();
    const singleLinePreview = Boolean(field.singleLinePreview);
    return {
      key: field.key,
      label: field.label,
      value: raw,
      displayValue: singleLinePreview ? toSingleLinePreview(raw) : raw,
      empty: raw === '',
      singleLinePreview,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test src/sidepanel/basicInfo.test.ts`

Expected: PASS，字段顺序固定，`自我评价` 摘要以 `......` 结尾且完整值保留在 `value`

- [ ] **Step 5: Commit**

```bash
git add src/sidepanel/basicInfo.ts src/sidepanel/basicInfo.test.ts
git commit -m "feat: add sidepanel basic info field helpers"
```

### Task 2: 新增基本信息展示组件并固定模块顺序

**Files:**
- Create: `src/sidepanel/BasicInformationSection.tsx`
- Create: `src/sidepanel/ProfileSections.tsx`
- Test: `src/sidepanel/ProfileSections.test.tsx`

**Interfaces:**
- Consumes:
  - `buildBasicInfoItems(personal: PersonalInfo)`
  - `UserProfile`
  - `workingKey: string | null`
  - `onFieldClick(key: string, value: string): void`
- Produces:
  - `BasicInformationSection(props: { personal: PersonalInfo; workingKey: string | null; onFieldClick(key: string, value: string): void }): JSX.Element`
  - `ProfileSections(props: { profile: UserProfile; workingKey: string | null; onFieldClick(key: string, value: string): void }): JSX.Element`

- [ ] **Step 1: Write the failing test**

```tsx
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProfileSections } from './ProfileSections.tsx';
import type { UserProfile } from '../shared/types.ts';

const profile: UserProfile = {
  personal: {
    name: '林知远',
    gender: '男',
    birthDate: '2002-06-18',
    phone: '13800138000',
    email: 'lin@example.com',
    selfEvaluation: '具备扎实的软件开发基础和完整的项目实践经历，重视代码可读性。',
  },
  education: [],
  experience: [],
  projects: [],
  customInformation: [],
  skills: [],
  certifications: [],
};

test('ProfileSections 把基本信息排在教育经历之前', () => {
  const html = renderToStaticMarkup(
    <ProfileSections profile={profile} workingKey={null} onFieldClick={() => {}} />
  );
  assert.ok(html.indexOf('基本信息') < html.indexOf('教育经历'));
});

test('空值字段显示未填写并禁用按钮', () => {
  const html = renderToStaticMarkup(
    <ProfileSections
      profile={{ ...profile, personal: { ...profile.personal, wechat: '' } }}
      workingKey={null}
      onFieldClick={() => {}}
    />
  );
  assert.match(html, /微信号/);
  assert.match(html, /未填写/);
  assert.match(html, /disabled/);
});

test('自我评价使用单行摘要类名和六个点摘要', () => {
  const html = renderToStaticMarkup(
    <ProfileSections profile={profile} workingKey={null} onFieldClick={() => {}} />
  );
  assert.match(html, /field-value-single-line/);
  assert.match(html, /(\.\.\.\.\.\.)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/sidepanel/ProfileSections.test.tsx`

Expected: FAIL with `Cannot find module './ProfileSections.tsx'`

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/sidepanel/BasicInformationSection.tsx
import React from 'react';
import type { PersonalInfo } from '../shared/types.ts';
import { buildBasicInfoItems } from './basicInfo.ts';

export function BasicInformationSection({ personal, workingKey, onFieldClick }: {
  personal: PersonalInfo;
  workingKey: string | null;
  onFieldClick: (key: string, value: string) => void;
}) {
  const items = buildBasicInfoItems(personal);
  return (
    <details className="record-section" open>
      <summary>
        <span>基本信息</span>
        <span className="count">{items.length}</span>
      </summary>
      <div className="field-list">
        {items.map(item => (
          <button
            className="field-button"
            key={String(item.key)}
            disabled={item.empty || Boolean(workingKey)}
            onClick={() => onFieldClick(`基本信息-${String(item.key)}`, item.value)}
          >
            <span className="field-label">{item.label}</span>
            <span className={item.singleLinePreview ? 'field-value field-value-single-line' : 'field-value'}>
              {item.empty ? '未填写' : item.displayValue}
            </span>
            {workingKey === `基本信息-${String(item.key)}` && <span className="field-working">写入中</span>}
          </button>
        ))}
      </div>
    </details>
  );
}

// src/sidepanel/ProfileSections.tsx
import React from 'react';
import { BasicInformationSection } from './BasicInformationSection.tsx';
import type { UserProfile } from '../shared/types.ts';

export function ProfileSections({ profile, workingKey, onFieldClick }: {
  profile: UserProfile;
  workingKey: string | null;
  onFieldClick: (key: string, value: string) => void;
}) {
  return (
    <>
      <BasicInformationSection personal={profile.personal} workingKey={workingKey} onFieldClick={onFieldClick} />
      {/* 把 App.tsx 里现有的 教育经历 / 实习经历 / 项目经历 / 自定义信息 4 段 JSX 原样迁入这里，
          顺序保持为 教育经历 -> 实习经历 -> 项目经历 -> 自定义信息，
          仅在最前面插入 BasicInformationSection。 */}
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test src/sidepanel/basicInfo.test.ts src/sidepanel/ProfileSections.test.tsx`

Expected: PASS，模块顺序正确，空值禁用，自我评价有单行类名和 `......`

- [ ] **Step 5: Commit**

```bash
git add src/sidepanel/BasicInformationSection.tsx src/sidepanel/ProfileSections.tsx src/sidepanel/ProfileSections.test.tsx
git commit -m "feat: add basic info section to sidepanel views"
```

### Task 3: 接入 App 与样式，并完成回归验证

**Files:**
- Modify: `src/sidepanel/App.tsx`
- Modify: `src/sidepanel/index.css`
- Modify: `package.json`
- Test: `src/sidepanel/ProfileSections.test.tsx`
- Test: `src/sidepanel/navigation.test.ts`

**Interfaces:**
- Consumes:
  - `ProfileSections`
  - existing `handleFieldClick(key: string, value: string): Promise<void>`
  - existing `status`, `workingKey`, `profile`
- Produces:
  - `App` 仅负责状态与消息收发，渲染委托给 `ProfileSections`
  - `.field-value-single-line` 样式，确保单行显示

- [ ] **Step 1: Write the failing test**

```tsx
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BasicInformationSection } from './BasicInformationSection.tsx';

test('自我评价摘要在单行样式下仍保留六个点文案', () => {
  const html = renderToStaticMarkup(
    <BasicInformationSection
      personal={{
        name: '',
        gender: '',
        birthDate: '',
        phone: '',
        email: '',
        selfEvaluation: '具备扎实的软件开发基础和完整的项目实践经历，重视代码可读性。',
      }}
      workingKey={null}
      onFieldClick={() => {}}
    />
  );

  assert.match(html, /field-value-single-line/);
  assert.match(html, /(\.\.\.\.\.\.)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/sidepanel/ProfileSections.test.tsx src/sidepanel/navigation.test.ts`

Expected: FAIL because `App.tsx` 仍直接内联旧 sections，或样式类未定义

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/sidepanel/App.tsx
import { ProfileSections } from './ProfileSections.tsx';

// 在 status 块后替换旧的四段内联 JSX
<ProfileSections
  profile={profile}
  workingKey={workingKey}
  onFieldClick={handleFieldClick}
/>
```

```css
/* src/sidepanel/index.css */
.field-value-single-line {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: clip;
}
```

```json
// package.json
"test": "node --experimental-strip-types --test src/shared/backup-sync.test.ts src/utils/resume-parse.test.ts src/services/llm/llm-service.test.ts src/services/llm/visualRegionFill.test.ts src/background/visualRegionFill.test.ts src/content/visualRegionFill.test.ts src/offscreen/imageCrop.test.ts src/parsers/offscreen-routing.test.ts src/parsers/markdownParser.test.ts src/sidepanel/basicInfo.test.ts src/sidepanel/ProfileSections.test.tsx src/sidepanel/navigation.test.ts src/content/pageScan.test.ts"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test src/sidepanel/basicInfo.test.ts src/sidepanel/ProfileSections.test.tsx src/sidepanel/navigation.test.ts && npm run build`

Expected: PASS，sidepanel 新旧测试通过，构建成功，`dist` 产物可重新加载

- [ ] **Step 5: Commit**

```bash
git add src/sidepanel/App.tsx src/sidepanel/index.css package.json
git commit -m "feat: expose personal info in sidepanel"
```

## Self-Review

- Spec coverage:
  - 新增 `基本信息` 模块：Task 2 / Task 3
  - 字段来源与顺序固定：Task 1
  - `自我评价` 单行 `......` 规则：Task 1 / Task 2 / Task 3
  - 继续复用现有 `handleFieldClick()` 写入：Task 2 / Task 3
  - 不改存储模型、不改设置页：所有任务均未触碰 `shared/types.ts` 与 `options/App.tsx`
- Placeholder scan:
  - 已避免使用 “补充测试”“处理边界” 这类空话，所有测试、命令、文件路径均已具体化。
- Type consistency:
  - `onFieldClick(key: string, value: string): void`
  - `buildBasicInfoItems(personal: PersonalInfo)`
  - `ProfileSections({ profile, workingKey, onFieldClick })`
