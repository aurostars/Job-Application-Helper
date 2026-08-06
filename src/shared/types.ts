// 用户资料数据模型
export interface UserProfile {
  personal: PersonalInfo;
  education: EducationInfo[];
  experience: ExperienceInfo[];
  projects: ProjectInfo[];
  customInformation: CustomInformation[];
  skills: string[];
  certifications: CertificationInfo[];
  resume?: ResumeInfo;
}

export interface CustomInformation {
  id: string;
  name: string;
  content: string;
}

export interface PersonalInfo {
  name: string;
  gender: string;
  birthDate: string;
  phone: string;
  email: string;
  wechat?: string;
  idCard?: string;
  politicalStatus?: string;
  ethnicity?: string;
  hometown?: string;
  currentAddress?: string;
  selfEvaluation?: string;
}

export interface EducationInfo {
  id: string;
  school: string;
  college?: string;
  educationType?: string;
  major: string;
  degree: string;
  startDate: string;
  endDate: string;
  gpa?: string;
  ranking?: string;
}

export interface ExperienceInfo {
  id: string;
  company: string;
  position: string;
  startDate: string;
  endDate: string;
  description: string;
  achievements?: string;
}

export interface ProjectInfo {
  id: string;
  name: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
  achievements: string;
  technologies?: string;
}

export interface CertificationInfo {
  id: string;
  name: string;
  issuer: string;
  date: string;
  credentialId?: string;
}

export interface ResumeInfo {
  fileName: string;
  fileData: string; // Base64编码
  fileType: string;
  parsedText?: string;
  uploadDate: string;
}

import type { LLMConfig } from '../services/llm/types';

export type SettingsData = Record<string, unknown>;

export type ApplicationStatus =
  | '待投递'
  | '已投递'
  | '笔试'
  | '面试中'
  | '已结束'
  | '已拒绝'
  | '已录用';

export interface ApplicationEvent {
  id: string;
  type: 'status_change' | 'note_added' | 'created' | 'sync';
  createdAt: string;
  summary: string;
  detail?: string;
}

export interface FeishuRecordSyncState {
  recordId?: string;
  lastSyncedAt?: string;
  status: 'idle' | 'pending' | 'syncing' | 'synced' | 'error';
  lastError?: string;
}

export interface ApplicationRecord {
  id: string;
  siteName: string;
  siteUrl: string;
  siteHost: string;
  companyName: string;
  jobTitle: string;
  city?: string;
  department?: string;
  salaryText?: string;
  status: ApplicationStatus;
  appliedAt?: string;
  deadline?: string;
  notes?: string;
  resumeName?: string;
  contactName?: string;
  contactInfo?: string;
  createdAt: string;
  updatedAt: string;
  events: ApplicationEvent[];
  feishuSync?: FeishuRecordSyncState;
  deletedAt?: string | null;
}

export interface CreateApplicationRecordInput {
  siteName: string;
  siteUrl: string;
  siteHost: string;
  companyName: string;
  jobTitle: string;
  city?: string;
  department?: string;
  salaryText?: string;
  appliedAt?: string;
  deadline?: string;
  notes?: string;
  resumeName?: string;
  contactName?: string;
  contactInfo?: string;
}

export interface UpdateApplicationRecordInput extends Partial<CreateApplicationRecordInput> {
  status?: ApplicationStatus;
}

export type ApplicationSyncDestination = 'none' | 'webdav' | 'feishu' | 'both';

export interface ApplicationSyncConfig {
  destination: ApplicationSyncDestination;
  autoSync: boolean;
  webdavCsvFileName: string;
  feishu?: {
    appToken: string;
    tableId: string;
    viewName?: string;
  };
}

export interface BackupData {
  userProfile: UserProfile | null;
  llmConfig: LLMConfig | null;
  settings: SettingsData | null;
  applicationRecords?: ApplicationRecord[];
  applicationSyncConfig?: ApplicationSyncConfig | null;
}

export interface BackupDocumentV1 {
  schemaVersion: 1;
  exportedAt: string;
  source: {
    extensionVersion: string;
  };
  data: BackupData;
  webdavConfig?: WebDAVConfig | null;
}

export type BackupDocument = BackupDocumentV1;

export type BackupErrorCode =
  | 'FILE_TOO_LARGE'
  | 'INVALID_JSON'
  | 'INVALID_ROOT'
  | 'MISSING_SCHEMA_VERSION'
  | 'INVALID_SCHEMA_VERSION'
  | 'UNSUPPORTED_FUTURE_VERSION'
  | 'UNSUPPORTED_OLD_VERSION'
  | 'INVALID_EXPORTED_AT'
  | 'INVALID_SOURCE'
  | 'INVALID_DATA'
  | 'INVALID_USER_PROFILE'
  | 'INVALID_LLM_CONFIG'
  | 'INVALID_SETTINGS'
  | 'INVALID_WEBDAV_CONFIG';

export interface BackupParseError {
  code: BackupErrorCode;
  message: string;
}

export type BackupParseResult =
  | { success: true; document: BackupDocument }
  | { success: false; error: BackupParseError };

export interface BackupSummary {
  schemaVersion: number;
  exportedAt: string;
  extensionVersion: string;
  hasUserProfile: boolean;
  hasResumeFile: boolean;
  hasLLMConfig: boolean;
  hasApiKey: boolean;
  hasWebDAVConfig: boolean;
}

