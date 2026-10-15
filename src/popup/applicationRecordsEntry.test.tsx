import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TestRenderer, { act } from 'react-test-renderer';
import App, { openApplicationRecordOptions } from './App.tsx';

test('popup 视觉重构保留全部现有入口且不引入额外功能', async () => {
  const popupModule = await import('./App.tsx');
  const html = renderToStaticMarkup(React.createElement(popupModule.default));
  assert.match(html, /popup-record-actions/);
  assert.match(html, /popup-primary-action/);
  assert.match(html, /popup-ai-actions/);
  assert.match(html, /popup-support-actions/);
  const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
  assert.match(appSource, /className="popup-metrics-strip"/);
  for (const label of [
    '新建投递记录',
    '打开投递记录',
    '打开信息窗口',
    '快速填充',
    'AI 扫描填充',
    'AI 框选补填',
    '设置个人信息',
  ]) assert.match(html, new RegExp(label));
  assert.match(html, /icons\/icon128\.png/);
  assert.match(html, /aria-label="立即同步"/);
  assert.doesNotMatch(html, /复制全部信息|清空表单/);
});

test('打开投递记录入口打开带 query 的设置页标签', async () => {
  const originalChrome = (globalThis as { chrome?: unknown }).chrome;
  const createdTabs: Array<{ url?: string }> = [];

  (globalThis as { chrome?: unknown }).chrome = {
    runtime: {
      getURL(path: string) {
        return `chrome-extension://test/${path}`;
      },
    },
    tabs: {
      async create(options: { url?: string }) {
        createdTabs.push(options);
      },
    },
  };

  try {
    await openApplicationRecordOptions();
    assert.equal(createdTabs.length, 1);
    assert.equal(
      createdTabs[0]?.url,
      'chrome-extension://test/src/options/index.html?tab=application-records',
    );
  } finally {
    (globalThis as { chrome?: unknown }).chrome = originalChrome;
  }
});


test('popup 保持浏览器扩展所需的固定基础宽度', () => {
  const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
  assert.match(css, /body\s*\{[^}]*min-width:\s*360px/s);
  assert.match(css, /\.popup-shell\s*\{[^}]*width:\s*360px/s);
});


test('立即同步期间禁用重复点击并在成功后给出反馈', async () => {
  const originalChrome = (globalThis as { chrome?: unknown }).chrome;
  let resolveSync!: (value: unknown) => void;
  const syncResponse = new Promise(resolve => { resolveSync = resolve; });
  let syncCalls = 0;
  let renderer!: TestRenderer.ReactTestRenderer;

  (globalThis as { chrome?: unknown }).chrome = {
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      async sendMessage(message: { type: string }) {
        if (message.type === 'SYNC_NOW') {
          syncCalls += 1;
          return syncResponse;
        }
        return { success: false, error: '测试中不加载资料' };
      },
    },
    tabs: {
      async query() { return [{}]; },
      async create() { return {}; },
    },
  };

  try {
    await act(async () => {
      renderer = TestRenderer.create(<App />);
      await Promise.resolve();
      await Promise.resolve();
    });

    let syncButton = renderer.root.findByProps({ 'aria-label': '立即同步' });
    act(() => { syncButton.props.onClick(); });
    syncButton = renderer.root.findByProps({ 'aria-label': '正在同步' });
    assert.equal(syncButton.props.disabled, true);
    assert.match(JSON.stringify(syncButton.props.children), /同步中/);

    act(() => { syncButton.props.onClick(); });
    assert.equal(syncCalls, 1);

    await act(async () => {
      resolveSync({ success: true, data: { status: 'synced', action: 'no-change' } });
      await syncResponse;
      await Promise.resolve();
    });

    syncButton = renderer.root.findByProps({ 'aria-label': '同步成功' });
    assert.equal(syncButton.props.disabled, false);
    assert.equal(syncButton.findByType('span').children.join(''), '同步成功');
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    (globalThis as { chrome?: unknown }).chrome = originalChrome;
  }
});


test('同步 pending 时卸载后完成请求不再更新状态或创建反馈计时器', async () => {
  const originalChrome = (globalThis as { chrome?: unknown }).chrome;
  const originalSetTimeout = globalThis.setTimeout;
  let resolveSync!: (value: unknown) => void;
  const syncResponse = new Promise(resolve => { resolveSync = resolve; });
  let feedbackTimers = 0;
  let renderer!: TestRenderer.ReactTestRenderer;

  (globalThis as { chrome?: unknown }).chrome = {
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      async sendMessage(message: { type: string }) {
        if (message.type === 'SYNC_NOW') return syncResponse;
        return { success: false, error: '测试中不加载资料' };
      },
    },
    tabs: {
      async query() { return [{}]; },
      async create() { return {}; },
    },
  };

  try {
    await act(async () => {
      renderer = TestRenderer.create(<App />);
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => { renderer.root.findByProps({ 'aria-label': '立即同步' }).props.onClick(); });
    await act(async () => renderer.unmount());

    globalThis.setTimeout = ((handler: TimerHandler, delay?: number) => {
      if (delay === 1800) feedbackTimers += 1;
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    await act(async () => {
      resolveSync({ success: true, data: { status: 'synced', action: 'no-change' } });
      await syncResponse;
      await Promise.resolve();
    });

    assert.equal(feedbackTimers, 0);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    (globalThis as { chrome?: unknown }).chrome = originalChrome;
  }
});
