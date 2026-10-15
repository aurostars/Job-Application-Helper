import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TestRenderer, { act } from 'react-test-renderer';
import { ProfileSections } from './ProfileSections.tsx';
import { shouldReloadProfile } from '../shared/profileStorageChange.ts';
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
  awards: [],
  experience: [],
  projects: [],
  customInformation: [],
  skills: [],
  certifications: [],
};

test('ProfileSections 把基本信息排在教育经历之前', () => {
  const html = renderToStaticMarkup(
    React.createElement(ProfileSections, {
      profile,
      workingKey: null,
      onFieldClick: () => {},
    })
  );

  assert.ok(html.indexOf('基本信息') < html.indexOf('教育经历'));
});

test('空值字段显示未填写并禁用按钮', () => {
  const html = renderToStaticMarkup(
    React.createElement(ProfileSections, {
      profile: { ...profile, personal: { ...profile.personal, wechat: '' } },
      workingKey: null,
      onFieldClick: () => {},
    })
  );

  assert.match(html, /微信号/);
  assert.match(html, /未填写/);
  assert.match(html, /disabled/);
});

test('自我评价摘要在单行样式下仍保留六个点文案', () => {
  const html = renderToStaticMarkup(
    React.createElement(ProfileSections, {
      profile,
      workingKey: null,
      onFieldClick: () => {},
    })
  );

  assert.match(html, /具备扎实的软件开发基础和完整的项目....../);
  assert.match(html, /field-value-single-line/);
});

test('各模块标题行右侧都有折叠箭头图标', () => {
  const html = renderToStaticMarkup(
    React.createElement(ProfileSections, {
      profile: {
        ...profile,
        education: [{
          id: 'edu-1',
          school: '浙江大学',
          college: '',
          educationType: '',
          major: '',
          degree: '',
          startDate: '',
          endDate: '',
          gpa: '',
          ranking: '',
        }],
        experience: [{
          id: 'exp-1',
          company: '某公司',
          position: '',
          startDate: '',
          endDate: '',
          description: '',
        }],
        projects: [{
          id: 'proj-1',
          name: '某项目',
          role: '',
          startDate: '',
          endDate: '',
          description: '',
        }],
        customInformation: [{
          id: 'custom-1',
          name: '其他信息',
          content: '测试内容',
        }],
      },
      workingKey: null,
      onFieldClick: () => {},
    })
  );

  assert.equal(
    (html.match(/class="section-toggle-icon is-open"/g) || []).length,
    5,
  );
  assert.equal(
    (html.match(/section-toggle-chevron/g) || []).length,
    5,
  );
});

test('资料库变化会触发信息窗口重新加载', () => {
  const oldValue = { activeProfileId: 'old' };
  const newValue = { activeProfileId: 'new' };
  assert.equal(shouldReloadProfile({ resumeProfileLibrary: { oldValue, newValue } }, 'local'), true);
  assert.equal(shouldReloadProfile({ userProfile: { oldValue, newValue } }, 'local'), false);
  assert.equal(shouldReloadProfile({ resumeProfileLibrary: { oldValue, newValue } }, 'sync'), false);
});

test('有奖项时展示全部非空字段并移除经历废弃字段', () => {
  const html = renderToStaticMarkup(
    React.createElement(ProfileSections, {
      profile: {
        ...profile,
        awards: [{
          id: 'award-1',
          name: '全国大学生创新奖',
          role: '负责人',
          date: '2026-06',
          description: '负责方案设计与落地',
        }],
        experience: [{
          id: 'exp-1',
          company: '某公司',
          position: '实习生',
          startDate: '2025-01',
          endDate: '2025-06',
          description: '开发业务功能',
        }],
        projects: [{
          id: 'proj-1',
          name: '某项目',
          role: '开发者',
          startDate: '2025-07',
          endDate: '2025-12',
          description: '项目描述',
        }],
      },
      workingKey: null,
      onFieldClick: () => {},
    })
  );

  assert.match(html, /奖项 \/ 荣誉/);
  assert.match(html, /名称/);
  assert.match(html, /全国大学生创新奖/);
  assert.match(html, /担任角色/);
  assert.match(html, /负责人/);
  assert.match(html, /获取时间/);
  assert.match(html, /2026-06/);
  assert.match(html, /详细描述/);
  assert.match(html, /负责方案设计与落地/);
  assert.doesNotMatch(html, />成果</);
  assert.doesNotMatch(html, />技术栈</);
});

