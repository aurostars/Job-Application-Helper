import type { UserProfile } from './types';
import type { LLMConfig } from '../services/llm/types';

const STORAGE_KEYS = {
  USER_PROFILE: 'userProfile',
  SETTINGS: 'settings',
  LLM_CONFIG: 'llmConfig',
} as const;

export class StorageService {
  // 获取用户资料
  static async getUserProfile(): Promise<UserProfile | null> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEYS.USER_PROFILE);
      return (result[STORAGE_KEYS.USER_PROFILE] as UserProfile) || null;
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
}
