import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSidepanelUrl,
  getTargetWindowIdFromSearch,
} from './navigation.ts';

test('buildSidepanelUrl 默认保留信息浮窗入口并带上目标窗口 id', () => {
  assert.equal(
    buildSidepanelUrl({ targetWindowId: 12 }),
    'src/sidepanel/index.html?targetWindowId=12',
  );
});

test('getTargetWindowIdFromSearch 解析合法窗口 id，非法值返回 undefined', () => {
  assert.equal(getTargetWindowIdFromSearch('?targetWindowId=21'), 21);
  assert.equal(getTargetWindowIdFromSearch('?targetWindowId=abc'), undefined);
  assert.equal(getTargetWindowIdFromSearch(''), undefined);
});
