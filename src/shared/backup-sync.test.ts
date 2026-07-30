import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBackupDocument,
  createBackupSummary,
  MAX_BACKUP_BYTES,
  parseAndValidateBackup,
  serializeBackup,
} from './backup.ts';
import { StorageService } from './storage.ts';
import {
  decideSyncAction,
  performSync,
  sha256BusinessData,
  stableStringifyBusinessData,
} from './sync.ts';
import {
  buildWebDAVFileUrl,
  getRemoteDocument,
  normalizeWebDAVServerUrl,
  putRemoteDocument,
  testConnection,
  WebDAVError,
} from '../services/webdav.ts';
import type { BackupData } from './types.ts';

const completeData: BackupData = {
  userProfile: {
    personal: {
      name: '张三',
      gender: '男',
      birthDate: '2000-01',
      phone: '13800000000',
      email: 'test@example.com',
    },
    education: [],
    experience: [],
    projects: [],
    customInformation: [],
    skills: ['TypeScript'],
    certifications: [],
    resume: {
      fileName: 'resume.pdf',
      fileData: 'data:application/pdf;base64,QUJD',
      fileType: 'pdf',
      uploadDate: '2026-01-01T00:00:00.000Z',
    },
  },
  llmConfig: {
    provider: 'deepseek' as never,
    apiKey: 'sk-secret',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  settings: { locale: 'zh-CN' },
};

function validJson() {
  return serializeBackup(createBackupDocument(
    completeData,
    '1.0.0',
    '2026-01-01T00:00:00.000Z',
  ));
}

test('合法 V1 文档完整保留简历和 API Key', () => {
  const result = parseAndValidateBackup(validJson());
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.document.data.userProfile?.resume?.fileData, completeData.userProfile?.resume?.fileData);
  assert.equal(result.document.data.llmConfig?.apiKey, 'sk-secret');
});

const invalidCases: Array<[string, string, string]> = [
  ['非 JSON', '{', 'INVALID_JSON'],
  ['根节点数组', '[]', 'INVALID_ROOT'],
  ['缺少版本', JSON.stringify({}), 'MISSING_SCHEMA_VERSION'],
  ['未来版本', JSON.stringify({ schemaVersion: 2 }), 'UNSUPPORTED_FUTURE_VERSION'],
  ['版本非整数', JSON.stringify({ schemaVersion: 1.5 }), 'INVALID_SCHEMA_VERSION'],
];

for (const [name, raw, code] of invalidCases) {
  test(`拒绝${name}`, () => {
    const result = parseAndValidateBackup(raw);
    assert.equal(result.success, false);
    if (!result.success) assert.equal(result.error.code, code);
  });
}

test('拒绝错误的用户资料数组', () => {
  const document = JSON.parse(validJson());
  document.data.userProfile.education = {};
  const result = parseAndValidateBackup(JSON.stringify(document));
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, 'INVALID_USER_PROFILE');
});

test('旧资料缺少数组字段时会补齐为空数组', () => {
  const document = JSON.parse(validJson());
  delete document.data.userProfile.education;
  delete document.data.userProfile.customInformation;
  const result = parseAndValidateBackup(JSON.stringify(document));
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.document.data.userProfile?.education, []);
    assert.deepEqual(result.document.data.userProfile?.customInformation, []);
  }
});

test('拒绝非字符串简历正文', () => {
  const document = JSON.parse(validJson());
  document.data.userProfile.resume.fileData = 123;
  const result = parseAndValidateBackup(JSON.stringify(document));
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, 'INVALID_USER_PROFILE');
});

test('拒绝非字符串 API Key', () => {
  const document = JSON.parse(validJson());
  document.data.llmConfig.apiKey = 123;
  const result = parseAndValidateBackup(JSON.stringify(document));
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, 'INVALID_LLM_CONFIG');
});

test('拒绝超过 20 MiB 的输入', () => {
  const result = parseAndValidateBackup('x'.repeat(MAX_BACKUP_BYTES + 1));
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, 'FILE_TOO_LARGE');
});

test('远端无效 schema 会在应用前被拒绝', () => {
  const result = parseAndValidateBackup(JSON.stringify({
    schemaVersion: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    source: { extensionVersion: '1.0.0' },
    data: { userProfile: null, llmConfig: { apiKey: 1 }, settings: null },
  }));
  assert.equal(result.success, false);
});

