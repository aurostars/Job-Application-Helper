import type { Message, MessageResponse, UserProfile, ParsedResumeData } from '../shared/types';
import { StorageService } from '../shared/storage';
import { parseResume, isStructuredType, parseStructuredResume } from '../parsers';
import { NLPHelper } from '../utils/nlpHelper';
import { LLMService } from '../services/llm/llmService';
import { buildAnswerGenerationPrompt, buildResumeParsingPrompt, buildFieldMatchingPrompt } from '../services/llm/prompts';
import type { LLMConfig } from '../services/llm/types';

// Background Service Worker 入口
console.log('Background service worker started');

// 监听消息
chrome.runtime.onMessage.addListener(
  (
    message: Message,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => {
    // 处理异步消息
    handleMessage(message, sender)
      .then(sendResponse)
      .catch((error) => {
        console.error('Message handler error:', error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });

    // 返回 true 表示异步响应
    return true;
  }
);

// 处理消息
async function handleMessage(
  message: Message,
  sender: chrome.runtime.MessageSender
): Promise<MessageResponse> {
  switch (message.type) {
    case 'GET_USER_PROFILE':
      return await handleGetUserProfile();

    case 'SAVE_USER_PROFILE':
      return await handleSaveUserProfile(message.payload);

    case 'PARSE_RESUME':
      return await handleParseResume(
        message.payload.file,
        message.payload.fileType,
        message.payload.fileName
      );

    case 'GET_RESUME_DATA':
      return await handleGetResumeData();

    case 'GENERATE_ANSWER':
      return await handleGenerateAnswer(message.payload);

    case 'MATCH_FIELDS_LLM':
      return await handleMatchFieldsLLM(message.payload);

    case 'GET_LLM_CONFIG':
      return await handleGetLLMConfig();

    case 'SAVE_LLM_CONFIG':
      return await handleSaveLLMConfig(message.payload);

    case 'TEST_LLM_CONNECTION':
      return await handleTestConnection(message.payload);

    default:
      return {
        success: false,
        error: 'Unknown message type'
      };
  }
}

// 获取用户资料
async function handleGetUserProfile(): Promise<MessageResponse<UserProfile>> {
  try {
    const profile = await StorageService.getUserProfile();
    return {
      success: true,
      data: profile || undefined
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get user profile'
    };
  }
}

// 保存用户资料
async function handleSaveUserProfile(
  profile: UserProfile
): Promise<MessageResponse> {
  try {
    const success = await StorageService.saveUserProfile(profile);
    return {
      success,
      error: success ? undefined : 'Failed to save user profile'
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save user profile'
    };
  }
}

// 解析简历
async function handleParseResume(
  fileData: string,
  fileType: string,
  fileName: string
): Promise<MessageResponse> {
  try {
    const rawText = await parseResume(fileData, fileType);

    let parsedData: ParsedResumeData;

    if (isStructuredType(fileType)) {
      // JSON 简历本身已结构化，直接映射，避免 LLM 二次推断带来的误差
      parsedData = parseStructuredResume(rawText);
    } else {
      const llmConfig = await StorageService.getLLMConfig();
      if (llmConfig?.apiKey) {
        try {
          parsedData = await parseResumeWithLLM(rawText, llmConfig);
        } catch (error) {
          console.warn('LLM resume parsing failed, falling back to regex:', error);
          parsedData = NLPHelper.parseResumeText(rawText);
        }
      } else {
        parsedData = NLPHelper.parseResumeText(rawText);
      }
    }

    const currentProfile = await StorageService.getUserProfile();

    const updatedProfile: UserProfile = {
      personal: {
        ...(currentProfile?.personal || {}),
        ...(parsedData.personal || {})
      } as any,
      education: (parsedData.education || currentProfile?.education || []) as any,
      experience: (parsedData.experience || currentProfile?.experience || []) as any,
      projects: (parsedData.projects || currentProfile?.projects || []) as any,
      skills: parsedData.skills || currentProfile?.skills || [],
      certifications: currentProfile?.certifications || [],
      resume: {
        fileName,
        fileData,
        fileType,
        parsedText: rawText,
        uploadDate: new Date().toISOString()
      }
    };

    await StorageService.saveUserProfile(updatedProfile);

    return {
      success: true,
      data: {
        parsedData,
        rawText
      }
    };
  } catch (error) {
    console.error('Resume parsing error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse resume'
    };
  }
}

// 获取简历数据
async function handleGetResumeData(): Promise<MessageResponse> {
  try {
    const profile = await StorageService.getUserProfile();
    return {
      success: true,
      data: profile?.resume || null
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get resume data'
    };
  }
}

// LLM 简历解析
async function parseResumeWithLLM(
  rawText: string,
  config: LLMConfig
): Promise<ParsedResumeData> {
  const llm = new LLMService(config);
  const { system, user } = buildResumeParsingPrompt(rawText);

  const result = await llm.chat([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);

  let jsonStr = result.content.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const parsed = JSON.parse(jsonStr);

  return {
    personal: parsed.personal,
    education: (parsed.education || []).map((e: any, i: number) => ({
      id: `edu-${i}`, ...e
    })),
    experience: (parsed.experience || []).map((e: any, i: number) => ({
      id: `exp-${i}`, ...e
    })),
    projects: (parsed.projects || []).map((p: any, i: number) => ({
      id: `proj-${i}`, ...p
    })),
    skills: parsed.skills || [],
    rawText,
  };
}

// AI 生成开放性问题回答
async function handleGenerateAnswer(
  payload: { questionText: string; context?: string; fieldMaxLength?: number; language?: 'zh' | 'en' }
): Promise<MessageResponse> {
  try {
    const config = await StorageService.getLLMConfig();
    if (!config?.apiKey) {
      return { success: false, error: '请先在设置中配置AI服务' };
    }

    const profile = await StorageService.getUserProfile();
    if (!profile) {
      return { success: false, error: '请先填写个人信息' };
    }

    const llm = new LLMService(config);
    const { system, user } = buildAnswerGenerationPrompt(payload, profile);

    const result = await llm.chat([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]);

    return { success: true, data: { answer: result.content } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'AI生成失败',
    };
  }
}

// LLM 语义字段匹配
async function handleMatchFieldsLLM(
  payload: { fields: Array<{ index: number; name: string; id: string; placeholder: string; labelText: string; type: string }>; domain: string }
): Promise<MessageResponse> {
  try {
    const cacheKey = `fieldMatch_${payload.domain}`;
    const cached = await chrome.storage.local.get(cacheKey);
    if (cached[cacheKey]) {
      const cachedResult = cached[cacheKey] as Record<string, string>;
      const allCovered = payload.fields.every(f => f.index.toString() in cachedResult);
      if (allCovered) {
        return { success: true, data: cachedResult };
      }
    }

    const config = await StorageService.getLLMConfig();
    if (!config?.apiKey) {
      return { success: false, error: 'LLM not configured' };
    }

    const llm = new LLMService(config);
    const { system, user } = buildFieldMatchingPrompt(payload.fields);

    const result = await llm.chat([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]);

    let jsonStr = result.content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    const mappings: Record<string, string> = JSON.parse(jsonStr);

    await chrome.storage.local.set({ [cacheKey]: mappings });

    return { success: true, data: mappings };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '字段匹配失败',
    };
  }
}

// 获取 LLM 配置
async function handleGetLLMConfig(): Promise<MessageResponse> {
  try {
    const config = await StorageService.getLLMConfig();
    return { success: true, data: config };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get LLM config',
    };
  }
}

// 保存 LLM 配置
async function handleSaveLLMConfig(config: LLMConfig): Promise<MessageResponse> {
  try {
    const success = await StorageService.saveLLMConfig(config);
    return { success };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save LLM config',
    };
  }
}

// 测试 LLM 连接
// payload 为界面上当前填写的配置；缺省时回退到已保存的配置
async function handleTestConnection(payload?: LLMConfig | null): Promise<MessageResponse> {
  try {
    const config = payload ?? await StorageService.getLLMConfig();
    if (!config?.apiKey?.trim()) {
      return { success: false, error: '请先填写 API Key' };
    }
    if (!config.baseUrl?.trim()) {
      return { success: false, error: '请先填写 API 地址' };
    }
    if (!config.model?.trim()) {
      return { success: false, error: '请先填写模型名称' };
    }

    const llm = new LLMService(config);
    await llm.testConnection();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '连接测试失败',
    };
  }
}

// 监听安装事件
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed:', details.reason);

  if (details.reason === 'install') {
    // 首次安装时打开选项页面
    chrome.runtime.openOptionsPage();
  }
});
