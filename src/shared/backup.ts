import type {
  BackupData,
  BackupDocument,
  BackupDocumentV1,
  BackupErrorCode,
  BackupParseResult,
  BackupSummary,
  UserProfile,
  WebDAVConfig,
} from './types';
import type { LLMConfig } from '../services/llm/types';
import { normalizeUserProfile } from './storage.ts';

export const BACKUP_SCHEMA_VERSION = 1;
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function failure(code: BackupErrorCode, message: string): BackupParseResult {
  return { success: false, error: { code, message } };
}

function hasOnlyStringFields(value: PlainObject, fields: string[]): boolean {
  return fields.every(field => value[field] === undefined || typeof value[field] === 'string');
}

function validateObjectArray(
  value: unknown,
  fields: string[],
): value is PlainObject[] {
  return Array.isArray(value) && value.every(item =>
    isPlainObject(item) && hasOnlyStringFields(item, fields)
  );
}

function validateOptionalObjectArray(value: unknown, fields: string[]): boolean {
  return value === undefined || validateObjectArray(value, fields);
}

function validateUserProfile(value: unknown): value is UserProfile {
  if (!isPlainObject(value) || !isPlainObject(value.personal)) return false;
  if (!hasOnlyStringFields(value.personal, [
    'name', 'gender', 'birthDate', 'phone', 'email', 'wechat', 'idCard',
    'politicalStatus', 'ethnicity', 'hometown', 'currentAddress', 'selfEvaluation',
  ])) return false;

  if (!validateOptionalObjectArray(value.education, [
    'id', 'school', 'college', 'educationType', 'major', 'degree',
    'startDate', 'endDate', 'gpa', 'ranking',
  ])) return false;
  if (!validateOptionalObjectArray(value.experience, [
    'id', 'company', 'position', 'startDate', 'endDate', 'description', 'achievements',
  ])) return false;
  if (!validateOptionalObjectArray(value.projects, [
    'id', 'name', 'role', 'startDate', 'endDate', 'description', 'achievements', 'technologies',
  ])) return false;
  if (!validateOptionalObjectArray(value.customInformation, ['id', 'name', 'content'])) return false;
  if (!validateOptionalObjectArray(value.certifications, ['id', 'name', 'issuer', 'date', 'credentialId'])) {
    return false;
  }
  if (
    value.skills !== undefined &&
    (!Array.isArray(value.skills) || !value.skills.every(item => typeof item === 'string'))
  ) return false;

  if (value.resume !== undefined) {
    if (!isPlainObject(value.resume)) return false;
    if (!hasOnlyStringFields(value.resume, [
      'fileName', 'fileData', 'fileType', 'parsedText', 'uploadDate',
    ])) return false;
    for (const field of ['fileName', 'fileData', 'fileType', 'uploadDate']) {
      if (typeof value.resume[field] !== 'string') return false;
    }
  }
  return true;
}

function validateWebDAVConfig(value: unknown): value is WebDAVConfig {
  if (!isPlainObject(value)) return false;
  if (typeof value.enabled !== 'boolean') return false;
  if (!hasOnlyStringFields(value, ['serverUrl', 'username', 'password'])) return false;
  return ['serverUrl', 'username', 'password'].every(field => typeof value[field] === 'string');
}

function validateLLMConfig(value: unknown): value is LLMConfig {
  if (!isPlainObject(value)) return false;
  if (!hasOnlyStringFields(value, ['provider', 'apiKey', 'baseUrl', 'model'])) return false;
  if (!['provider', 'apiKey', 'baseUrl', 'model'].every(field => typeof value[field] === 'string')) {
    return false;
  }
  if (value.temperature !== undefined && typeof value.temperature !== 'number') return false;
  if (value.maxTokens !== undefined && typeof value.maxTokens !== 'number') return false;
  if (value.visionEnabled !== undefined && typeof value.visionEnabled !== 'boolean') return false;
  return true;
}