export interface WebDAVConfig {
  enabled: boolean;
  serverUrl: string;
  username: string;
  password: string;
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'conflict' | 'error';

export interface SyncConflictSummary {
  local: BackupSummary;
  remote: BackupSummary;
}

export interface SyncMetadata {
  etag?: string;
  lastSyncedHash?: string;
  lastSyncedAt?: string;
  status: SyncStatus;
  lastError?: string;
  conflict?: SyncConflictSummary;
}

export type SyncAction =
  | 'create-remote'
  | 'no-change'
  | 'upload-local'
  | 'download-remote'
  | 'conflict';

export type SyncResultStatus = 'disabled' | 'synced' | 'queued' | 'conflict' | 'error';

export interface LocalSaveResult {
  localSaved: true;
  sync: SyncResultStatus;
}

export type FocusedFieldFailureReason =
  | 'NO_ACTIVE_TAB'
  | 'NO_CONTENT_SCRIPT'
  | 'NO_FOCUSED_FIELD'
  | 'FIELD_DETACHED'
  | 'FIELD_NOT_WRITABLE'
  | 'VALUE_REJECTED'
  | 'RESTRICTED_PAGE';

export interface FocusedFieldWriteResult {
  written: boolean;
  reason?: FocusedFieldFailureReason;
}

// 消息类型定义
export type Message =
  | { type: 'GET_USER_PROFILE'; payload?: null }
  | { type: 'SAVE_USER_PROFILE'; payload: UserProfile }
  | { type: 'GET_APPLICATION_RECORDS'; payload?: { includeDeleted?: boolean } }
  | { type: 'SAVE_APPLICATION_RECORD'; payload: CreateApplicationRecordInput }
  | { type: 'UPDATE_APPLICATION_RECORD'; payload: { id: string; patch: UpdateApplicationRecordInput } }
  | { type: 'DELETE_APPLICATION_RECORD'; payload: { id: string } }
  | { type: 'GET_APPLICATION_SYNC_CONFIG'; payload?: null }
  | { type: 'SAVE_APPLICATION_SYNC_CONFIG'; payload: ApplicationSyncConfig }
  | { type: 'SYNC_APPLICATIONS_NOW'; payload?: null }
  | { type: 'CAPTURE_APPLICATION_FROM_PAGE'; payload?: { tabId?: number } }
  | { type: 'PARSE_RESUME'; payload: { file: string; fileType: string; fileName: string; rawText?: string } }
  | { type: 'FILL_FORM'; payload?: null }
  | { type: 'DETECT_FIELDS'; payload?: null }
  | { type: 'START_AI_REGION_FILL'; payload?: null }
  | { type: 'WRITE_FOCUSED_FIELD'; payload: { tabId: number; value: string } }
  | { type: 'APPLY_FOCUSED_FIELD'; payload: { value: string } }
  | { type: 'GET_RESUME_DATA'; payload?: null }
  | { type: 'GENERATE_ANSWER'; payload: { questionText: string; context?: string; fieldMaxLength?: number; language?: 'zh' | 'en' } }
  | { type: 'MATCH_FIELDS_LLM'; payload: { fields: Array<{ index: number; name: string; id: string; placeholder: string; labelText: string; type: string }>; domain: string } }
  | {
      type: 'AI_FILL_SECTION';
      payload: {
        requestId: string;
        section: string;
        fields: Array<{
          index: number;
          rowIndex: number;
          name: string;
          label: string;
          type: string;
          options: string[];
          context: string;
        }>;
        domain: string;
      };
    }
  | { type: 'CANCEL_AI_FILL'; payload: { requestId: string } }
  | { type: 'GET_LLM_CONFIG'; payload?: null }
  | { type: 'SAVE_LLM_CONFIG'; payload: LLMConfig }
  | { type: 'TEST_LLM_CONNECTION'; payload?: LLMConfig | null }
  | { type: 'EXPORT_BACKUP'; payload?: null }
  | { type: 'PREVIEW_BACKUP_IMPORT'; payload: { json: string } }
  | { type: 'IMPORT_BACKUP'; payload: { json: string } }
  | { type: 'GET_WEBDAV_CONFIG'; payload?: null }
  | { type: 'SAVE_WEBDAV_CONFIG'; payload: WebDAVConfig }
  | { type: 'TEST_WEBDAV'; payload: WebDAVConfig }
  | { type: 'GET_SYNC_STATUS'; payload?: null }
  | { type: 'SYNC_NOW'; payload?: null }
  | { type: 'FORCE_UPLOAD_LOCAL'; payload?: null }
  | { type: 'FORCE_DOWNLOAD_REMOTE'; payload?: null }
  | { type: 'RESOLVE_SYNC_CONFLICT'; payload: { choice: 'local' | 'remote' } };

export interface MessageResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// 表单字段检测结果
export interface DetectedField {
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  fieldType: string;
  confidence: number;
  value?: string;
}

// 字段类型枚举
export enum FieldType {
  NAME = 'name',
  GENDER = 'gender',
  BIRTH_DATE = 'birthDate',
  PHONE = 'phone',
  EMAIL = 'email',
  WECHAT = 'wechat',
  ID_CARD = 'idCard',
  SCHOOL = 'school',
  COLLEGE = 'college',
  EDUCATION_TYPE = 'educationType',
  MAJOR = 'major',
  DEGREE = 'degree',
  GPA = 'gpa',
  SELF_EVALUATION = 'selfEvaluation',
  EDUCATION_START_DATE = 'educationStartDate',
  GRADUATION_DATE = 'graduationDate',
  COMPANY = 'company',
  POSITION = 'position',
  START_DATE = 'startDate',
  END_DATE = 'endDate',
  DESCRIPTION = 'description',
  SKILLS = 'skills',
  RESUME_FILE = 'resumeFile',
  UNKNOWN = 'unknown'
}

// 简历解析结果
export interface ParsedResumeData {
  personal?: Partial<PersonalInfo>;
  education?: Partial<EducationInfo>[];
  experience?: Partial<ExperienceInfo>[];
  projects?: Partial<ProjectInfo>[];
  skills?: string[];
  rawText: string;
}
