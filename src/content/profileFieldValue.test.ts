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