function validateV1(value: PlainObject): BackupParseResult {
  if (typeof value.exportedAt !== 'string' || Number.isNaN(Date.parse(value.exportedAt))) {
    return failure('INVALID_EXPORTED_AT', '导出时间无效');
  }
  if (
    !isPlainObject(value.source) ||
    typeof value.source.extensionVersion !== 'string'
  ) {
    return failure('INVALID_SOURCE', '备份来源信息无效');
  }
  if (!isPlainObject(value.data)) return failure('INVALID_DATA', '备份数据区域无效');

  const { userProfile, llmConfig, settings } = value.data;
  if (userProfile !== null && !validateUserProfile(userProfile)) {
    return failure('INVALID_USER_PROFILE', '个人资料结构无效');
  }
  if (llmConfig !== null && !validateLLMConfig(llmConfig)) {
    return failure('INVALID_LLM_CONFIG', 'AI 配置结构无效');
  }
  if (settings !== null && !isPlainObject(settings)) {
    return failure('INVALID_SETTINGS', '设置数据结构无效');
  }

  // webdavConfig 仅出现在本地导出文件中；WebDAV 同步的文档不含此字段。
  if (
    value.webdavConfig !== undefined &&
    value.webdavConfig !== null &&
    !validateWebDAVConfig(value.webdavConfig)
  ) {
    return failure('INVALID_WEBDAV_CONFIG', 'WebDAV 同步设置结构无效');
  }

  const document: BackupDocumentV1 = {
    schemaVersion: 1,
    exportedAt: value.exportedAt,
    source: { extensionVersion: value.source.extensionVersion },
    data: {
      userProfile: userProfile ? normalizeUserProfile(userProfile) : null,
      llmConfig,
      settings,
    },
  };
  if (value.webdavConfig !== undefined) {
    document.webdavConfig = (value.webdavConfig as WebDAVConfig | null) ?? null;
  }
  return { success: true, document };
}

export function createBackupDocument(
  data: BackupData,
  extensionVersion: string,
  exportedAt = new Date().toISOString(),
  webdavConfig?: WebDAVConfig | null,
): BackupDocumentV1 {
  const document: BackupDocumentV1 = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt,
    source: { extensionVersion },
    data: {
      userProfile: data.userProfile ? normalizeUserProfile(data.userProfile) : null,
      llmConfig: data.llmConfig,
      settings: data.settings,
    },
  };
  // 只有本地导出会显式传入 webdavConfig；同步上传不带凭据，避免密码落到远端。
  if (webdavConfig !== undefined) document.webdavConfig = webdavConfig;
  return document;
}

export function serializeBackup(document: BackupDocument): string {
  return JSON.stringify(document, null, 2);
}

export function migrateBackupDocument(value: PlainObject): BackupParseResult {
  if (value.schemaVersion === 1) return validateV1(value);
  return failure('UNSUPPORTED_OLD_VERSION', '此旧版备份没有可用的迁移器');
}

export function normalizeBackupDocument(document: BackupDocument): BackupDocument {
  return {
    ...document,
    data: {
      ...document.data,
      userProfile: document.data.userProfile
        ? normalizeUserProfile(document.data.userProfile)
        : null,
    },
  };
}

export function parseAndValidateBackup(rawJson: string): BackupParseResult {
  if (new TextEncoder().encode(rawJson).byteLength > MAX_BACKUP_BYTES) {
    return failure('FILE_TOO_LARGE', '备份文件超过 20 MiB 上限');
  }

  let value: unknown;
  try {
    value = JSON.parse(rawJson);
  } catch {
    return failure('INVALID_JSON', '文件不是有效的 JSON');
  }
  if (!isPlainObject(value)) return failure('INVALID_ROOT', '备份根节点必须是对象');
  if (!Object.hasOwn(value, 'schemaVersion')) {
    return failure('MISSING_SCHEMA_VERSION', '备份缺少 schemaVersion');
  }
  if (!Number.isInteger(value.schemaVersion)) {
    return failure('INVALID_SCHEMA_VERSION', 'schemaVersion 必须是整数');
  }
  if ((value.schemaVersion as number) > BACKUP_SCHEMA_VERSION) {
    return failure('UNSUPPORTED_FUTURE_VERSION', '备份版本较新，请先升级扩展');
  }
  return migrateBackupDocument(value);
}

export function createBackupSummary(document: BackupDocument): BackupSummary {
  return {
    schemaVersion: document.schemaVersion,
    exportedAt: document.exportedAt,
    extensionVersion: document.source.extensionVersion,
    hasUserProfile: document.data.userProfile !== null,
    hasResumeFile: Boolean(document.data.userProfile?.resume?.fileData),
    hasLLMConfig: document.data.llmConfig !== null,
    hasApiKey: Boolean(document.data.llmConfig?.apiKey),
    hasWebDAVConfig: Boolean(document.webdavConfig?.serverUrl),
  };
}