test('稳定序列化不受对象键顺序影响', () => {
  const left = { userProfile: null, llmConfig: null, settings: { b: 2, a: 1 } };
  const right = { settings: { a: 1, b: 2 }, llmConfig: null, userProfile: null };
  assert.equal(stableStringifyBusinessData(left), stableStringifyBusinessData(right));
});

test('exportedAt 不参与业务数据 hash', async () => {
  const first = createBackupDocument(completeData, '1.0.0', '2026-01-01T00:00:00.000Z');
  const second = createBackupDocument(completeData, '2.0.0', '2026-07-01T00:00:00.000Z');
  assert.equal(await sha256BusinessData(first.data), await sha256BusinessData(second.data));
});

const decisions: Array<[string, string | undefined, string, string | undefined, boolean, string]> = [
  ['首次远端不存在', undefined, 'local', undefined, false, 'create-remote'],
  ['双方相同', 'base', 'same', 'same', true, 'no-change'],
  ['仅本地变化', 'base', 'local', 'base', true, 'upload-local'],
  ['仅远端变化', 'base', 'base', 'remote', true, 'download-remote'],
  ['双方变化', 'base', 'local', 'remote', true, 'conflict'],
  ['无基线且远端不同', undefined, 'local', 'remote', true, 'conflict'],
  ['有基线但远端被删除', 'base', 'local', undefined, false, 'conflict'],
];

for (const [name, base, local, remote, exists, expected] of decisions) {
  test(`同步决策：${name}`, () => {
    assert.equal(decideSyncAction(base, local, remote, exists), expected);
  });
}

const webdavConfig = {
  enabled: true,
  serverUrl: 'https://dav.example.com/backups/',
  username: 'user',
  password: 'pass',
};

test('WebDAV 服务器地址自动追加固定文件名', () => {
  assert.equal(
    buildWebDAVFileUrl('https://dav.example.com/backups'),
    'https://dav.example.com/backups/job-application-helper/job-application-helper.json',
  );
});

test('旧版完整文件 URL 会迁移为服务器目录', () => {
  assert.equal(
    normalizeWebDAVServerUrl('https://dav.example.com/backups/custom-backup.json'),
    'https://dav.example.com/backups/',
  );
});

