import type {
  BackupData,
  BackupDocument,
  SyncAction,
  SyncResultStatus,
} from './types';
import { createBackupDocument, createBackupSummary, parseAndValidateBackup, serializeBackup } from './backup.ts';
import { StorageService } from './storage.ts';
import {
  getRemoteDocument,
  putRemoteDocument,
  WebDAVError,
} from '../services/webdav.ts';

let syncQueue: Promise<unknown> = Promise.resolve();

function sortedValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortedValue(entry)]),
    );
  }
  return value;
}

export function stableStringifyBusinessData(data: BackupData): string {
  return JSON.stringify(sortedValue(data));
}

export async function sha256BusinessData(data: BackupData): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringifyBusinessData(data));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function decideSyncAction(
  baseHash: string | undefined,
  localHash: string,
  remoteHash: string | undefined,
  remoteExists: boolean,
): SyncAction {
  if (!remoteExists) return baseHash ? 'conflict' : 'create-remote';
  if (localHash === remoteHash) return 'no-change';
  if (!baseHash) return 'conflict';
  if (remoteHash === baseHash && localHash !== baseHash) return 'upload-local';
  if (localHash === baseHash && remoteHash !== baseHash) return 'download-remote';
  return 'conflict';
}

function extensionVersion(): string {
  return chrome.runtime.getManifest().version;
}

async function setError(error: unknown, fallback: string): Promise<'error' | 'conflict'> {
  const current = await StorageService.getSyncMetadata();
  if (error instanceof WebDAVError && error.code === 'PRECONDITION_FAILED') {
    let conflict = current.conflict;
    try {
      const config = await StorageService.getWebDAVConfig();
      if (config) {
        const [localData, remote] = await Promise.all([
          StorageService.getBackupData(),
          getRemoteDocument(config),
        ]);
        const parsed = remote.exists ? parseAndValidateBackup(remote.json || '') : null;
        if (parsed?.success) {
          conflict = {
            local: createBackupSummary(createBackupDocument(localData, extensionVersion())),
            remote: createBackupSummary(parsed.document),
          };
        }
      }
    } catch {
      // 冲突状态本身优先保留；摘要可在下一次手动同步时重新生成。
    }
    await StorageService.saveSyncMetadata({
      ...current,
      status: 'conflict',
      lastError: error.message,
      conflict,
    });
    return 'conflict';
  }
  await StorageService.saveSyncMetadata({
    ...current,
    status: 'error',
    lastError: error instanceof Error ? error.message : fallback,
  });
  return 'error';
}

async function completeSync(hash: string, etag?: string): Promise<void> {
  await StorageService.saveSyncMetadata({
    status: 'synced',
    etag,
    lastSyncedHash: hash,
    lastSyncedAt: new Date().toISOString(),
  });
}

async function upload(
  data: BackupData,
  localHash: string,
  etag: string | undefined,
  create: boolean,
): Promise<void> {
  if (!create && !etag) {
    throw new WebDAVError(
      'MISSING_ETAG',
      '远端服务未提供 ETag，不支持安全覆盖；请改用支持 ETag 的 WebDAV 服务',
    );
  }
  const config = await StorageService.getWebDAVConfig();
  if (!config) throw new Error('WebDAV 配置不存在');
  const document = createBackupDocument(data, extensionVersion());
  const result = await putRemoteDocument(
    config,
    serializeBackup(document),
    create ? { type: 'create' } : { type: 'update', etag: etag as string },
  );
  let nextEtag = result.etag;
  if (!nextEtag) {
    const refreshed = await getRemoteDocument(config);
    nextEtag = refreshed.etag;
  }
  if (!nextEtag) {
    throw new WebDAVError(
      'MISSING_ETAG',
      '远端服务未提供 ETag，数据已上传但无法继续安全同步；请改用支持 ETag 的 WebDAV 服务',
    );
  }
  await completeSync(localHash, nextEtag);
}

