import assert from 'node:assert/strict';
import test from 'node:test';
import type { PersonalInfo } from '../shared/types.ts';
import {
  BASIC_INFO_FIELDS,
  buildBasicInfoItems,
  toSingleLinePreview,
} from './basicInfo.ts';

test('基本信息字段顺序与设计稿一致', () => {
  assert.deepEqual(
    BASIC_INFO_FIELDS.map(field => field.key),
    [
      'name',
      'gender',
      'birthDate',
      'politicalStatus',
      'ethnicity',
      'phone',
      'email',
      'wechat',
      'hometown',
      'currentAddress',
      'idCard',
      'selfEvaluation',
    ],
  );
});

test('自我评价摘要固定追加六个点', () => {
  assert.equal(toSingleLinePreview('这是一个很长的自我评价内容', 6), '这是一个很长......');
  assert.equal(toSingleLinePreview('简短内容', 20), '简短内容');
});

test('buildBasicInfoItems 保留完整值并给自我评价生成六个点摘要', () => {
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
});
