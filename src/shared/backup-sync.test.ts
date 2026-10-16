import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createBackupDocument,
  createBackupSummary,
  MAX_BACKUP_BYTES,
  parseAndValidateBackup,
  serializeBackup,
} from './backup.ts';
import { normalizeSyncMetadata, StorageService } from './storage.ts';
import {
  decideSyncAction,
  enqueueSyncAndWait,
  performSync,
  resolveConflict,
  sha256BusinessData,
  stableStringifyBusinessData,
} from './sync.ts';
import {
  buildWebDAVFileUrl,
  buildWebDAVApplicationRecordsCsvUrl,
  getRemoteDocument,
  normalizeWebDAVServerUrl,
  putRemoteApplicationRecordsCsv,
  putRemoteDocument,
  testConnection,
  WebDAVError,
} from '../services/webdav.ts';
import type { BackupData } from './types.ts';

const legacyUserProfile = {
    personal: {
      name: '张三',
      gender: '男',
      birthDate: '2000-01',
      phone: '13800000000',
      email: 'test@example.com',
      hobbies: '摄影、徒步',
    },
    education: [{
      id: 'edu-1',
      school: '某大学',
      major: '计算机',
      degree: '本科',
      startDate: '',
      endDate: '',
      majorCourses: '数据结构、操作系统',
    }],
    experience: [],
    projects: [],
    awards: [],
    customInformation: [],
    skills: ['TypeScript'],
    certifications: [],
    resume: {
      fileName: 'resume.pdf',
      fileData: 'data:application/pdf;base64,QUJD',
      fileType: 'pdf',
      uploadDate: '2026-01-01T00:00:00.000Z',
    },
};

const completeData: BackupData = {
  resumeProfileLibrary: {
    schemaVersion: 1,
    activeProfileId: 'default-resume',
    profiles: [{
      id: 'default-resume',
      name: '默认简历',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      profile: legacyUserProfile,
    }],
  },
  llmConfig: {
    provider: 'deepseek' as never,
    apiKey: 'sk-secret',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  settings: { locale: 'zh-CN' },
  applicationRecords: [
    {
      id: 'record-1',
      companyName: '字节跳动',
      jobTitle: '前端开发',
      sourceSite: 'jobs.bytedance.com',
      sourceUrl: 'https://jobs.bytedance.com/example-1',
      status: '已投递',
      notes: '一志愿',
      appliedAt: '2026-01-01',
      location: '北京',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
};

function validJson() {
  return JSON.stringify({
    schemaVersion: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    source: { extensionVersion: '1.0.0' },
    data: {
      userProfile: legacyUserProfile,
      llmConfig: completeData.llmConfig,
      settings: completeData.settings,
      applicationRecords: completeData.applicationRecords,
    },
  });
}

test('合法 V1 文档完整保留简历和 API Key', () => {
  const result = parseAndValidateBackup(validJson());
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.document.data.resumeProfileLibrary.profiles[0]?.profile.resume?.fileData, legacyUserProfile.resume?.fileData);
  assert.equal(result.document.data.llmConfig?.apiKey, 'sk-secret');
  assert.equal(result.document.data.applicationRecords?.[0]?.companyName, '字节跳动');
  const profile = result.document.data.resumeProfileLibrary.profiles[0]?.profile;
  assert.equal(profile?.personal.hobbies, '摄影、徒步');
  assert.equal(profile?.education[0]?.majorCourses, '数据结构、操作系统');
});

test('合法 V1 文档完整保留自定义视觉开关', () => {
  const json = serializeBackup(createBackupDocument({
    ...completeData,
    llmConfig: {
      provider: 'custom' as never,
      apiKey: 'sk-secret',
      baseUrl: 'https://example.com/v1',
      model: 'my-vision-model',
      visionEnabled: true,
    },
  }, '1.0.0', '2026-01-01T00:00:00.000Z'));
  const result = parseAndValidateBackup(json);
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.document.data.llmConfig?.visionEnabled, true);
});

const invalidCases: Array<[string, string, string]> = [
  ['非 JSON', '{', 'INVALID_JSON'],
  ['根节点数组', '[]', 'INVALID_ROOT'],
  ['缺少版本', JSON.stringify({}), 'MISSING_SCHEMA_VERSION'],
  ['未来版本', JSON.stringify({ schemaVersion: 3 }), 'UNSUPPORTED_FUTURE_VERSION'],
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
  delete document.data.applicationRecords;
  const result = parseAndValidateBackup(JSON.stringify(document));
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.document.data.resumeProfileLibrary.profiles[0]?.profile.education, []);
    assert.deepEqual(result.document.data.resumeProfileLibrary.profiles[0]?.profile.customInformation, []);
    assert.equal('applicationRecords' in result.document.data, false);
  }
});