export async function performSync(_reason: string): Promise<SyncResultStatus> {
  const config = await StorageService.getWebDAVConfig();
  if (!config?.enabled) return 'disabled';

  const previous = await StorageService.getSyncMetadata();
  await StorageService.saveSyncMetadata({ ...previous, status: 'syncing', lastError: undefined });

  try {
    const localData = await StorageService.getBackupData();
    const localHash = await sha256BusinessData(localData);
    const localDocument = createBackupDocument(localData, extensionVersion());
    const remote = await getRemoteDocument(config);

    let remoteDocument: BackupDocument | undefined;
    let remoteHash: string | undefined;
    if (remote.exists) {
      const parsed = parseAndValidateBackup(remote.json || '');
      if (!parsed.success) throw new Error(`远端备份无效：${parsed.error.message}`);
      remoteDocument = parsed.document;
      remoteHash = await sha256BusinessData(remoteDocument.data);
    }

    const action = decideSyncAction(
      previous.lastSyncedHash,
      localHash,
      remoteHash,
      remote.exists,
    );
    if (action === 'create-remote') {
      await upload(localData, localHash, undefined, true);
    } else if (action === 'no-change') {
      await completeSync(localHash, remote.etag);
    } else if (action === 'upload-local') {
      await upload(localData, localHash, remote.etag, false);
    } else if (action === 'download-remote' && remoteDocument) {
      await StorageService.applyRemoteBusinessData(remoteDocument.data);
      await completeSync(remoteHash as string, remote.etag);
    } else if (remoteDocument) {
      await StorageService.saveSyncMetadata({
        ...previous,
        status: 'conflict',
        etag: remote.etag,
        lastError: '本地和远端数据均有变化，请选择保留版本',
        conflict: {
          local: createBackupSummary(localDocument),
          remote: createBackupSummary(remoteDocument),
        },
      });
      return 'conflict';
    } else {
      await StorageService.saveSyncMetadata({
        ...previous,
        status: 'conflict',
        etag: undefined,
        lastError: '远端文件已被删除，已停止自动重建；请选择上传本地数据或暂不处理',
        conflict: undefined,
      });
      return 'conflict';
    }
    return 'synced';
  } catch (error) {
    return await setError(error, '同步失败');
  }
}

export function enqueueSync(reason: string): void {
  syncQueue = syncQueue.then(() => performSync(reason), () => performSync(reason));
}

export function enqueueSyncAndWait(reason: string): Promise<SyncResultStatus> {
  const task = syncQueue.then(() => performSync(reason), () => performSync(reason));
  syncQueue = task;
  return task;
}

async function performForceUploadLocal(): Promise<SyncResultStatus> {
  const config = await StorageService.getWebDAVConfig();
  if (!config?.enabled) return 'disabled';
  await StorageService.saveSyncMetadata({
    ...(await StorageService.getSyncMetadata()),
    status: 'syncing',
    lastError: undefined,
  });
  try {
    const [localData, remote] = await Promise.all([
      StorageService.getBackupData(),
      getRemoteDocument(config),
    ]);
    const localHash = await sha256BusinessData(localData);
    await upload(localData, localHash, remote.etag, !remote.exists);
    return 'synced';
  } catch (error) {
    return await setError(error, '上传失败');
  }
}

async function performForceDownloadRemote(): Promise<SyncResultStatus> {
  const config = await StorageService.getWebDAVConfig();
  if (!config?.enabled) return 'disabled';
  await StorageService.saveSyncMetadata({
    ...(await StorageService.getSyncMetadata()),
    status: 'syncing',
    lastError: undefined,
  });
  try {
    const remote = await getRemoteDocument(config);
    if (!remote.exists) throw new Error('远端文件不存在，无法下载');
    const parsed = parseAndValidateBackup(remote.json || '');
    if (!parsed.success) throw new Error(`远端备份无效：${parsed.error.message}`);
    await StorageService.applyRemoteBusinessData(parsed.document.data);
    await completeSync(await sha256BusinessData(parsed.document.data), remote.etag);
    return 'synced';
  } catch (error) {
    return await setError(error, '下载失败');
  }
}

export async function resolveConflict(choice: 'local' | 'remote'): Promise<SyncResultStatus> {
  return choice === 'local' ? forceUploadLocal() : forceDownloadRemote();
}

export function forceUploadLocal(): Promise<SyncResultStatus> {
  const task = syncQueue.then(performForceUploadLocal, performForceUploadLocal);
  syncQueue = task;
  return task;
}

export function forceDownloadRemote(): Promise<SyncResultStatus> {
  const task = syncQueue.then(performForceDownloadRemote, performForceDownloadRemote);
  syncQueue = task;
  return task;
}
