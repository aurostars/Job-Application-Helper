import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSidepanelUrl,
  getInitialSidepanelView,
  getTargetWindowIdFromSearch,
} from './navigation.ts';

test('buildSidepanelUrl 默认保留信息浮窗入口并带上目标窗口 id', () => {
  assert.equal(
    buildSidepanelUrl({ targetWindowId: 12 }),
    'src/sidepanel/index.html?targetWindowId=12',
  );
});

test('buildSidepanelUrl 为投递记录入口追加 applications 视图参数', () => {
  assert.equal(
    buildSidepanelUrl({ targetWindowId: 12, view: 'applications' }),
    'src/sidepanel/index.html?targetWindowId=12&view=applications',
  );
});

test('getInitialSidepanelView 在 query 为 applications 时返回投递记录视图', () => {
  assert.equal(
    getInitialSidepanelView('?view=applications&targetWindowId=12'),
    'applications',
  );
});

test('getInitialSidepanelView 对缺失或非法 query 回退到信息视图', () => {
  assert.equal(getInitialSidepanelView(''), 'profile');
  assert.equal(getInitialSidepanelView('?view=unknown'), 'profile');
});

test('getTargetWindowIdFromSearch 解析合法窗口 id，非法值返回 undefined', () => {
  assert.equal(getTargetWindowIdFromSearch('?targetWindowId=21'), 21);
  assert.equal(getTargetWindowIdFromSearch('?targetWindowId=abc'), undefined);
  assert.equal(getTargetWindowIdFromSearch(''), undefined);
});
