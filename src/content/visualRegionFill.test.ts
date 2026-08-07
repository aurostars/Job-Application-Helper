import assert from 'node:assert/strict';
import test from 'node:test';
import type { VisualRegionFillMapping } from '../shared/types.ts';
import {
  applyVisualRegionMappings,
  serializeVisualControls,
} from './visualRegionFill.ts';

test('只序列化选区内的空白可写控件，并保留 controlId 与 options', () => {
  const controls = serializeVisualControls([
    {
      controlId: 'ctrl-phone',
      value: '',
      rect: { left: 10, top: 10, width: 120, height: 36 },
      label: '手机号',
      name: 'phone',
      tagName: 'input',
      options: [],
    },
    {
      controlId: 'ctrl-degree',
      value: '',
      rect: { left: 10, top: 80, width: 120, height: 36 },
      label: '学历',
      name: 'degree',
      tagName: 'select',
      options: ['本科', '硕士'],
    },
    {
      controlId: 'ctrl-filled',
      value: '已有值',
      rect: { left: 10, top: 160, width: 120, height: 36 },
      label: '邮箱',
      name: 'email',
      tagName: 'input',
      options: [],
    },
  ], { left: 0, top: 0, right: 200, bottom: 140 });

  assert.deepEqual(controls.map(item => item.controlId), ['ctrl-phone', 'ctrl-degree']);
  assert.deepEqual(controls[1]?.options, ['本科', '硕士']);
});

test('只把存在于 controlsById 的映射交给写回层', async () => {
  const mappings: VisualRegionFillMapping[] = [
    {
      controlId: 'ctrl-phone',
      fieldMeaning: '手机号',
      matchedProfilePath: 'personal.phone',
      value: '13800000000',
    },
    {
      controlId: 'missing',
      fieldMeaning: '邮箱',
      matchedProfilePath: 'personal.email',
      value: 'test@example.com',
    },
  ];

  const fillCalls: Array<{
    values: Array<{ element: { id: string }; value: string }>;
    keepGoing: boolean;
  }> = [];
  const controlsById = new Map([
    ['ctrl-phone', { controlId: 'ctrl-phone', element: { id: 'phone-input' } }],
  ]);

  const written = await applyVisualRegionMappings(
    mappings,
    controlsById,
    () => true,
    async (values, shouldContinue) => {
      fillCalls.push({
        values: values as Array<{ element: { id: string }; value: string }>,
        keepGoing: shouldContinue(),
      });
      return values.length;
    },
  );

  assert.equal(written, 1);
  assert.equal(fillCalls.length, 1);
  assert.deepEqual(fillCalls[0], {
    values: [{ element: { id: 'phone-input' }, value: '13800000000' }],
    keepGoing: true,
  });
});
