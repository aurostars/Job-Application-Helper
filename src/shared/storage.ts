import type {
  BackupData,
  SettingsData,
  SyncMetadata,
  UserProfile,
  WebDAVConfig,
} from './types';
import type { LLMConfig } from '../services/llm/types';
import { normalizeWebDAVServerUrl } from '../services/webdav.ts';

export const STORAGE_KEYS = {
  USER_PROFILE: 'userProfile',
  SETTINGS: 'settings',
  LLM_CONFIG: 'llmConfig',
  WEBDAV_CONFIG: 'webdavConfig',
  SYNC_METADATA: 'syncMetadata',
} as const;

export function normalizeUserProfile(profile: UserProfile): UserProfile {
  return {
    ...profile,
    personal: profile.personal || {},
    customInformation: profile.customInformation || [],
    education: (profile.education || []).map(education => ({
      ...education,
      college: education.college || inferCollegeForKnownMockData(education.school, education.major),
      educationType: education.educationType || '统招全日制',
    })),
    experience: profile.experience || [],
    projects: profile.projects || [],
    skills: profile.skills || [],
    certifications: profile.certifications || [],
  } as UserProfile;
}

function inferCollegeForKnownMockData(school?: string, major?: string): string {
  if (school === '北京大学' && major === '计算机科学与技术') return '信息科学技术学院';
  if (school === '浙江大学' && major === '软件工程') return '软件学院';
  if (school === '北京市第四中学') return '理科实验班';
  return '';
}

export class StorageService {
  // 获取用户资料
  static async getUserProfile(): Promise<UserProfile | null> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEYS.USER_PROFILE);
      const profile = (result[STORAGE_KEYS.USER_PROFILE] as UserProfile) || null;
      return profile ? normalizeUserProfile(profile) : null;
    } catch (error) {
      console.error('Failed to get user profile:', error);
      return null;
    }
  }

  // 保存用户资料
  static async saveUserProfile(profile: UserProfile): Promise<boolean> {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEYS.USER_PROFILE]: profile
      });
      return true;
    } catch (error) {
      console.error('Failed to save user profile:', error);
      return false;
    }
  }

  // 更新部分用户资料
  static async updateUserProfile(updates: Partial<UserProfile>): Promise<boolean> {
    try {
      const currentProfile = await this.getUserProfile();
      if (!currentProfile) {
        return false;
      }

      const updatedProfile = {
        ...currentProfile,
        ...updates
      };

      return await this.saveUserProfile(updatedProfile);
    } catch (error) {
      console.error('Failed to update user profile:', error);
      return false;
    }
  }

  // 清除所有数据
  static async clearAll(): Promise<boolean> {
    try {
      await chrome.storage.local.clear();
      return true;
    } catch (error) {
      console.error('Failed to clear storage:', error);
      return false;
    }
  }

  // 获取存储使用情况
  static async getStorageUsage(): Promise<{ used: number; quota: number }> {
    try {
      const bytesInUse = await chrome.storage.local.getBytesInUse();
      return {
        used: bytesInUse,
        quota: chrome.storage.local.QUOTA_BYTES
      };
    } catch (error) {
      console.error('Failed to get storage usage:', error);
      return { used: 0, quota: 0 };
    }
  }

  // 获取 LLM 配置
  static async getLLMConfig(): Promise<LLMConfig | null> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEYS.LLM_CONFIG);
      return (result[STORAGE_KEYS.LLM_CONFIG] as LLMConfig) || null;
    } catch {
      return null;
    }
  }

  // 保存 LLM 配置
  static async saveLLMConfig(config: LLMConfig): Promise<boolean> {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEYS.LLM_CONFIG]: config,
      });
      return true;
    } catch {
      return false;
    }
  }

  static async getSettings(): Promise<SettingsData | null> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    return (result[STORAGE_KEYS.SETTINGS] as SettingsData) || null;
  }

  static async saveSettings(settings: SettingsData): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
  }

  static async getBackupData(): Promise<BackupData> {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.USER_PROFILE,
      STORAGE_KEYS.LLM_CONFIG,
      STORAGE_KEYS.SETTINGS,
    ]);
    const profile = (result[STORAGE_KEYS.USER_PROFILE] as UserProfile | undefined) || null;
    return {
      userProfile: profile ? normalizeUserProfile(profile) : null,
      llmConfig: (result[STORAGE_KEYS.LLM_CONFIG] as LLMConfig | undefined) || null,
      settings: (result[STORAGE_KEYS.SETTINGS] as SettingsData | undefined) || null,
    };
  }

  static async replaceBusinessData(data: BackupData): Promise<void> {
    const values: Record<string, unknown> = {};
    const removals: string[] = [];
    const entries = [
      [STORAGE_KEYS.USER_PROFILE, data.userProfile],
      [STORAGE_KEYS.LLM_CONFIG, data.llmConfig],
      [STORAGE_KEYS.SETTINGS, data.settings],
    ] as const;

    for (const [key, value] of entries) {
      if (value === null) removals.push(key);
      else values[key] = value;
    }
    if (Object.keys(values).length > 0) await chrome.storage.local.set(values);
    if (removals.length > 0) await chrome.storage.local.remove(removals);
  }

  static async getWebDAVConfig(): Promise<WebDAVConfig | null> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.WEBDAV_CONFIG);
    const stored = result[STORAGE_KEYS.WEBDAV_CONFIG] as
      | WebDAVConfig
      | { enabled: boolean; fileUrl?: string; username: string; password: string }
      | undefined;
    if (!stored) return null;

    const rawUrl = 'serverUrl' in stored ? stored.serverUrl : stored.fileUrl;
    if (!rawUrl) return { ...stored, serverUrl: '' };
    return {
      enabled: stored.enabled,
      serverUrl: normalizeWebDAVServerUrl(rawUrl),
      username: stored.username,
      password: stored.password,
    };
  }

  static async saveWebDAVConfig(config: WebDAVConfig): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEYS.WEBDAV_CONFIG]: config });
  }

  static async getSyncMetadata(): Promise<SyncMetadata> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SYNC_METADATA);
    return (result[STORAGE_KEYS.SYNC_METADATA] as SyncMetadata) || { status: 'idle' };
  }

  static async saveSyncMetadata(metadata: SyncMetadata): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEYS.SYNC_METADATA]: metadata });
  }

  static async applyRemoteBusinessData(data: BackupData): Promise<void> {
    await this.replaceBusinessData(data);
  }
}
