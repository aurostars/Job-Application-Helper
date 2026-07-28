export enum LLMProvider {
  OPENAI = 'openai',
  CLAUDE = 'claude',
  DEEPSEEK = 'deepseek',
  QWEN = 'qwen',
  GLM = 'glm',
  MINIMAX = 'minimax',
  MIMO = 'mimo',
  KIMI = 'kimi',
  CUSTOM = 'custom',
}

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export const PROVIDER_PRESETS: Record<LLMProvider, {
  /** 下拉框中展示的名称 */
  label: string;
  /** OpenAI 兼容协议的 API 根地址（不含 /chat/completions） */
  baseUrl: string;
  /** 选中该服务商时自动填入的默认模型 */
  defaultModel: string;
  /** 模型名称输入框的候选提示 */
  models: string[];
  /** 获取 API Key 的控制台地址 */
  consoleUrl?: string;
}> = {
  [LLMProvider.OPENAI]: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1', 'gpt-4.1-mini'],
    consoleUrl: 'https://platform.openai.com/api-keys',
  },
  [LLMProvider.CLAUDE]: {
    label: 'Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-5',
    models: ['claude-sonnet-4-5', 'claude-opus-4-5', 'claude-haiku-4-5'],
    consoleUrl: 'https://console.anthropic.com/settings/keys',
  },
  [LLMProvider.DEEPSEEK]: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    consoleUrl: 'https://platform.deepseek.com/api_keys',
  },
  [LLMProvider.QWEN]: {
    label: 'Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    models: ['qwen-plus', 'qwen-turbo', 'qwen-max', 'qwen-long'],
    consoleUrl: 'https://bailian.console.aliyun.com/',
  },
  [LLMProvider.GLM]: {
    label: 'GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    models: ['glm-4-flash', 'glm-4-air', 'glm-4-plus', 'glm-4.6'],
    consoleUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  [LLMProvider.MINIMAX]: {
    label: 'MiniMax',
    baseUrl: 'https://api.minimax.io/v1',
    defaultModel: 'MiniMax-M3',
    models: ['MiniMax-M3', 'MiniMax-M2.5'],
    consoleUrl: 'https://platform.minimax.io/',
  },
  [LLMProvider.MIMO]: {
    label: 'MiMo',
    // tp- 开头的 Token Plan key 只在 token-plan-cn 域名下有效；
    // 若使用标准 API key，请改为 https://api.xiaomimimo.com/v1
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
    defaultModel: 'mimo-v2.5-pro',
    models: ['mimo-v2.5-pro'],
    consoleUrl: 'https://mimo.mi.com/',
  },
  [LLMProvider.KIMI]: {
    label: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k', 'kimi-k2-0905-preview'],
    consoleUrl: 'https://platform.moonshot.cn/console/api-keys',
  },
  [LLMProvider.CUSTOM]: {
    label: '自定义（OpenAI 兼容）',
    baseUrl: '',
    defaultModel: '',
    models: [],
  },
};

/** 下拉框渲染顺序 */
export const PROVIDER_ORDER: LLMProvider[] = [
  LLMProvider.DEEPSEEK,
  LLMProvider.QWEN,
  LLMProvider.GLM,
  LLMProvider.MINIMAX,
  LLMProvider.MIMO,
  LLMProvider.KIMI,
  LLMProvider.OPENAI,
  LLMProvider.CLAUDE,
  LLMProvider.CUSTOM,
];

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
}
