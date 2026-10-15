import assert from 'node:assert/strict';
import test from 'node:test';
import { groupPageScanFields, type PageScanField } from './pageScan.ts';
import { FieldMatcher } from '../utils/fieldMatcher.ts';
import { FieldType } from '../shared/types.ts';

test('groups page scan fields by section while preserving field order and metadata', () => {
  const fields: PageScanField[] = [
    {
      index: 0,
      rowIndex: 0,
      section: 'personal',
      name: 'phone',
      label: '手机号码',
      type: 'input',
      options: [],
      context: '基本信息 手机号码',
    },
    {
      index: 1,
      rowIndex: 0,
      section: 'education',
      name: 'school',
      label: '学校名称',
      type: 'input',
      options: [],
      context: '教育经历 学校名称',
    },
    {
      index: 2,
      rowIndex: 0,
      section: 'personal',
      name: 'email',
      label: '邮箱',
      type: 'input',
      options: [],
      context: '基本信息 邮箱',
    },
  ];

  const grouped = groupPageScanFields(fields);

  assert.deepEqual(grouped.map(group => group.section), ['personal', 'education']);
  assert.deepEqual(grouped[0].fields.map(field => field.index), [0, 2]);
  assert.equal(grouped[0].fields[1].label, '邮箱');
  assert.deepEqual(grouped[1].fields.map(field => field.index), [1]);
});

test('matches award field semantics without reviving removed legacy fields', () => {
  const match = (labelText: string) => FieldMatcher.matchFieldType('', '', '', labelText, 'text', '');

  for (const label of ['主要课程', 'courses', 'major courses', '专业课程']) {
    assert.equal(match(label).fieldType, FieldType.MAJOR_COURSES, label);
  }
  assert.equal(match('专业').fieldType, FieldType.MAJOR);
  assert.equal(match('major').fieldType, FieldType.MAJOR);
  assert.equal(match('兴趣爱好').fieldType, FieldType.HOBBIES);
  assert.equal(match('奖项名称').fieldType, FieldType.AWARD_NAME);
  assert.equal(match('获奖角色').fieldType, FieldType.AWARD_ROLE);
  assert.equal(match('获奖时间').fieldType, FieldType.AWARD_DATE);
  assert.equal(match('奖项描述').fieldType, FieldType.AWARD_DESCRIPTION);
  assert.equal(match('项目技术栈').fieldType, FieldType.UNKNOWN);
  assert.equal(match('实习成果').fieldType, FieldType.UNKNOWN);
  assert.equal(match('项目描述').fieldType, FieldType.DESCRIPTION);
});

test('generic award labels require award module context', () => {
  const match = (labelText: string) => FieldMatcher.matchFieldType('', '', '', labelText, 'text', '').fieldType;

  assert.notEqual(match('担任角色'), FieldType.AWARD_ROLE);
  assert.notEqual(match('获取时间'), FieldType.AWARD_DATE);
  assert.notEqual(match('详细描述'), FieldType.AWARD_DESCRIPTION);

  const fieldContainer = {
    getAttribute: () => '',
    querySelector: () => ({ textContent: '详细描述' }),
  };
  const awardModule = {
    textContent: '奖项 / 荣誉 详细描述',
    ownerDocument: null,
    getAttribute: (name: string) => name === 'data-form-module' ? 'awards' : null,
    querySelector: () => null,
  };
  const element = {
    id: '',
    getAttribute: () => '',
    closest: (selector: string) => selector.includes('applyFormModuleWrapper') ? awardModule : fieldContainer,
    previousElementSibling: null,
  } as unknown as HTMLInputElement;

  const identifiers = FieldMatcher.extractIdentifiers(element);
  assert.equal(FieldMatcher.matchFieldType(
    identifiers.name,
    identifiers.id,
    identifiers.placeholder,
    identifiers.labelText,
    identifiers.type,
    identifiers.autocomplete,
  ).fieldType, FieldType.AWARD_DESCRIPTION);
});

test('project module user content mentioning awards does not create award context', () => {
  const heading = { textContent: '项目经历' };
  const fieldContainer = {
    getAttribute: () => '',
    querySelector: () => ({ textContent: '详细描述' }),
  };
  const projectModule = {
    textContent: '项目经历 曾获奖并获得荣誉',
    getAttribute: () => '',
    querySelector: (selector: string) => selector.includes('heading') || selector.includes('h1') ? heading : null,
  };
  const element = {
    id: '',
    value: '曾获奖并获得荣誉',
    getAttribute: () => '',
    closest: (selector: string) => selector.includes('applyFormModuleWrapper') ? projectModule : fieldContainer,
    previousElementSibling: null,
  } as unknown as HTMLTextAreaElement;

  const identifiers = FieldMatcher.extractIdentifiers(element);
  assert.equal(FieldMatcher.matchFieldType(
    identifiers.name, identifiers.id, identifiers.placeholder, identifiers.labelText,
    identifiers.type, identifiers.autocomplete,
  ).fieldType, FieldType.DESCRIPTION);
});
