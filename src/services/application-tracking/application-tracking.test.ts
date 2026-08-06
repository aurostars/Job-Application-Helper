import assert from 'node:assert/strict';
import test from 'node:test';
import { STORAGE_KEYS } from '../../shared/storage.ts';
import type {
  ApplicationRecord,
  ApplicationSyncConfig,
  Message,
  WebDAVConfig,
} from '../../shared/types.ts';
import {
  resetApplicationSyncHooks,
  setApplicationSyncHooks,
} from './syncCoordinator.ts';

type BackgroundModule = typeof import('../../background/index.ts');

const baseSyncConfig: ApplicationSyncConfig = {
  destination: 'both',
  autoSync: true,
  webdavCsvFileName: 'application-records.csv',
  feishu: {
    appToken: 'app_token',
    tableId: 'tbl_123',
  },
};

const webdavConfig: WebDAVConfig = {
  enabled: true,
  serverUrl: 'https://dav.example.com/backups/',
  username: 'user',
  password: 'pass',
};

const createPayload = {
  siteName: 'Boss直聘',
  siteUrl: 'https://www.zhipin.com/job_detail/123',
  siteHost: 'www.zhipin.com',
  companyName: '示例科技',
  jobTitle: '前端开发',
};

function installChromeMock(initial: Record<string, unknown>) {
  const values = { ...initial };
  const previousChrome = Object.getOwnPropertyDescriptor(globalThis, 'chrome');

  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime: {
        getManifest: () => ({ version: '1.0.0' }),
        onMessage: {
          addListener: () => undefined,
          removeListener: () => undefined,
        },
        onInstalled: {
          addListener: () => undefined,
        },
        openOptionsPage: () => undefined,
      },
      storage: {
        local: {
          QUOTA_BYTES: 10 * 1024 * 1024,
          getBytesInUse: async () => 0,
          get: async (keys: string | string[]) => {
            const selected = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(
              selected
                .filter((key) => Object.hasOwn(values, key))
                .map((key) => [key, values[key]]),
            );
          },
          set: async (entries: Record<string, unknown>) => Object.assign(values, entries),
          remove: async (keys: string | string[]) => {
            for (const key of Array.isArray(keys) ? keys : [keys]) {
              delete values[key];
            }
          },
          clear: async () => {
            for (const key of Object.keys(values)) delete values[key];
          },
        },
      },
      tabs: {
        get: async (tabId: number) => ({ id: tabId, url: 'https://example.com' }),
        query: async () => [{ id: 99, url: 'https://example.com/jobs/1' }],
        sendMessage: async () => ({
          success: false,
          error: '页面抓取尚未接入',
        }),
      },
    },
  });

  return {
    values,
    restore: () => {
      if (previousChrome) {
        Object.defineProperty(globalThis, 'chrome', previousChrome);
      } else {
        delete (globalThis as { chrome?: unknown }).chrome;
      }
    },
  };
}

const bootstrapChrome = installChromeMock({});
const { handleMessage } = await import('../../background/index.ts') as BackgroundModule;
bootstrapChrome.restore();

test.afterEach(() => {
  resetApplicationSyncHooks();
});

test('保存投递记录后根据配置触发目标同步', async () => {
  const chromeMock = installChromeMock({
    [STORAGE_KEYS.APPLICATION_RECORDS]: [],
    [STORAGE_KEYS.APPLICATION_SYNC_CONFIG]: baseSyncConfig,
    [STORAGE_KEYS.WEBDAV_CONFIG]: webdavConfig,
  });

  const calls: string[] = [];
  setApplicationSyncHooks({
    webdav: async ({ csv }) => {
      calls.push('webdav');
      assert.match(csv, /示例科技/);
      return { status: 'synced', exportedCount: 1 };
    },
    feishu: async (records) => {
      calls.push('feishu');
      return records.map((record) => ({
        localId: record.id,
        remoteRecordId: `fs_${record.id}`,
        status: 'synced' as const,
      }));
    },
  });

  try {
    const response = await handleMessage(
      { type: 'SAVE_APPLICATION_RECORD', payload: createPayload } as Message,
      {} as chrome.runtime.MessageSender,
    );

    assert.equal(response.success, true);
    assert.deepEqual(calls, ['webdav', 'feishu']);
    assert.equal(response.data?.sync?.triggered, true);

    const records = chromeMock.values[STORAGE_KEYS.APPLICATION_RECORDS] as ApplicationRecord[];
    assert.equal(records.length, 1);
    assert.equal(records[0]?.feishuSync?.status, 'synced');
    assert.match(records[0]?.feishuSync?.recordId || '', /^fs_/);
  } finally {
    chromeMock.restore();
  }
});

test('自动同步关闭时保存投递记录不触发远端同步', async () => {
  const chromeMock = installChromeMock({
    [STORAGE_KEYS.APPLICATION_RECORDS]: [],
    [STORAGE_KEYS.APPLICATION_SYNC_CONFIG]: {
      ...baseSyncConfig,
      autoSync: false,
    } satisfies ApplicationSyncConfig,
    [STORAGE_KEYS.WEBDAV_CONFIG]: webdavConfig,
  });

  let called = false;
  setApplicationSyncHooks({
    webdav: async () => {
      called = true;
      return { status: 'synced', exportedCount: 1 };
    },
  });

  try {
    const response = await handleMessage(
      { type: 'SAVE_APPLICATION_RECORD', payload: createPayload } as Message,
      {} as chrome.runtime.MessageSender,
    );

    assert.equal(response.success, true);
    assert.equal(response.data?.sync?.triggered, false);
    assert.equal(called, false);
  } finally {
    chromeMock.restore();
  }
});

test('删除投递记录默认不会在列表中返回软删除项', async () => {
  const chromeMock = installChromeMock({
    [STORAGE_KEYS.APPLICATION_RECORDS]: [],
  });

  try {
    const created = await handleMessage(
      { type: 'SAVE_APPLICATION_RECORD', payload: createPayload } as Message,
      {} as chrome.runtime.MessageSender,
    );
    assert.equal(created.success, true);
    const recordId = created.data?.record?.id;
    assert.ok(recordId);

    const deleted = await handleMessage(
      { type: 'DELETE_APPLICATION_RECORD', payload: { id: recordId } } as Message,
      {} as chrome.runtime.MessageSender,
    );
    assert.equal(deleted.success, true);

    const visible = await handleMessage(
      { type: 'GET_APPLICATION_RECORDS' } as Message,
      {} as chrome.runtime.MessageSender,
    );
    assert.equal(visible.success, true);
    assert.equal((visible.data as ApplicationRecord[]).length, 0);

    const all = await handleMessage(
      { type: 'GET_APPLICATION_RECORDS', payload: { includeDeleted: true } } as Message,
      {} as chrome.runtime.MessageSender,
    );
    assert.equal(all.success, true);
    assert.equal((all.data as ApplicationRecord[]).length, 1);
    assert.ok((all.data as ApplicationRecord[])[0]?.deletedAt);
  } finally {
    chromeMock.restore();
  }
});

test('CAPTURE_APPLICATION_FROM_PAGE 当前仅暴露最小消息分发边界', async () => {
  const chromeMock = installChromeMock({});

  try {
    const response = await handleMessage(
      { type: 'CAPTURE_APPLICATION_FROM_PAGE' } as Message,
      {} as chrome.runtime.MessageSender,
    );

    assert.equal(response.success, false);
    assert.match(response.error || '', /尚未实现页面抓取/);
  } finally {
    chromeMock.restore();
  }
});