test('奖项可选字段为空时不生成空行', () => {
  const html = renderToStaticMarkup(
    React.createElement(ProfileSections, {
      profile: {
        ...profile,
        awards: [{ id: 'award-1', name: '优秀毕业生', role: '', date: '', description: '' }],
      },
      workingKey: null,
      onFieldClick: () => {},
    })
  );

  assert.match(html, /优秀毕业生/);
  assert.doesNotMatch(html, /担任角色/);
  assert.doesNotMatch(html, /获取时间/);
  assert.doesNotMatch(html, /详细描述/);
});

test('没有奖项时不显示奖项分区', () => {
  const html = renderToStaticMarkup(
    React.createElement(ProfileSections, { profile, workingKey: null, onFieldClick: () => {} })
  );

  assert.doesNotMatch(html, /奖项 \/ 荣誉/);
});


test('专业技能显示在奖项之前并过滤空项', () => {
  const html = renderToStaticMarkup(
    React.createElement(ProfileSections, {
      profile: {
        ...profile,
        projects: [{ id: 'p1', name: '项目 A', role: '', startDate: '', endDate: '', description: '' }],
        skills: ['TypeScript', '  ', 'React'],
        awards: [{ id: 'a1', name: '优秀毕业生', role: '', date: '', description: '' }],
      },
      workingKey: null,
      onFieldClick: () => {},
    })
  );

  assert.match(html, /专业技能/);
  assert.match(html, /TypeScript/);
  assert.match(html, /React/);
  assert.equal((html.match(/class="record-card skill-card"/g) || []).length, 2);
  assert.doesNotMatch(html, /技能 1|技能 2|技能 3/);
  assert.match(html, /class="field-row skill-field-row"/);
  assert.ok(html.indexOf('项目经历') < html.indexOf('专业技能'));
  assert.ok(html.indexOf('专业技能') < html.indexOf('奖项 / 荣誉'));
  assert.doesNotMatch(html, />\s+<\/span>/);
});

test('点击专业技能会传递技能值和稳定工作键', async () => {
  let clicked: [string, string] | null = null;
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(ProfileSections, {
        profile: { ...profile, skills: ['TypeScript', 'React'] },
        workingKey: null,
        onFieldClick: (key: string, value: string) => { clicked = [key, value]; },
      })
    );
  });

  const button = renderer.root.findAllByType('button').find(item =>
    item.findAllByType('span').some(span => span.children.join('') === 'React')
  );
  assert.ok(button);
  await act(async () => { button.props.onClick(); });
  assert.deepEqual(clicked, ['skill-1', 'React']);
});

test('专业技能按钮使用全宽文本列而不是通用字段的标签列', () => {
  const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');

  assert.match(
    css,
    /\.skill-field-row \.field-button\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/s,
  );
});

test('没有有效专业技能时不显示专业技能分区', () => {
  const html = renderToStaticMarkup(
    React.createElement(ProfileSections, {
      profile: { ...profile, skills: ['', '  '] },
      workingKey: null,
      onFieldClick: () => {},
    })
  );
  assert.doesNotMatch(html, /专业技能/);
});


test('展示新增字段并为每个非空字段提供独立复制按钮', () => {
  const html = renderToStaticMarkup(
    React.createElement(ProfileSections, {
      profile: {
        ...profile,
        personal: { ...profile.personal, hobbies: '摄影、徒步' },
        education: [{
          id: 'edu-copy',
          school: '浙江大学',
          college: '',
          educationType: '',
          major: '',
          degree: '',
          startDate: '',
          endDate: '',
          gpa: '',
          ranking: '',
          majorCourses: '数据结构、操作系统',
        }],
        skills: ['TypeScript'],
      },
      workingKey: null,
      onFieldClick: () => {},
    }),
  );

  assert.match(html, /兴趣爱好/);
  assert.match(html, /摄影、徒步/);
  assert.match(html, /主要课程/);
  assert.match(html, /数据结构、操作系统/);
  const expectedLabelledFields = [
    '姓名', '性别', '出生日期', '手机号', '邮箱', '兴趣爱好', '自我评价', '学校', '主要课程',
  ];
  for (const label of expectedLabelledFields) {
    assert.match(html, new RegExp(`aria-label="复制${label}内容"`));
  }
  assert.equal((html.match(/aria-label="复制字段内容"/g) || []).length, 1);
  assert.match(html, /TypeScript/);
  const expectedCopyButtonCount = 10;
  assert.equal((html.match(/class="field-copy-button"/g) || []).length, expectedCopyButtonCount);
});
