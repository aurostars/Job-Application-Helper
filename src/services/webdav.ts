import type { WebDAVConfig } from '../shared/types';

const REQUEST_TIMEOUT_MS = 20_000;
export const WEBDAV_BACKUP_DIRECTORY = 'job-application-helper/';
export const WEBDAV_BACKUP_FILENAME = 'job-application-helper.json';

export type WebDAVErrorCode =
  | 'INVALID_URL'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'PRECONDITION_FAILED'
  | 'PAYLOAD_TOO_LARGE'
  | 'SERVER_ERROR'
  | 'HTTP_ERROR'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'MISSING_ETAG';

export class WebDAVError extends Error {
  readonly code: WebDAVErrorCode;
  readonly status?: number;

  constructor(
    code: WebDAVErrorCode,
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = 'WebDAVError';
    this.code = code;
    this.status = status;
  }
}

export interface RemoteDocumentResult {
  exists: boolean;
  json?: string;
  etag?: string;
}

export function normalizeWebDAVServerUrl(rawUrl: string): string {
  const url = new URL(rawUrl.trim());
  const legacyFilePattern = /\.json$/i;
  if (legacyFilePattern.test(url.pathname)) {
    url.pathname = url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1);
  } else if (!url.pathname.endsWith('/')) {
    url.pathname += '/';
  }
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function buildWebDAVFileUrl(serverUrl: string): string {
  return new URL(
    `${WEBDAV_BACKUP_DIRECTORY}${WEBDAV_BACKUP_FILENAME}`,
    normalizeWebDAVServerUrl(serverUrl),
  ).toString();
}

export function buildWebDAVDirectoryUrl(serverUrl: string): string {
  return new URL(WEBDAV_BACKUP_DIRECTORY, normalizeWebDAVServerUrl(serverUrl)).toString();
}

export function validateWebDAVUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl.trim());
    if (url.protocol !== 'https:') return '仅支持 HTTPS WebDAV 服务器地址';
    if (!url.hostname) return '请输入有效的 WebDAV 服务器地址';
    return null;
  } catch {
    return '请输入有效的 WebDAV 服务器地址';
  }
}

function authHeader(config: WebDAVConfig): string {
  const bytes = new TextEncoder().encode(`${config.username}:${config.password}`);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

function mapHttpError(
  status: number,
  operation: 'read-file' | 'write-file' | 'check-directory',
): WebDAVError {
  if (status === 401) return new WebDAVError('UNAUTHORIZED', '用户名或密码错误', status);
  if (status === 403) return new WebDAVError('FORBIDDEN', 'WebDAV 服务拒绝访问，请检查权限', status);
  if (status === 404 && operation !== 'read-file') {
    return new WebDAVError(
      'HTTP_ERROR',
      operation === 'write-file'
        ? '无法在该 WebDAV 地址创建备份文件（404）。请确认填写的是可写目录，而不是网盘首页、分享链接或只读地址'
        : 'WebDAV 服务器目录不存在，请填写网盘提供的完整 WebDAV 地址，并确认该目录已经创建',
      status,
    );
  }
  if (status === 405 && operation === 'check-directory') {
    return new WebDAVError(
      'HTTP_ERROR',
      '该地址不支持 WebDAV，请填写网盘设置中提供的 WebDAV 服务器地址',
      status,
    );
  }
  if (status === 409 && operation === 'write-file') {
    return new WebDAVError(
      'HTTP_ERROR',
      'WebDAV 服务器目录不存在，插件不会自动创建目录，请先在网盘中创建或改用已有目录',
      status,
    );
  }
  if (status === 409 && operation === 'check-directory') {
    return new WebDAVError(
      'HTTP_ERROR',
      '当前地址不是可用的 WebDAV 目录（409）。请复制网盘设置中提供的 WebDAV 地址；普通网盘首页、分享链接或缺少上级路径的地址无法自动创建目录',
      status,
    );
  }
  if (status === 412) {
    return new WebDAVError('PRECONDITION_FAILED', '远端文件已变化，已停止覆盖并进入冲突状态', status);
  }
  if (status === 413) return new WebDAVError('PAYLOAD_TOO_LARGE', '远端服务拒绝了过大的备份文件', status);
  if (status >= 500) return new WebDAVError('SERVER_ERROR', `WebDAV 服务暂时不可用（${status}）`, status);
  return new WebDAVError('HTTP_ERROR', `WebDAV 请求失败（${status}）`, status);
}

async function request(
  config: WebDAVConfig,
  init: RequestInit,
  targetUrl = buildWebDAVFileUrl(config.serverUrl),
): Promise<Response> {
  const urlError = validateWebDAVUrl(config.serverUrl);
  if (urlError) throw new WebDAVError('INVALID_URL', urlError);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(targetUrl, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: authHeader(config),
        ...init.headers,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new WebDAVError('TIMEOUT', 'WebDAV 请求超时，请检查网络后重试');
    }
    throw new WebDAVError('NETWORK_ERROR', '无法连接 WebDAV 服务，请检查地址和网络');
  } finally {
    clearTimeout(timer);
  }
}

async function ensureBackupDirectory(config: WebDAVConfig): Promise<void> {
  const response = await request(
    config,
    { method: 'MKCOL' },
    buildWebDAVDirectoryUrl(config.serverUrl),
  );
  if (response.ok || response.status === 405) return;
  if (response.status === 403) {
    throw new WebDAVError(
      'FORBIDDEN',
      'WebDAV 服务不允许创建备份目录，请检查账号写入权限',
      response.status,
    );
  }
  if (response.status === 409 || response.status === 404) {
    throw new WebDAVError(
      'HTTP_ERROR',
      '无法创建备份目录，请确认填写的是可写的 WebDAV 根地址，而不是网盘首页、分享链接或只读地址',
      response.status,
    );
  }
  throw mapHttpError(response.status, 'check-directory');
}

export async function getRemoteDocument(config: WebDAVConfig): Promise<RemoteDocumentResult> {
  const response = await request(config, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (response.status === 404) return { exists: false };
  if (!response.ok) throw mapHttpError(response.status, 'read-file');
  return {
    exists: true,
    json: await response.text(),
    etag: response.headers.get('ETag') || undefined,
  };
}

export async function putRemoteDocument(
  config: WebDAVConfig,
  json: string,
  condition: { type: 'create' } | { type: 'update'; etag: string },
): Promise<{ etag?: string }> {
  let response = await request(config, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(condition.type === 'create'
        ? { 'If-None-Match': '*' }
        : { 'If-Match': condition.etag }),
    },
    body: json,
  });
  if (
    condition.type === 'create'
    && (response.status === 404 || response.status === 409)
  ) {
    await ensureBackupDirectory(config);
    response = await request(config, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'If-None-Match': '*',
      },
      body: json,
    });
  }
  if (!response.ok) throw mapHttpError(response.status, 'write-file');
  return { etag: response.headers.get('ETag') || undefined };
}

export async function testConnection(config: WebDAVConfig): Promise<{ exists: boolean; etag?: string }> {
  await ensureBackupDirectory(config);
  const remote = await getRemoteDocument(config);
  return { exists: remote.exists, etag: remote.etag };
}
