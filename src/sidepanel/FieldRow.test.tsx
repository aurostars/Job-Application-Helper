import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { FieldRow } from './FieldRow.tsx';

function installClipboard(writeText: (value: string) => Promise<void>): void {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
}

test('复制按钮只复制完整字段内容且阻止冒泡', async () => {
  let filled = 0;
  let stopped = 0;
  let copied = '';
  installClipboard(async (value) => { copied = value; });

  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <FieldRow
        fieldKey="basic-hobbies"
        label="兴趣爱好"
        value="摄影、徒步"
        displayValue="摄影……"
        onFieldClick={() => { filled += 1; }}
      />,
    );
  });

  const copy = renderer.root.findByProps({ 'aria-label': '复制兴趣爱好内容' });
  await act(async () => copy.props.onClick({ stopPropagation: () => { stopped += 1; } }));

  assert.equal(copied, '摄影、徒步');
  assert.equal(stopped, 1);
  assert.equal(filled, 0);
  assert.equal(copy.children.join(''), '✓');
  const buttons = renderer.root.findAllByType('button');
  assert.equal(buttons.length, 2);
  assert.ok(buttons.every(button => button.parent?.type === 'div'));
});

test('剪贴板写入失败时不显示成功状态', async () => {
  installClipboard(async () => { throw new Error('clipboard denied'); });
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <FieldRow fieldKey="email" label="邮箱" value="lin@example.com" onFieldClick={() => {}} />,
    );
  });

  const copy = renderer.root.findByProps({ 'aria-label': '复制邮箱内容' });
  await act(async () => copy.props.onClick({ stopPropagation: () => {} }));
  assert.equal(copy.children.join(''), '复制');
});

test('复制成功约 1000ms 后恢复复制文本', async () => {
  installClipboard(async () => {});
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <FieldRow fieldKey="phone" label="手机号" value="13800138000" onFieldClick={() => {}} />,
    );
  });

  const copy = renderer.root.findByProps({ 'aria-label': '复制手机号内容' });
  await act(async () => copy.props.onClick({ stopPropagation: () => {} }));
  assert.equal(copy.children.join(''), '✓');
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 1050)); });
  assert.equal(copy.children.join(''), '复制');
});

test('卸载时清理复制状态计时器', async () => {
  installClipboard(async () => {});
  const originalClearTimeout = globalThis.clearTimeout;
  let cleared = 0;
  globalThis.clearTimeout = ((timer: ReturnType<typeof setTimeout>) => {
    cleared += 1;
    return originalClearTimeout(timer);
  }) as typeof clearTimeout;

  try {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <FieldRow fieldKey="name" value="林知远" onFieldClick={() => {}} />,
      );
    });
    const copy = renderer.root.findByProps({ 'aria-label': '复制字段内容' });
    await act(async () => copy.props.onClick({ stopPropagation: () => {} }));
    await act(async () => renderer.unmount());
    assert.equal(cleared, 1);
  } finally {
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test('字段主体保持写入行为，空字段没有复制入口', async () => {
  let clicked: [string, string] | null = null;
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <FieldRow
        fieldKey="basic-name"
        label="姓名"
        value="林知远"
        onFieldClick={(key, value) => { clicked = [key, value]; }}
      />,
    );
  });
  const fieldButton = renderer.root.findByProps({ className: 'field-button' });
  await act(async () => fieldButton.props.onClick());
  assert.deepEqual(clicked, ['basic-name', '林知远']);

  await act(async () => {
    renderer.update(
      <FieldRow fieldKey="basic-name" label="姓名" value="" empty onFieldClick={() => {}} />,
    );
  });
  assert.equal(renderer.root.findAllByProps({ 'aria-label': '复制姓名内容' }).length, 0);
  assert.equal(renderer.root.findByProps({ className: 'field-button' }).props.disabled, true);
});


test('剪贴板请求未完成时卸载不会再创建计时器', async () => {
  let resolveWrite!: () => void;
  installClipboard(() => new Promise<void>(resolve => { resolveWrite = resolve; }));
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <FieldRow fieldKey="name" value="林知远" onFieldClick={() => {}} />,
    );
  });

  const originalSetTimeout = globalThis.setTimeout;
  let scheduled = 0;
  globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    scheduled += 1;
    return originalSetTimeout(handler, timeout, ...args);
  }) as typeof setTimeout;

  try {
    const copy = renderer.root.findByProps({ 'aria-label': '复制字段内容' });
    let copyPromise!: Promise<void>;
    await act(async () => { copyPromise = copy.props.onClick({ stopPropagation: () => {} }); });
    await act(async () => renderer.unmount());
    await act(async () => {
      resolveWrite();
      await copyPromise;
    });
    assert.equal(scheduled, 0);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('旧复制失败晚于新复制成功时保留最新成功状态', async () => {
  type PendingWrite = { resolve: () => void; reject: () => void };
  const pending: PendingWrite[] = [];
  installClipboard(() => new Promise<void>((resolve, reject) => {
    pending.push({ resolve, reject: () => reject(new Error('clipboard denied')) });
  }));

  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <FieldRow fieldKey="email" label="邮箱" value="lin@example.com" onFieldClick={() => {}} />,
    );
  });
  const copy = renderer.root.findByProps({ 'aria-label': '复制邮箱内容' });
  let oldRequest!: Promise<void>;
  let newRequest!: Promise<void>;
  act(() => { oldRequest = copy.props.onClick({ stopPropagation: () => {} }); });
  act(() => { newRequest = copy.props.onClick({ stopPropagation: () => {} }); });

  await act(async () => {
    pending[1].resolve();
    await newRequest;
  });
  assert.equal(copy.children.join(''), '✓');

  await act(async () => {
    pending[0].reject();
    await oldRequest;
  });
  assert.equal(copy.children.join(''), '✓');
  await act(async () => renderer.unmount());
});

test('旧复制成功晚于新复制失败时不覆盖最新失败状态', async () => {
  type PendingWrite = { resolve: () => void; reject: () => void };
  const pending: PendingWrite[] = [];
  installClipboard(() => new Promise<void>((resolve, reject) => {
    pending.push({ resolve, reject: () => reject(new Error('clipboard denied')) });
  }));

  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <FieldRow fieldKey="phone" label="手机号" value="13800138000" onFieldClick={() => {}} />,
    );
  });
  const copy = renderer.root.findByProps({ 'aria-label': '复制手机号内容' });
  let oldRequest!: Promise<void>;
  let newRequest!: Promise<void>;
  act(() => { oldRequest = copy.props.onClick({ stopPropagation: () => {} }); });
  act(() => { newRequest = copy.props.onClick({ stopPropagation: () => {} }); });

  await act(async () => {
    pending[1].reject();
    await newRequest;
  });
  assert.equal(copy.children.join(''), '复制');

  await act(async () => {
    pending[0].resolve();
    await oldRequest;
  });
  assert.equal(copy.children.join(''), '复制');
  await act(async () => renderer.unmount());
});
