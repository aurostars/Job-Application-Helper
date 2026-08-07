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
          achievements: '',
        }],
        projects: [{
          id: 'proj-1',
          name: '某项目',
          role: '',
          startDate: '',
          endDate: '',
          description: '',
          achievements: '',
          technologies: '',
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
    (html.match(/class=\"section-toggle-icon is-open\"/g) || []).length,
    5,
  );
  assert.equal(
    (html.match(/section-toggle-chevron/g) || []).length,
    5,
  );
});
