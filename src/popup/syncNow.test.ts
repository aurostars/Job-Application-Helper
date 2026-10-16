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

test('消息失败留在 Popup', async () => {
  let opened = 0;
  const result = await runPopupSync({
    sync: async () => ({ success: false, error: 'network down' }),
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