test('拒绝结构非法的投递记录数组', () => {
  const document = JSON.parse(validJson());
  document.data.applicationRecords = [{ id: 1 }];
  const result = parseAndValidateBackup(JSON.stringify(document));
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, 'INVALID_DATA');
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

test('拒绝非布尔值视觉开关', () => {
  const document = JSON.parse(validJson());
  document.data.llmConfig.visionEnabled = 'yes';
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

test('旧同步元数据仅在 hash 与 ETag 均有效时迁移为可信基线', () => {
  assert.equal(normalizeSyncMetadata({ status: 'synced', lastSyncedHash: 'v1', etag: 'e1' }).hasTrustedBaseline, true);
  assert.equal(normalizeSyncMetadata({ status: 'synced', lastSyncedHash: 'v1' }).hasTrustedBaseline, false);
  assert.equal(normalizeSyncMetadata({ status: 'synced', etag: 'e1' }).hasTrustedBaseline, false);
});

test('显式可信状态缺少完整基线字段时仍会降级为不可信', () => {
  assert.equal(normalizeSyncMetadata({
    status: 'synced',
    hasTrustedBaseline: true,
    etag: 'e1',
  }).hasTrustedBaseline, false);
  assert.equal(normalizeSyncMetadata({
    status: 'synced',
    hasTrustedBaseline: true,
    lastSyncedHash: 'v1',
  }).hasTrustedBaseline, false);
});

test('同步元数据显式不可信状态不会被旧字段覆盖', () => {
  assert.equal(normalizeSyncMetadata({
    status: 'synced',
    hasTrustedBaseline: false,
    lastSyncedHash: 'v1',
    etag: 'e1',
  }).hasTrustedBaseline, false);
});

const decisions: Array<[string, boolean, string | undefined, string, string | undefined, boolean, string]> = [
  ['首次远端不存在', false, undefined, 'local', undefined, false, 'create-remote'],
  ['无可信基线但双方相同', false, undefined, 'same', 'same', true, 'no-change'],
  ['可信基线下双方相同', true, 'base', 'same', 'same', true, 'no-change'],
  ['仅本地变化', true, 'base', 'local', 'base', true, 'upload-local'],
  ['仅远端变化', true, 'base', 'base', 'remote', true, 'download-remote'],
  ['双方变化', true, 'base', 'local', 'remote', true, 'conflict'],
  ['无可信基线且远端不同', false, undefined, 'local', 'remote', true, 'conflict'],
  ['可信基线下远端被删除', true, 'base', 'base', undefined, false, 'conflict'],
];

for (const [name, trusted, base, local, remote, exists, expected] of decisions) {
  test(`同步决策：${name}`, () => {
    assert.equal(decideSyncAction(trusted, base, local, remote, exists), expected);
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

test('WebDAV 投递记录 CSV 使用固定文件名', () => {
  assert.equal(
    buildWebDAVApplicationRecordsCsvUrl('https://dav.example.com/backups'),
    'https://dav.example.com/backups/job-application-helper/application-records.csv',
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

test('投递记录 CSV 以上传覆盖方式写入固定文件', async () => {
  const originalFetch = globalThis.fetch;
  let captured: RequestInit | undefined;
  let capturedUrl = '';
  globalThis.fetch = async (input, init) => {
    capturedUrl = String(input);
    captured = init;
    return new Response('', { status: 201, headers: { ETag: '"csv-v1"' } });
  };
  try {
    const result = await putRemoteApplicationRecordsCsv(
      webdavConfig,
      'companyName,jobTitle\n字节跳动,前端开发',
    );
    assert.equal(
      capturedUrl,
      'https://dav.example.com/backups/job-application-helper/application-records.csv',
    );
    assert.equal(new Headers(captured?.headers).get('Content-Type'), 'text/csv; charset=utf-8');
    assert.equal(new Headers(captured?.headers).get('If-Match'), null);
    assert.equal(new Headers(captured?.headers).get('If-None-Match'), null);
    assert.equal(result.etag, '"csv-v1"');
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

test('保存 WebDAV 设置和测试连接不会建立或重置同步基线', async () => {
  const originalMetadata = {
    status: 'conflict',
    hasTrustedBaseline: false,
    lastSyncedHash: 'legacy-hash',
    etag: 'legacy-etag',
  };
  const mock = installChromeStorageMock({ syncMetadata: originalMetadata });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => (
    init?.method === 'MKCOL'
      ? new Response('', { status: 405 })
      : new Response('', { status: 404 })
  );
  try {
    await StorageService.saveWebDAVConfig(webdavConfig);
    await testConnection(webdavConfig);
    assert.deepEqual(mock.values.syncMetadata, originalMetadata);
  } finally {
    globalThis.fetch = originalFetch;
    mock.restore();
  }
});

test('已有同步基线后远端文件被删除会进入冲突状态', async () => {
  const baseHash = await sha256BusinessData(completeData);
  const mock = installChromeStorageMock({
    resumeProfileLibrary: completeData.resumeProfileLibrary,
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

test('手动同步不要求启用保存后的自动同步', async () => {
  const mock = installChromeStorageMock({
    resumeProfileLibrary: completeData.resumeProfileLibrary,
    llmConfig: completeData.llmConfig,
    settings: completeData.settings,
    applicationRecords: completeData.applicationRecords,
    webdavConfig: { ...webdavConfig, enabled: false },
    syncMetadata: { status: 'idle' },
  });
  const originalFetch = globalThis.fetch;
  const requests: Array<{ method?: string; url: string }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ method: init?.method, url: String(input) });
    if (init?.method === 'GET') return new Response('', { status: 404 });
    return new Response(null, { status: 204, headers: { ETag: '"v1"' } });
  };
  try {
    assert.equal(await performSync('manual'), 'synced');
    assert.ok(requests.some(request =>
      request.method === 'PUT'
      && request.url === 'https://dav.example.com/backups/job-application-helper/job-application-helper.json'
    ));
    const metadata = mock.values.syncMetadata as {
      status: string;
      etag?: string;
    };
    assert.equal(metadata.status, 'synced');
    assert.equal(metadata.etag, '"v1"');
  } finally {
    globalThis.fetch = originalFetch;
    mock.restore();
  }
});

test('冲突后选择使用本地不要求启用保存后的自动同步', async () => {
  const baseHash = await sha256BusinessData({
    ...completeData,
    settings: { locale: 'base' },
  });
  const mock = installChromeStorageMock({
    resumeProfileLibrary: completeData.resumeProfileLibrary,
    llmConfig: completeData.llmConfig,
    settings: { locale: 'local' },
    applicationRecords: completeData.applicationRecords,
    webdavConfig: { ...webdavConfig, enabled: false },
    syncMetadata: {
      status: 'conflict',
      lastSyncedHash: baseHash,
      etag: '"v1"',
      conflict: {
        local: createBackupSummary(createBackupDocument({
          ...completeData,
          settings: { locale: 'local' },
        }, '1.0.0', '2026-08-24T00:00:00.000Z')),
        remote: createBackupSummary(createBackupDocument({
          ...completeData,
          settings: { locale: 'remote' },
        }, '1.0.0', '2026-08-24T00:00:00.000Z')),
      },
    },
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === 'GET') {
      return new Response(validJson(), {
        status: 200,
        headers: { ETag: '"v1"' },
      });
    }
    return new Response(null, { status: 204, headers: { ETag: '"v2"' } });
  };
  try {
    assert.equal(await resolveConflict('local'), 'synced');
    const metadata = mock.values.syncMetadata as {
      status: string;
      conflict?: unknown;
      etag?: string;
    };
    assert.equal(metadata.status, 'synced');
    assert.equal(metadata.conflict, undefined);
    assert.equal(metadata.etag, '"v2"');
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
    applicationRecords: [
      {
        ...completeData.applicationRecords![0]!,
        id: 'remote-record',
        companyName: '腾讯',
        sourceSite: 'join.qq.com',
        sourceUrl: 'https://join.qq.com/example-2',
        location: '深圳',
      },
    ],
  };
  const remoteJson = serializeBackup(createBackupDocument(
    remoteData,
    '1.0.0',
    '2026-02-01T00:00:00.000Z',
  ));
  const mock = installChromeStorageMock({
    resumeProfileLibrary: completeData.resumeProfileLibrary,
    llmConfig: completeData.llmConfig,
    settings: completeData.settings,
    applicationRecords: completeData.applicationRecords,
    webdavConfig,
    syncMetadata: { status: 'synced', lastSyncedHash: baseHash, etag: '"v1"' },
  });
  const originalFetch = globalThis.fetch;
  const requests: Array<{ method?: string; url: string; body?: string }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ method: init?.method, url: String(input), body: typeof init?.body === 'string' ? init.body : undefined });
    if (init?.method === 'GET') {
      return new Response(remoteJson, {
        status: 200,
        headers: { ETag: '"v2"' },
      });
    }
    return new Response(null, { status: 204, headers: { ETag: '"csv-v2"' } });
  };
  try {
    assert.equal(await performSync('test-remote-only'), 'synced');
    assert.deepEqual(mock.values.settings, remoteData.settings);
    assert.deepEqual(mock.values.applicationRecords, remoteData.applicationRecords);
    const metadata = mock.values.syncMetadata as {
      status: string;
      etag?: string;
      lastSyncedHash?: string;
    };
    assert.equal(metadata.status, 'synced');
    assert.equal(metadata.etag, '"v2"');
    assert.equal(metadata.lastSyncedHash, await sha256BusinessData(remoteData));
    assert.equal(requests.filter(request => request.method === 'PUT').length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    mock.restore();
  }
});

test('同步应用旧远端备份时保留本地投递记录', async () => {
  const localData: BackupData = {
    ...completeData,
    settings: { locale: 'zh-CN', source: 'local' },
    applicationRecords: [
      {
        ...completeData.applicationRecords![0]!,
        id: 'local-record',
        notes: '保留本地',
      },
    ],
  };
  const remoteLegacyDocument = JSON.parse(serializeBackup(createBackupDocument(
    { ...completeData, settings: { locale: 'en-US', source: 'remote' } },
    '1.0.0',
    '2026-02-01T00:00:00.000Z',
  )));
  delete remoteLegacyDocument.data.applicationRecords;
  const mock = installChromeStorageMock({
    userProfile: localData.userProfile,
    llmConfig: localData.llmConfig,
    settings: localData.settings,
    applicationRecords: localData.applicationRecords,
  });
  try {
    const parsed = parseAndValidateBackup(JSON.stringify(remoteLegacyDocument));
    assert.ok(parsed.success);
    await StorageService.applyRemoteBusinessData(parsed.document.data);
    assert.deepEqual(mock.values.settings, { locale: 'en-US', source: 'remote' });
    assert.deepEqual(mock.values.applicationRecords, localData.applicationRecords);
  } finally {
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
    resumeProfileLibrary: completeData.resumeProfileLibrary,
    llmConfig: completeData.llmConfig,
    settings: completeData.settings,
    applicationRecords: completeData.applicationRecords,
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
    assert.deepEqual(mock.values.applicationRecords, remoteData.applicationRecords);
    assert.deepEqual(mock.values.webdavConfig, webdavConfig);
  } finally {
    globalThis.fetch = originalFetch;
    mock.restore();
  }
});

function v1SingleProfileJson(): string {
  return JSON.stringify({
    schemaVersion: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    source: { extensionVersion: '1.0.0' },
    data: {
      userProfile: legacyUserProfile,
      llmConfig: completeData.llmConfig,
      settings: completeData.settings,
      applicationRecords: completeData.applicationRecords,
    },
  });
}

function profileLibrary() {
  return {
    schemaVersion: 1 as const,
    activeProfileId: 'profile-2',
    profiles: [
      {
        id: 'profile-1',
        name: '校招',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        profile: legacyUserProfile,
      },
      {
        id: 'profile-2',
        name: '社招',
        createdAt: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-02-02T00:00:00.000Z',
        profile: { ...legacyUserProfile, skills: ['TypeScript', 'React'] },
      },
    ],
  };
}

test('V1 导入迁移为单套默认简历', () => {
  const result = parseAndValidateBackup(v1SingleProfileJson());
  assert.ok(result.success);
  if (!result.success) return;
  assert.equal(result.document.schemaVersion, 2);
  assert.equal(result.document.data.resumeProfileLibrary.profiles[0]?.name, '默认简历');
});

test('当前导出规范化资料并完整保留 awards 四字段', () => {
  const library = profileLibrary();
  library.profiles[0]!.profile = {
    ...library.profiles[0]!.profile,
    experience: [{ id: 'e1', company: 'A', position: '实习生', achievements: '旧成果' }] as never,
    projects: [{ id: 'p1', name: '项目', role: '负责人', achievements: '旧成果', technologies: 'TS' }] as never,
    awards: [{ id: 'a1', name: '优秀毕业生', role: '获奖人', date: '2026-06', description: '校级荣誉' }],
  };

  const document = createBackupDocument({ ...completeData, resumeProfileLibrary: library }, '2.0.0');
  const profile = document.data.resumeProfileLibrary.profiles[0]!.profile;

  assert.deepEqual(profile.awards, [{ id: 'a1', name: '优秀毕业生', role: '获奖人', date: '2026-06', description: '校级荣誉' }]);
  assert.equal('achievements' in profile.experience[0]!, false);
  assert.equal('achievements' in profile.projects[0]!, false);
  assert.equal('technologies' in profile.projects[0]!, false);
});

test('V1 旧备份补 awards 并清理废弃字段', () => {
  const document = JSON.parse(validJson());
  document.data.userProfile.experience = [{ id: 'e1', company: 'A', position: '实习生', achievements: '旧成果' }];
  document.data.userProfile.projects = [{ id: 'p1', name: '项目', role: '负责人', achievements: '旧成果', technologies: 'TS' }];
  delete document.data.userProfile.awards;

  const result = parseAndValidateBackup(JSON.stringify(document));
  assert.ok(result.success);
  if (!result.success) return;
  const profile = result.document.data.resumeProfileLibrary.profiles[0]!.profile;
  assert.deepEqual(profile.awards, []);
  assert.equal('achievements' in profile.experience[0]!, false);
  assert.equal('achievements' in profile.projects[0]!, false);
  assert.equal('technologies' in profile.projects[0]!, false);
});

test('V2 往返保留全部简历及当前 ID', () => {
  const library = profileLibrary();
  const data = { ...completeData, userProfile: undefined, resumeProfileLibrary: library } as never;
  const parsed = parseAndValidateBackup(serializeBackup(createBackupDocument(data, '2.0.0')));
  assert.ok(parsed.success);
  if (parsed.success) {
    assert.equal(parsed.document.data.resumeProfileLibrary.activeProfileId, library.activeProfileId);
    assert.deepEqual(parsed.document.data.resumeProfileLibrary.profiles.map(profile => profile.profile.awards), [[], []]);
  }
});

for (const [name, mutate] of [
  ['空列表', (library: ReturnType<typeof profileLibrary>) => { library.profiles = []; }],
  ['重复 ID', (library: ReturnType<typeof profileLibrary>) => { library.profiles[1]!.id = library.profiles[0]!.id; }],
  ['trim 后重名', (library: ReturnType<typeof profileLibrary>) => { library.profiles[1]!.name = ` ${library.profiles[0]!.name} `; }],
  ['非法 active ID', (library: ReturnType<typeof profileLibrary>) => { library.activeProfileId = 'missing'; }],
] as const) {
  test(`V2 拒绝${name}`, () => {
    const library = profileLibrary();
    mutate(library);
    const raw = JSON.stringify({
      schemaVersion: 2,
      exportedAt: '2026-01-01T00:00:00.000Z',
      source: { extensionVersion: '2.0.0' },
      data: { resumeProfileLibrary: library, llmConfig: null, settings: null },
    });
    assert.equal(parseAndValidateBackup(raw).success, false);
  });
}

test('hash 对 active ID 和任一 profile 变化敏感', async () => {
  const original = profileLibrary();
  const changedActive = { ...original, activeProfileId: 'profile-1' };
  const changedProfile = structuredClone(original);
  changedProfile.profiles[0]!.profile.skills.push('Node.js');
  const data = (resumeProfileLibrary: typeof original) => ({
    resumeProfileLibrary, llmConfig: null, settings: null, applicationRecords: [],
  }) as never;
  const baseHash = await sha256BusinessData(data(original));
  assert.notEqual(await sha256BusinessData(data(changedActive)), baseHash);
  assert.notEqual(await sha256BusinessData(data(changedProfile)), baseHash);
});

test('V2 导入替换资料库且缺少投递记录时保留现有记录', async () => {
  const library = profileLibrary();
  const mock = installChromeStorageMock({ applicationRecords: completeData.applicationRecords });
  try {
    await StorageService.replaceBusinessData({ resumeProfileLibrary: library, llmConfig: null, settings: null } as never);
    assert.deepEqual(mock.values.resumeProfileLibrary, library);
    assert.deepEqual(mock.values.applicationRecords, completeData.applicationRecords);
  } finally {
    mock.restore();
  }
});


test('V2 旧资料字段兼容导入并统一清理且保留其他内容', () => {
  const library = profileLibrary();
  library.profiles[0]!.profile.experience = [{
    id: 'e1', company: 'A', position: '实习生', startDate: '2025-01', endDate: '2025-02', description: '描述', achievements: '旧成果',
  }] as never;
  library.profiles[0]!.profile.projects = [{
    id: 'p1', name: '项目', role: '负责人', startDate: '2025-03', endDate: '2025-04', description: '项目描述', achievements: '旧成果', technologies: 'TS',
  }] as never;
  const raw = JSON.stringify({
    schemaVersion: 2,
    exportedAt: '2026-01-01T00:00:00.000Z',
    source: { extensionVersion: '2.0.0' },
    data: { resumeProfileLibrary: library, llmConfig: null, settings: null },
  });
  const result = parseAndValidateBackup(raw);
  assert.ok(result.success);
  if (!result.success) return;
  const profile = result.document.data.resumeProfileLibrary.profiles[0]!.profile;
  assert.deepEqual(profile.experience[0], { id: 'e1', company: 'A', position: '实习生', startDate: '2025-01', endDate: '2025-02', description: '描述' });
  assert.deepEqual(profile.projects[0], { id: 'p1', name: '项目', role: '负责人', startDate: '2025-03', endDate: '2025-04', description: '项目描述' });
  assert.deepEqual(profile.skills, legacyUserProfile.skills);
});


test('V1 兼容资料条目缺失字符串并在导入后补全', () => {
  const document = JSON.parse(validJson());
  document.data.userProfile.experience = [{ id: 'e1', company: 'A', position: '实习生' }];
  document.data.userProfile.projects = [{ id: 'p1', name: '项目', role: '' }];
  document.data.userProfile.awards = [{ name: '校级荣誉' }];
  const result = parseAndValidateBackup(JSON.stringify(document));
  assert.ok(result.success);
  if (!result.success) return;
  const profile = result.document.data.resumeProfileLibrary.profiles[0]!.profile;
  assert.deepEqual(profile.experience[0], { id: 'e1', company: 'A', position: '实习生', startDate: '', endDate: '', description: '' });
  assert.deepEqual(profile.projects[0], { id: 'p1', name: '项目', role: '', startDate: '', endDate: '', description: '' });
  assert.deepEqual(profile.awards[0], { id: '', name: '校级荣誉', role: '', date: '', description: '' });
});

test('V1 拒绝兼容资料中的非法字段类型', () => {
  for (const mutate of [
    (profile: Record<string, any>) => { profile.experience = [{ id: 'e1', company: 'A', position: 42 }]; },
    (profile: Record<string, any>) => { profile.projects = [{ id: 'p1', name: '项目', role: '', description: false }]; },
    (profile: Record<string, any>) => { profile.awards = [{ name: '奖项', date: 2026 }]; },
  ]) {
    const document = JSON.parse(validJson());
    mutate(document.data.userProfile);
    const result = parseAndValidateBackup(JSON.stringify(document));
    assert.equal(result.success, false);
    if (!result.success) assert.equal(result.error.code, 'INVALID_USER_PROFILE');
  }
});

test('双设备共享远端时未修改设备下载 V2 且所有 PUT 总数为零', async () => {
  const canonical = parseAndValidateBackup(serializeBackup(createBackupDocument(completeData, '1.0.0')));
  assert.ok(canonical.success);
  const v1: BackupData = { ...canonical.document.data, settings: { locale: 'v1' } };
  const v2: BackupData = { ...canonical.document.data, settings: { locale: 'v2' } };
  const v1Hash = await sha256BusinessData(v1);
  let remoteJson = serializeBackup(createBackupDocument(v1, '1.0.0'));
  let remoteEtag = '"v1"';
  let putCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (init?.method === 'GET') {
      return new Response(remoteJson, { status: 200, headers: { ETag: remoteEtag } });
    }
    if (init?.method === 'PUT') putCalls += 1;
    if (url.endsWith('job-application-helper.json')) {
      remoteJson = String(init?.body);
      remoteEtag = '"v2"';
    }
    return new Response(null, { status: 204, headers: { ETag: remoteEtag } });
  };

  const b = installChromeStorageMock({
    resumeProfileLibrary: v2.resumeProfileLibrary,
    llmConfig: v2.llmConfig,
    settings: v2.settings,
    applicationRecords: v2.applicationRecords,
    webdavConfig,
    syncMetadata: { status: 'synced', hasTrustedBaseline: true, lastSyncedHash: v1Hash, etag: '"v1"' },
  });
  try {
    assert.equal(await performSync('test-device-b'), 'synced');
    const bMetadata = b.values.syncMetadata as Record<string, unknown>;
    assert.equal(bMetadata.lastAction, 'upload-local');
    assert.equal(bMetadata.hasTrustedBaseline, true);
    assert.equal(bMetadata.lastSyncedHash, await sha256BusinessData(v2));
    assert.equal(bMetadata.etag, '"v2"');
  } finally {
    b.restore();
  }

  const putsBeforeA = putCalls;
  const a = installChromeStorageMock({
    resumeProfileLibrary: v1.resumeProfileLibrary,
    llmConfig: v1.llmConfig,
    settings: v1.settings,
    applicationRecords: v1.applicationRecords,
    webdavConfig,
    syncMetadata: { status: 'synced', hasTrustedBaseline: true, lastSyncedHash: v1Hash, etag: '"v1"' },
  });
  try {
    assert.equal(await performSync('test-device-a'), 'synced');
    assert.deepEqual(await StorageService.getBackupData(), v2);
    const aMetadata = a.values.syncMetadata as Record<string, unknown>;
    assert.equal(aMetadata.lastSyncedHash, await sha256BusinessData(v2));
    assert.equal(aMetadata.lastAction, 'download-remote');
    assert.equal(aMetadata.hasTrustedBaseline, true);
    assert.equal(aMetadata.etag, '"v2"');
    assert.equal(putCalls - putsBeforeA, 0);
  } finally {
    globalThis.fetch = originalFetch;
    a.restore();
  }
});

test('应用远端后的有效 hash 不匹配时冲突且不上传或更新可信基线', async () => {
  const localData: BackupData = { ...completeData, settings: { locale: 'base' } };
  const remoteData: BackupData = { ...completeData, settings: { locale: 'remote' } };
  const baseHash = await sha256BusinessData(localData);
  const originalApply = StorageService.applyRemoteBusinessData;
  StorageService.applyRemoteBusinessData = async () => undefined;
  const mock = installChromeStorageMock({
    resumeProfileLibrary: localData.resumeProfileLibrary,
    llmConfig: localData.llmConfig,
    settings: localData.settings,
    applicationRecords: localData.applicationRecords,
    webdavConfig,
    syncMetadata: { status: 'synced', hasTrustedBaseline: true, lastSyncedHash: baseHash, etag: '"base"', lastAction: 'no-change' },
  });
  const originalFetch = globalThis.fetch;
  let backupPutCalls = 0;
  globalThis.fetch = async (input, init) => {
    if (init?.method === 'PUT' && String(input).endsWith('job-application-helper.json')) backupPutCalls += 1;
    return new Response(
      serializeBackup(createBackupDocument(remoteData, '1.0.0')),
      { status: 200, headers: { ETag: '"remote"' } },
    );
  };
  try {
    assert.equal(await performSync('test-effective-hash-mismatch'), 'conflict');
    const metadata = mock.values.syncMetadata as Record<string, unknown>;
    assert.equal(metadata.status, 'conflict');
    assert.equal(metadata.hasTrustedBaseline, true);
    assert.equal(metadata.lastSyncedHash, baseHash);
    assert.equal(metadata.lastAction, 'no-change');
    assert.equal(backupPutCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    StorageService.applyRemoteBusinessData = originalApply;
    mock.restore();
  }
});

test('仅本地变化使用本次 GET 的 ETag 上传并记录成功动作', async () => {
  const baseData: BackupData = { ...completeData, settings: { locale: 'base' } };
  const localData: BackupData = { ...completeData, settings: { locale: 'local' } };
  const baseHash = await sha256BusinessData(baseData);
  const mock = installChromeStorageMock({
    resumeProfileLibrary: localData.resumeProfileLibrary,
    llmConfig: localData.llmConfig,
    settings: localData.settings,
    applicationRecords: localData.applicationRecords,
    webdavConfig,
    syncMetadata: { status: 'synced', hasTrustedBaseline: true, lastSyncedHash: baseHash, etag: '"stale"' },
  });
  const originalFetch = globalThis.fetch;
  let ifMatch: string | null = null;
  globalThis.fetch = async (input, init) => {
    if (init?.method === 'GET') return new Response(serializeBackup(createBackupDocument(baseData, '1.0.0')), { status: 200, headers: { ETag: '"fresh"' } });
    if (String(input).endsWith('job-application-helper.json')) ifMatch = new Headers(init?.headers).get('If-Match');
    return new Response(null, { status: 204, headers: { ETag: '"uploaded"' } });
  };
  try {
    assert.equal(await performSync('test-local-only'), 'synced');
    assert.equal(ifMatch, '"fresh"');
    const metadata = mock.values.syncMetadata as Record<string, unknown>;
    assert.equal(metadata.hasTrustedBaseline, true);
    assert.equal(metadata.lastAction, 'upload-local');
    assert.equal(metadata.lastSyncedHash, await sha256BusinessData(localData));
    assert.equal(metadata.etag, '"uploaded"');
  } finally {
    globalThis.fetch = originalFetch;
    mock.restore();
  }
});

test('冲突决策分支均不上传且保留原可信基线', async () => {
  const baseData: BackupData = { ...completeData, settings: { locale: 'base' } };
  const localData: BackupData = { ...completeData, settings: { locale: 'local' } };
  const remoteData: BackupData = { ...completeData, settings: { locale: 'remote' } };
  const baseHash = await sha256BusinessData(baseData);
  for (const scenario of [
    { name: '双方变化', trusted: true, hash: baseHash, remoteExists: true },
    { name: '无可信基线且内容不同', trusted: false, hash: undefined, remoteExists: true },
    { name: '可信基线且远端缺失', trusted: true, hash: baseHash, remoteExists: false },
  ]) {
    const mock = installChromeStorageMock({
      resumeProfileLibrary: localData.resumeProfileLibrary,
      llmConfig: localData.llmConfig,
      settings: localData.settings,
      applicationRecords: localData.applicationRecords,
      webdavConfig,
      syncMetadata: { status: 'synced', hasTrustedBaseline: scenario.trusted, lastSyncedHash: scenario.hash, etag: '"base"' },
    });
    const originalFetch = globalThis.fetch;
    let putCalls = 0;
    globalThis.fetch = async (_input, init) => {
      if (init?.method === 'PUT') putCalls += 1;
      return scenario.remoteExists
        ? new Response(serializeBackup(createBackupDocument(remoteData, '1.0.0')), { status: 200, headers: { ETag: '"remote"' } })
        : new Response('', { status: 404 });
    };
    try {
      assert.equal(await performSync(`test-${scenario.name}`), 'conflict');
      const metadata = mock.values.syncMetadata as Record<string, unknown>;
      assert.equal(metadata.status, 'conflict');
      assert.equal(metadata.hasTrustedBaseline, scenario.trusted);
      assert.equal(metadata.lastSyncedHash, scenario.hash);
      assert.equal(metadata.etag, '"base"');
      assert.equal(putCalls, 0);
    } finally {
      globalThis.fetch = originalFetch;
      mock.restore();
    }
  }
});

test('条件上传 ETag 失败时不覆盖远端且不更新可信基线', async () => {
  const baseData: BackupData = { ...completeData, settings: { locale: 'base' } };
  const localData: BackupData = { ...completeData, settings: { locale: 'local' } };
  const remoteData: BackupData = { ...completeData, settings: { locale: 'remote-after-race' } };
  const baseHash = await sha256BusinessData(baseData);
  const mock = installChromeStorageMock({
    resumeProfileLibrary: localData.resumeProfileLibrary,
    llmConfig: localData.llmConfig,
    settings: localData.settings,
    applicationRecords: localData.applicationRecords,
    webdavConfig,
    syncMetadata: { status: 'synced', hasTrustedBaseline: true, lastSyncedHash: baseHash, etag: '"base"', lastAction: 'no-change' },
  });
  const originalFetch = globalThis.fetch;
  let getCalls = 0;
  let backupPutCalls = 0;
  globalThis.fetch = async (input, init) => {
    if (init?.method === 'GET') {
      getCalls += 1;
      const data = getCalls === 1 ? baseData : remoteData;
      return new Response(serializeBackup(createBackupDocument(data, '1.0.0')), { status: 200, headers: { ETag: getCalls === 1 ? '"fresh"' : '"raced"' } });
    }
    if (String(input).endsWith('job-application-helper.json')) backupPutCalls += 1;
    return new Response('', { status: 412 });
  };
  try {
    assert.equal(await performSync('test-precondition'), 'conflict');
    const metadata = mock.values.syncMetadata as Record<string, unknown>;
    assert.equal(metadata.status, 'conflict');
    assert.equal(metadata.hasTrustedBaseline, true);
    assert.equal(metadata.lastSyncedHash, baseHash);
    assert.equal(metadata.etag, '"base"');
    assert.equal(metadata.lastAction, 'no-change');
    assert.equal(backupPutCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    mock.restore();
  }
});

test('应用远端失败时记录错误但不更新可信基线', async () => {
  const localData: BackupData = { ...completeData, settings: { locale: 'base' } };
  const remoteData: BackupData = { ...completeData, settings: { locale: 'remote' } };
  const baseHash = await sha256BusinessData(localData);
  const originalApply = StorageService.applyRemoteBusinessData;
  StorageService.applyRemoteBusinessData = async () => { throw new Error('apply failed'); };
  const mock = installChromeStorageMock({
    resumeProfileLibrary: localData.resumeProfileLibrary,
    llmConfig: localData.llmConfig,
    settings: localData.settings,
    applicationRecords: localData.applicationRecords,
    webdavConfig,
    syncMetadata: { status: 'synced', hasTrustedBaseline: true, lastSyncedHash: baseHash, etag: '"base"', lastAction: 'no-change' },
  });
  const originalFetch = globalThis.fetch;
  let putCalls = 0;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === 'PUT') putCalls += 1;
    return new Response(serializeBackup(createBackupDocument(remoteData, '1.0.0')), { status: 200, headers: { ETag: '"remote"' } });
  };
  try {
    assert.equal(await performSync('test-apply-failure'), 'error');
    const metadata = mock.values.syncMetadata as Record<string, unknown>;
    assert.equal(metadata.status, 'error');
    assert.equal(metadata.hasTrustedBaseline, true);
    assert.equal(metadata.lastSyncedHash, baseHash);
    assert.equal(metadata.etag, '"base"');
    assert.equal(metadata.lastAction, 'no-change');
    assert.equal(putCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    StorageService.applyRemoteBusinessData = originalApply;
    mock.restore();
  }
});

test('强制下载应用后的有效 hash 不匹配时同样冲突且不反向上传', async () => {
  const localData: BackupData = { ...completeData, settings: { locale: 'local' } };
  const remoteData: BackupData = { ...completeData, settings: { locale: 'remote' } };
  const baseHash = await sha256BusinessData(localData);
  const originalApply = StorageService.applyRemoteBusinessData;
  StorageService.applyRemoteBusinessData = async () => undefined;
  const mock = installChromeStorageMock({
    resumeProfileLibrary: localData.resumeProfileLibrary,
    llmConfig: localData.llmConfig,
    settings: localData.settings,
    applicationRecords: localData.applicationRecords,
    webdavConfig,
    syncMetadata: { status: 'conflict', hasTrustedBaseline: true, lastSyncedHash: baseHash, etag: '"base"', lastAction: 'no-change' },
  });
  const originalFetch = globalThis.fetch;
  let backupPutCalls = 0;
  globalThis.fetch = async (input, init) => {
    if (init?.method === 'PUT' && String(input).endsWith('job-application-helper.json')) backupPutCalls += 1;
    return new Response(serializeBackup(createBackupDocument(remoteData, '1.0.0')), { status: 200, headers: { ETag: '"remote"' } });
  };
  try {
    assert.equal(await resolveConflict('remote'), 'conflict');
    const metadata = mock.values.syncMetadata as Record<string, unknown>;
    assert.equal(metadata.status, 'conflict');
    assert.equal(metadata.hasTrustedBaseline, true);
    assert.equal(metadata.lastSyncedHash, baseHash);
    assert.equal(metadata.etag, '"base"');
    assert.equal(metadata.lastAction, 'no-change');
    assert.equal(backupPutCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    StorageService.applyRemoteBusinessData = originalApply;
    mock.restore();
  }
});


test('排队同步返回各自绑定的 action，不受后续任务改写 metadata 影响', async () => {
  const baseData: BackupData = { ...completeData, settings: { locale: 'base' } };
  const localData: BackupData = { ...completeData, settings: { locale: 'local' } };
  const baseHash = await sha256BusinessData(baseData);
  const mock = installChromeStorageMock({
    resumeProfileLibrary: localData.resumeProfileLibrary,
    llmConfig: localData.llmConfig,
    settings: localData.settings,
    applicationRecords: localData.applicationRecords,
    webdavConfig,
    syncMetadata: { status: 'synced', hasTrustedBaseline: true, lastSyncedHash: baseHash, etag: '"base"' },
  });
  const originalFetch = globalThis.fetch;
  let remoteData = baseData;
  let remoteEtag = '"base"';
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (init?.method === 'GET') {
      return new Response(serializeBackup(createBackupDocument(remoteData, '1.0.0')), {
        status: 200,
        headers: { ETag: remoteEtag },
      });
    }
    if (init?.method === 'PUT' && url.endsWith('job-application-helper.json')) {
      const parsed = parseAndValidateBackup(String(init.body));
      assert.equal(parsed.success, true);
      if (parsed.success) remoteData = parsed.document.data;
      remoteEtag = '"uploaded"';
      return new Response(null, { status: 204, headers: { ETag: remoteEtag } });
    }
    return new Response(null, { status: 204 });
  };
  try {
    const first = enqueueSyncAndWait('manual');
    const second = enqueueSyncAndWait('manual');
    assert.deepEqual(await first, { status: 'synced', action: 'upload-local' });
    assert.deepEqual(await second, { status: 'synced', action: 'no-change' });
    assert.equal((mock.values.syncMetadata as Record<string, unknown>).lastAction, 'no-change');
  } finally {
    globalThis.fetch = originalFetch;
    mock.restore();
  }
});

test('强制下载成功只读取远端且所有 PUT 总数为零', async () => {
  const localData: BackupData = { ...completeData, settings: { locale: 'local' } };
  const remoteData: BackupData = { ...completeData, settings: { locale: 'remote' } };
  const baseHash = await sha256BusinessData(localData);
  const mock = installChromeStorageMock({
    resumeProfileLibrary: localData.resumeProfileLibrary,
    llmConfig: localData.llmConfig,
    settings: localData.settings,
    applicationRecords: localData.applicationRecords,
    webdavConfig,
    syncMetadata: { status: 'conflict', hasTrustedBaseline: true, lastSyncedHash: baseHash, etag: '"base"', lastAction: 'no-change' },
  });
  const originalFetch = globalThis.fetch;
  let putCalls = 0;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === 'PUT') putCalls += 1;
    return new Response(serializeBackup(createBackupDocument(remoteData, '1.0.0')), {
      status: 200,
      headers: { ETag: '"remote"' },
    });
  };
  try {
    assert.equal(await resolveConflict('remote'), 'synced');
    assert.deepEqual((await StorageService.getBackupData()).settings, remoteData.settings);
    assert.equal(putCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    mock.restore();
  }
});

test('内容相同且 GET 无 ETag 时通过校验建立 hash fallback 基线', async () => {
  const hash = await sha256BusinessData(completeData);
  const previous = {
    status: 'synced',
    hasTrustedBaseline: false,
    lastSyncedHash: 'old-hash',
    lastSyncedAt: '2026-01-01T00:00:00.000Z',
    lastAction: 'upload-local',
  };
  const mock = installChromeStorageMock({
    resumeProfileLibrary: completeData.resumeProfileLibrary,
    llmConfig: completeData.llmConfig,
    settings: completeData.settings,
    applicationRecords: completeData.applicationRecords,
    webdavConfig,
    syncMetadata: previous,
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    serializeBackup(createBackupDocument(completeData, '1.0.0')),
    { status: 200 },
  );
  try {
    assert.equal(await performSync('test-equal-without-etag'), 'synced');
    const metadata = mock.values.syncMetadata as Record<string, unknown>;
    assert.equal(metadata.status, 'synced');
    assert.equal(metadata.hasTrustedBaseline, true);
    assert.equal(metadata.concurrencyMode, 'hash-fallback');
    assert.equal(metadata.lastSyncedHash, hash);
    assert.equal(metadata.lastAction, 'no-change');
    assert.equal(metadata.etag, undefined);
    assert.equal(hash, await sha256BusinessData(await StorageService.getBackupData()));
  } finally {
    globalThis.fetch = originalFetch;
    mock.restore();
  }
});

test('已有基线下载成功但 GET 无 ETag 时切换为 hash fallback', async () => {
  const localData: BackupData = { ...completeData, settings: { locale: 'base' } };
  const remoteData: BackupData = { ...completeData, settings: { locale: 'remote' } };
  const baseHash = await sha256BusinessData(localData);
  const previous = {
    status: 'synced',
    hasTrustedBaseline: true,
    lastSyncedHash: baseHash,
    lastSyncedAt: '2026-01-01T00:00:00.000Z',
    lastAction: 'no-change',
    etag: '"base"',
  };
  const mock = installChromeStorageMock({
    resumeProfileLibrary: localData.resumeProfileLibrary,
    llmConfig: localData.llmConfig,
    settings: localData.settings,
    applicationRecords: localData.applicationRecords,
    webdavConfig,
    syncMetadata: previous,
  });
  const originalFetch = globalThis.fetch;
  let putCalls = 0;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === 'PUT') putCalls += 1;
    return new Response(serializeBackup(createBackupDocument(remoteData, '1.0.0')), { status: 200 });
  };
  try {
    assert.equal(await performSync('test-download-without-etag'), 'synced');
    assert.deepEqual((await StorageService.getBackupData()).settings, remoteData.settings);
    const metadata = mock.values.syncMetadata as Record<string, unknown>;
    assert.equal(metadata.status, 'synced');
    assert.equal(metadata.hasTrustedBaseline, true);
    assert.equal(metadata.concurrencyMode, 'hash-fallback');
    assert.equal(metadata.lastSyncedHash, await sha256BusinessData(remoteData));
    assert.equal(metadata.lastAction, 'download-remote');
    assert.equal(metadata.etag, undefined);
    assert.equal(putCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    mock.restore();
  }
});

test('README 说明 WebDAV 多设备安全同步契约', async () => {
  const readme = await readFile(new URL('../../README.md', import.meta.url), 'utf8');
  for (const statement of [
    '未修改设备会自动下载云端更新',
    '双方都修改时不会自动覆盖',
    '首次连接且两边数据不同时需要手动选择',
    '上传前重新读取并确认远端 hash',
    '如果后续服务开始返回有效 ETag，会自动升级为 ETag 模式',
  ]) {
    assert.ok(readme.includes(statement), `README 缺少说明：${statement}`);
  }
});


test('同步元数据按并发模式校验可信基线', () => {
  assert.deepEqual(
    normalizeSyncMetadata({
      status: 'synced',
      hasTrustedBaseline: true,
      concurrencyMode: 'hash-fallback',
      lastSyncedHash: 'hash-v1',
    }),
    {
      status: 'synced',
      hasTrustedBaseline: true,
      concurrencyMode: 'hash-fallback',
      lastSyncedHash: 'hash-v1',
    },
  );
  assert.equal(normalizeSyncMetadata({
    status: 'synced',
    hasTrustedBaseline: true,
    concurrencyMode: 'hash-fallback',
  }).hasTrustedBaseline, false);
});

test('首次遇到无 ETag 且内容不同时仅展示摘要并等待确认', async () => {
  const localData: BackupData = { ...completeData, settings: { locale: 'local-first' } };
  const remoteData: BackupData = { ...completeData, settings: { locale: 'remote-first' } };
  const mock = installChromeStorageMock({
    resumeProfileLibrary: localData.resumeProfileLibrary,
    llmConfig: localData.llmConfig,
    settings: localData.settings,
    applicationRecords: localData.applicationRecords,
    webdavConfig,
    syncMetadata: { status: 'idle', hasTrustedBaseline: false },
  });
  const originalFetch = globalThis.fetch;
  let putCalls = 0;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === 'PUT') putCalls += 1;
    return new Response(serializeBackup(createBackupDocument(remoteData, '1.0.0')), { status: 200 });
  };
  try {
    assert.equal(await performSync('first-no-etag'), 'conflict');
    const metadata = mock.values.syncMetadata as Record<string, any>;
    assert.equal(metadata.hasTrustedBaseline, false);
    assert.equal(metadata.concurrencyMode, undefined);
    assert.equal(metadata.conflictReason, 'missing-etag-confirmation');
    assert.equal(metadata.conflict.local.settings?.locale, undefined);
    assert.ok(metadata.conflict.local && metadata.conflict.remote);
    assert.match(metadata.lastError, /未提供 ETag.*首次确认/);
    assert.equal(putCalls, 0);
    assert.deepEqual((await StorageService.getBackupData()).settings, localData.settings);
  } finally {
    globalThis.fetch = originalFetch;
    mock.restore();
  }
});

test('无 ETag 首次选择远端后建立 hash fallback 且后续不重复提示', async () => {
  const localData: BackupData = { ...completeData, settings: { locale: 'local-confirm' } };
  const remoteData: BackupData = { ...completeData, settings: { locale: 'remote-confirm' } };
  const remoteJson = serializeBackup(createBackupDocument(remoteData, '1.0.0'));
  const mock = installChromeStorageMock({
    resumeProfileLibrary: localData.resumeProfileLibrary,
    llmConfig: localData.llmConfig,
    settings: localData.settings,
    applicationRecords: localData.applicationRecords,
    webdavConfig,
    syncMetadata: {
      status: 'conflict',
      hasTrustedBaseline: false,
      conflictReason: 'missing-etag-confirmation',
      conflict: {
        local: createBackupSummary(createBackupDocument(localData, '1.0.0')),
        remote: createBackupSummary(createBackupDocument(remoteData, '1.0.0')),
      },
    },
  });
  const originalFetch = globalThis.fetch;
  let putCalls = 0;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === 'PUT') putCalls += 1;
    return new Response(remoteJson, { status: 200 });
  };
  try {
    assert.equal(await resolveConflict('remote'), 'synced');
    let metadata = mock.values.syncMetadata as Record<string, unknown>;
    assert.equal(metadata.concurrencyMode, 'hash-fallback');
    assert.equal(metadata.hasTrustedBaseline, true);
    assert.equal(metadata.lastSyncedHash, await sha256BusinessData(remoteData));
    assert.equal(await performSync('after-confirm'), 'synced');
    metadata = mock.values.syncMetadata as Record<string, unknown>;
    assert.equal(metadata.status, 'synced');
    assert.equal(metadata.concurrencyMode, 'hash-fallback');
    assert.equal(putCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    mock.restore();
  }
});

test('hash fallback 上传前复查、上传后回读验证并在 ETag 出现时升级', async () => {
  const baseData: BackupData = { ...completeData, settings: { locale: 'base-fallback' } };
  const localData: BackupData = { ...completeData, settings: { locale: 'local-fallback' } };
  const baseHash = await sha256BusinessData(baseData);
  let remoteData = baseData;
  const methods: string[] = [];
  const mock = installChromeStorageMock({
    resumeProfileLibrary: localData.resumeProfileLibrary,
    llmConfig: localData.llmConfig,
    settings: localData.settings,
    applicationRecords: localData.applicationRecords,
    webdavConfig,
    syncMetadata: {
      status: 'synced', hasTrustedBaseline: true, concurrencyMode: 'hash-fallback', lastSyncedHash: baseHash,
    },
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    methods.push(init?.method || 'GET');
    if (init?.method === 'PUT' && String(input).endsWith('job-application-helper.json')) {
      const parsed = parseAndValidateBackup(String(init.body));
      assert.ok(parsed.success);
      remoteData = parsed.document.data;
      return new Response(null, { status: 204, headers: { ETag: '"upgraded"' } });
    }
    if (init?.method === 'PUT') return new Response(null, { status: 204 });
    return new Response(serializeBackup(createBackupDocument(remoteData, '1.0.0')), {
      status: 200,
    });
  };
  try {
    assert.equal(await performSync('fallback-upload'), 'synced');
    assert.deepEqual(methods, ['GET', 'GET', 'PUT', 'GET', 'PUT']);
    const metadata = mock.values.syncMetadata as Record<string, unknown>;
    assert.equal(metadata.concurrencyMode, 'etag');
    assert.equal(metadata.etag, '"upgraded"');
    assert.equal(metadata.lastSyncedHash, await sha256BusinessData(localData));
  } finally {
    globalThis.fetch = originalFetch;
    mock.restore();
  }
});

test('hash fallback 双方变化时冲突且不 PUT', async () => {
  const baseData: BackupData = { ...completeData, settings: { locale: 'base-both' } };
  const localData: BackupData = { ...completeData, settings: { locale: 'local-both' } };
  const remoteData: BackupData = { ...completeData, settings: { locale: 'remote-both' } };
  const mock = installChromeStorageMock({
    resumeProfileLibrary: localData.resumeProfileLibrary,
    llmConfig: localData.llmConfig,
    settings: localData.settings,
    applicationRecords: localData.applicationRecords,
    webdavConfig,
    syncMetadata: {
      status: 'synced', hasTrustedBaseline: true, concurrencyMode: 'hash-fallback', lastSyncedHash: await sha256BusinessData(baseData),
    },
  });
  const originalFetch = globalThis.fetch;
  let puts = 0;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === 'PUT') puts += 1;
    return new Response(serializeBackup(createBackupDocument(remoteData, '1.0.0')), { status: 200 });
  };
  try {
    assert.equal(await performSync('fallback-both'), 'conflict');
    assert.equal(puts, 0);
  } finally {
    globalThis.fetch = originalFetch;
    mock.restore();
  }
});


test('hash fallback 上传前复查发现远端变化时不 PUT', async () => {
  const baseData: BackupData = { ...completeData, settings: { locale: 'fallback-base' } };
  const localData: BackupData = { ...completeData, settings: { locale: 'fallback-local' } };
  const racedData: BackupData = { ...completeData, settings: { locale: 'fallback-raced' } };
  const baseHash = await sha256BusinessData(baseData);
  const mock = installChromeStorageMock({
    resumeProfileLibrary: localData.resumeProfileLibrary,
    llmConfig: localData.llmConfig,
    settings: localData.settings,
    applicationRecords: localData.applicationRecords,
    webdavConfig,
    syncMetadata: { status: 'synced', hasTrustedBaseline: true, concurrencyMode: 'hash-fallback', lastSyncedHash: baseHash },
  });
  const originalFetch = globalThis.fetch;
  let gets = 0;
  let puts = 0;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === 'PUT') puts += 1;
    gets += 1;
    const data = gets === 1 ? baseData : racedData;
    return new Response(serializeBackup(createBackupDocument(data, '1.0.0')), { status: 200 });
  };
  try {
    assert.equal(await performSync('fallback-precheck-race'), 'conflict');
    assert.equal(puts, 0);
    assert.equal((mock.values.syncMetadata as Record<string, unknown>).lastSyncedHash, baseHash);
  } finally {
    globalThis.fetch = originalFetch;
    mock.restore();
  }
});

test('hash fallback 上传后回读不一致时不更新可信基线', async () => {
  const baseData: BackupData = { ...completeData, settings: { locale: 'verify-base' } };
  const localData: BackupData = { ...completeData, settings: { locale: 'verify-local' } };
  const baseHash = await sha256BusinessData(baseData);
  const mock = installChromeStorageMock({
    resumeProfileLibrary: localData.resumeProfileLibrary,
    llmConfig: localData.llmConfig,
    settings: localData.settings,
    applicationRecords: localData.applicationRecords,
    webdavConfig,
    syncMetadata: { status: 'synced', hasTrustedBaseline: true, concurrencyMode: 'hash-fallback', lastSyncedHash: baseHash },
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => init?.method === 'PUT'
    ? new Response(null, { status: 204 })
    : new Response(serializeBackup(createBackupDocument(baseData, '1.0.0')), { status: 200 });
  try {
    assert.equal(await performSync('fallback-post-verify'), 'error');
    const metadata = mock.values.syncMetadata as Record<string, unknown>;
    assert.equal(metadata.lastSyncedHash, baseHash);
    assert.equal(metadata.concurrencyMode, 'hash-fallback');
    assert.match(String(metadata.lastError), /回读内容与本地不一致/);
  } finally {
    globalThis.fetch = originalFetch;
    mock.restore();
  }
});

test('无 ETag 双设备中 B 上传 V2 后未修改的 A 自动下载 V2', async () => {
  const v1: BackupData = { ...completeData, settings: { locale: 'fallback-v1' } };
  const v2: BackupData = { ...completeData, settings: { locale: 'fallback-v2' } };
  const v1Hash = await sha256BusinessData(v1);
  let remoteData = v1;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (init?.method === 'PUT' && String(input).endsWith('job-application-helper.json')) {
      const parsed = parseAndValidateBackup(String(init.body));
      assert.ok(parsed.success);
      remoteData = parsed.document.data;
      return new Response(null, { status: 204 });
    }
    if (init?.method === 'PUT') return new Response(null, { status: 204 });
    return new Response(serializeBackup(createBackupDocument(remoteData, '1.0.0')), { status: 200 });
  };
  const b = installChromeStorageMock({
    resumeProfileLibrary: v2.resumeProfileLibrary, llmConfig: v2.llmConfig, settings: v2.settings,
    applicationRecords: v2.applicationRecords, webdavConfig,
    syncMetadata: { status: 'synced', hasTrustedBaseline: true, concurrencyMode: 'hash-fallback', lastSyncedHash: v1Hash },
  });
  try {
    assert.equal(await performSync('fallback-device-b'), 'synced');
  } finally {
    b.restore();
  }
  const a = installChromeStorageMock({
    resumeProfileLibrary: v1.resumeProfileLibrary, llmConfig: v1.llmConfig, settings: v1.settings,
    applicationRecords: v1.applicationRecords, webdavConfig,
    syncMetadata: { status: 'synced', hasTrustedBaseline: true, concurrencyMode: 'hash-fallback', lastSyncedHash: v1Hash },
  });
  try {
    assert.equal(await performSync('fallback-device-a'), 'synced');
    assert.deepEqual((await StorageService.getBackupData()).settings, v2.settings);
    const metadata = a.values.syncMetadata as Record<string, unknown>;
    assert.equal(metadata.lastAction, 'download-remote');
    assert.equal(metadata.concurrencyMode, 'hash-fallback');
  } finally {
    globalThis.fetch = originalFetch;
    a.restore();
  }
});


test('首次创建无 ETag 时回读 hash 一致后建立 hash fallback 且不重复上传备份', async () => {
  const localData: BackupData = { ...completeData, settings: { locale: 'create-fallback' } };
  const localHash = await sha256BusinessData(localData);
  let remoteJson = '';
  let backupPutCalls = 0;
  let getCalls = 0;
  const mock = installChromeStorageMock({
    resumeProfileLibrary: localData.resumeProfileLibrary,
    llmConfig: localData.llmConfig,
    settings: localData.settings,
    applicationRecords: localData.applicationRecords,
    webdavConfig,
    syncMetadata: { status: 'idle', hasTrustedBaseline: false },
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (init?.method === 'GET') {
      getCalls += 1;
      return getCalls === 1
        ? new Response('', { status: 404 })
        : new Response(remoteJson, { status: 200 });
    }
    if (init?.method === 'PUT' && url.endsWith('job-application-helper.json')) {
      backupPutCalls += 1;
      remoteJson = String(init.body);
    }
    return new Response(null, { status: 204 });
  };
  try {
    assert.equal(await performSync('create-without-etag'), 'synced');
    const metadata = mock.values.syncMetadata as Record<string, unknown>;
    assert.equal(metadata.status, 'synced');
    assert.equal(metadata.hasTrustedBaseline, true);
    assert.equal(metadata.concurrencyMode, 'hash-fallback');
    assert.equal(metadata.lastSyncedHash, localHash);
    assert.equal(metadata.lastAction, 'create-remote');
    assert.equal(metadata.conflict, undefined);
    assert.equal(metadata.conflictReason, undefined);
    assert.equal(backupPutCalls, 1);
    assert.equal(getCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    mock.restore();
  }
});

test('首次创建无 ETag 且回读 hash 不一致时不建立基线也不重复 PUT', async () => {
  const localData: BackupData = { ...completeData, settings: { locale: 'create-local' } };
  const differentRemote: BackupData = { ...completeData, settings: { locale: 'create-raced' } };
  let backupPutCalls = 0;
  let getCalls = 0;
  const mock = installChromeStorageMock({
    resumeProfileLibrary: localData.resumeProfileLibrary,
    llmConfig: localData.llmConfig,
    settings: localData.settings,
    applicationRecords: localData.applicationRecords,
    webdavConfig,
    syncMetadata: { status: 'idle', hasTrustedBaseline: false },
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (init?.method === 'GET') {
      getCalls += 1;
      return getCalls === 1
        ? new Response('', { status: 404 })
        : new Response(serializeBackup(createBackupDocument(differentRemote, '1.0.0')), { status: 200 });
    }
    if (init?.method === 'PUT' && String(input).endsWith('job-application-helper.json')) backupPutCalls += 1;
    return new Response(null, { status: 204 });
  };
  try {
    assert.equal(await performSync('create-verify-mismatch'), 'error');
    const metadata = mock.values.syncMetadata as Record<string, unknown>;
    assert.equal(metadata.status, 'error');
    assert.equal(metadata.hasTrustedBaseline, false);
    assert.equal(metadata.lastSyncedHash, undefined);
    assert.equal(metadata.lastAction, undefined);
    assert.match(String(metadata.lastError), /回读内容与本地不一致/);
    assert.equal(backupPutCalls, 1);
    assert.equal(getCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    mock.restore();
  }
});