test('WebDAV GET 将 404 识别为远端不存在', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 404 });
  try {
    assert.deepEqual(await getRemoteDocument(webdavConfig), { exists: false });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('WebDAV 连接测试创建或确认固定目录，再允许备份文件不存在', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method?: string }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), method: init?.method });
    if (init?.method === 'MKCOL') return new Response('', { status: 201 });
    return new Response('', { status: 404 });
  };
  try {
    const result = await testConnection(webdavConfig);
    assert.equal(result.exists, false);
    assert.deepEqual(requests, [
      {
        url: 'https://dav.example.com/backups/job-application-helper/',
        method: 'MKCOL',
      },
      {
        url: 'https://dav.example.com/backups/job-application-helper/job-application-helper.json',
        method: 'GET',
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('WebDAV 连接测试允许固定目录已存在', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls += 1;
    if (init?.method === 'MKCOL') return new Response('', { status: 405 });
    return new Response('', { status: 404 });
  };
  try {
    assert.deepEqual(await testConnection(webdavConfig), {
      exists: false,
      etag: undefined,
    });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('WebDAV 连接测试对无法创建目录给出明确提示', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 404 });
  try {
    await assert.rejects(
      testConnection(webdavConfig),
      (error: unknown) => error instanceof WebDAVError
        && error.status === 404
        && /无法创建备份目录/.test(error.message),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('WebDAV 连接测试对 MKCOL 409 给出可写根地址提示', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 409 });
  try {
    await assert.rejects(
      testConnection(webdavConfig),
      (error: unknown) => error instanceof WebDAVError
        && error.status === 409
        && /可写的 WebDAV 根地址/.test(error.message),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('WebDAV 首次创建携带 If-None-Match', async () => {
  const originalFetch = globalThis.fetch;
  let captured: RequestInit | undefined;
  let capturedUrl = '';
  globalThis.fetch = async (input, init) => {
    capturedUrl = String(input);
    captured = init;
    return new Response('', { status: 201, headers: { ETag: '"v1"' } });
  };
  try {
    const result = await putRemoteDocument(webdavConfig, '{}', { type: 'create' });
    assert.equal(
      capturedUrl,
      'https://dav.example.com/backups/job-application-helper/job-application-helper.json',
    );
    assert.equal(new Headers(captured?.headers).get('If-None-Match'), '*');
    assert.equal(result.etag, '"v1"');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('WebDAV 首次 PUT 404 时自动创建固定目录后重试', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method?: string }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), method: init?.method });
    if (requests.length === 1) return new Response('', { status: 404 });
    if (init?.method === 'MKCOL') return new Response('', { status: 201 });
    return new Response('', { status: 201, headers: { ETag: '"created"' } });
  };
  try {
    const result = await putRemoteDocument(webdavConfig, '{}', { type: 'create' });
    assert.deepEqual(requests, [
      {
        url: 'https://dav.example.com/backups/job-application-helper/job-application-helper.json',
        method: 'PUT',
      },
      {
        url: 'https://dav.example.com/backups/job-application-helper/',
        method: 'MKCOL',
      },
      {
        url: 'https://dav.example.com/backups/job-application-helper/job-application-helper.json',
        method: 'PUT',
      },
    ]);
    assert.equal(result.etag, '"created"');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('WebDAV 更新携带 GET 返回的精确 If-Match', async () => {
  const originalFetch = globalThis.fetch;
  let captured: RequestInit | undefined;
  globalThis.fetch = async (_input, init) => {
    captured = init;
    return new Response(null, { status: 204 });
  };
  try {
    await putRemoteDocument(webdavConfig, '{}', { type: 'update', etag: 'W/"exact"' });
    assert.equal(new Headers(captured?.headers).get('If-Match'), 'W/"exact"');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('WebDAV 412 直接报冲突且不进行无条件重试', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response('', { status: 412 });
  };
  try {
    await assert.rejects(
      putRemoteDocument(webdavConfig, '{}', { type: 'update', etag: '"v1"' }),
      (error: unknown) => error instanceof WebDAVError && error.code === 'PRECONDITION_FAILED',
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('WebDAV 上传后仍无 ETag 时不得标记为可安全同步', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls += 1;
    if (init?.method === 'PUT') return new Response(null, { status: 204 });
    return new Response(validJson(), { status: 200 });
  };
  try {
    const created = await putRemoteDocument(webdavConfig, '{}', { type: 'create' });
    assert.equal(created.etag, undefined);
    const refreshed = await getRemoteDocument(webdavConfig);
    assert.equal(refreshed.etag, undefined);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function installChromeStorageMock(initial: Record<string, unknown>) {
  const values = { ...initial };
  const previousChrome = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime: {
        getManifest: () => ({ version: '1.0.0' }),
      },
      storage: {
        local: {
          get: async (keys: string | string[]) => {
            const selected = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(
              selected.filter(key => Object.hasOwn(values, key)).map(key => [key, values[key]]),
            );
          },
          set: async (entries: Record<string, unknown>) => Object.assign(values, entries),
          remove: async (keys: string | string[]) => {
            for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];
          },
        },
      },
    },
  });
  return {
    values,
    restore: () => {
      if (previousChrome) Object.defineProperty(globalThis, 'chrome', previousChrome);
      else delete (globalThis as { chrome?: unknown }).chrome;
    },
  };
}

test('已有同步基线后远端文件被删除会进入冲突状态', async () => {
  const baseHash = await sha256BusinessData(completeData);
  const mock = installChromeStorageMock({
    userProfile: completeData.userProfile,
    llmConfig: completeData.llmConfig,
    settings: completeData.settings,
    webdavConfig,
    syncMetadata: { status: 'synced', lastSyncedHash: baseHash, etag: '"v1"' },
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 404 });
  try {
    assert.equal(await performSync('test-remote-deleted'), 'conflict');
    const metadata = mock.values.syncMetadata as {
      status: string;
      lastError?: string;
      conflict?: unknown;
    };
    assert.equal(metadata.status, 'conflict');
    assert.match(metadata.lastError || '', /远端文件已被删除/);
    assert.equal(metadata.conflict, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    mock.restore();
  }
});

test('仅远端变化时下载并替换本地业务数据', async () => {
  const baseHash = await sha256BusinessData(completeData);
  const remoteData: BackupData = {
    ...completeData,
    settings: { locale: 'en-US', source: 'remote' },
  };
  const remoteJson = serializeBackup(createBackupDocument(
    remoteData,
    '1.0.0',
    '2026-02-01T00:00:00.000Z',
  ));
  const mock = installChromeStorageMock({
    userProfile: completeData.userProfile,
    llmConfig: completeData.llmConfig,
    settings: completeData.settings,
    webdavConfig,
    syncMetadata: { status: 'synced', lastSyncedHash: baseHash, etag: '"v1"' },
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(remoteJson, {
    status: 200,
    headers: { ETag: '"v2"' },
  });
  try {
    assert.equal(await performSync('test-remote-only'), 'synced');
    assert.deepEqual(mock.values.settings, remoteData.settings);
    const metadata = mock.values.syncMetadata as {
      status: string;
      etag?: string;
      lastSyncedHash?: string;
    };
    assert.equal(metadata.status, 'synced');
    assert.equal(metadata.etag, '"v2"');
    assert.equal(metadata.lastSyncedHash, await sha256BusinessData(remoteData));
  } finally {
    globalThis.fetch = originalFetch;
    mock.restore();
  }
});

test('本地导出包含 WebDAV 设置且往返不丢字段', () => {
  const json = serializeBackup(createBackupDocument(
    completeData,
    '1.0.0',
    '2026-01-01T00:00:00.000Z',
    webdavConfig,
  ));
  const parsed = parseAndValidateBackup(json);
  assert.ok(parsed.success);
  assert.deepEqual(parsed.document.webdavConfig, webdavConfig);
  assert.equal(createBackupSummary(parsed.document).hasWebDAVConfig, true);
});

test('同步上传的文档不带 WebDAV 凭据', () => {
  const document = createBackupDocument(completeData, '1.0.0', '2026-01-01T00:00:00.000Z');
  assert.equal('webdavConfig' in document, false);
  assert.equal(serializeBackup(document).includes('pass'), false);
  assert.equal(createBackupSummary(document).hasWebDAVConfig, false);
});

test('WebDAV 设置不参与业务数据 hash', async () => {
  const withConfig = createBackupDocument(completeData, '1.0.0', '2026-01-01T00:00:00.000Z', webdavConfig);
  const without = createBackupDocument(completeData, '1.0.0', '2026-01-01T00:00:00.000Z');
  assert.equal(
    await sha256BusinessData(withConfig.data),
    await sha256BusinessData(without.data),
  );
});

test('拒绝结构无效的 WebDAV 设置', () => {
  const json = serializeBackup(createBackupDocument(
    completeData,
    '1.0.0',
    '2026-01-01T00:00:00.000Z',
    { enabled: 'yes', serverUrl: 'https://dav.example.com/', username: 'u', password: 'p' } as never,
  ));
  const parsed = parseAndValidateBackup(json);
  assert.equal(parsed.success, false);
  if (!parsed.success) assert.equal(parsed.error.code, 'INVALID_WEBDAV_CONFIG');
});

test('导入带 WebDAV 设置的备份会覆盖本地凭据', async () => {
  const mock = installChromeStorageMock({ webdavConfig: { ...webdavConfig, password: 'old' } });
  try {
    await StorageService.replaceBusinessData(completeData, webdavConfig);
    assert.deepEqual(mock.values.webdavConfig, webdavConfig);
  } finally {
    mock.restore();
  }
});

test('旧备份缺少 WebDAV 字段时保留本地凭据', async () => {
  const mock = installChromeStorageMock({ webdavConfig });
  try {
    const parsed = parseAndValidateBackup(serializeBackup(
      createBackupDocument(completeData, '1.0.0', '2026-01-01T00:00:00.000Z'),
    ));
    assert.ok(parsed.success);
    await StorageService.replaceBusinessData(parsed.document.data, parsed.document.webdavConfig);
    assert.deepEqual(mock.values.webdavConfig, webdavConfig);
  } finally {
    mock.restore();
  }
});

test('同步下载不会覆盖本地 WebDAV 凭据', async () => {
  const baseHash = await sha256BusinessData(completeData);
  const remoteData: BackupData = { ...completeData, settings: { locale: 'en-US' } };
  const remoteJson = serializeBackup(createBackupDocument(
    remoteData,
    '1.0.0',
    '2026-02-01T00:00:00.000Z',
    { ...webdavConfig, password: 'remote-password' },
  ));
  const mock = installChromeStorageMock({
    userProfile: completeData.userProfile,
    llmConfig: completeData.llmConfig,
    settings: completeData.settings,
    webdavConfig,
    syncMetadata: { status: 'synced', lastSyncedHash: baseHash, etag: '"v1"' },
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(remoteJson, {
    status: 200,
    headers: { ETag: '"v2"' },
  });
  try {
    assert.equal(await performSync('test-webdav-not-overwritten'), 'synced');
    assert.deepEqual(mock.values.settings, remoteData.settings);
    assert.deepEqual(mock.values.webdavConfig, webdavConfig);
  } finally {
    globalThis.fetch = originalFetch;
    mock.restore();
  }
});
