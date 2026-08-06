/**
 * 服务商标识。
 *
 * 用 const 对象而非 enum：enum 需要运行时代码生成，Node 的
 * --experimental-strip-types 无法执行，会让本模块无法被测试直接加载。
 * 常量与类型同名可以合并声明，`LLMProvider.CLAUDE` 与 `provider: LLMProvider`
 * 两种用法保持不变。
 */
export const LLMProvider = {
  OPENAI: 'openai',
  CLAUDE: 'claude',
  DEEPSEEK: 'deepseek',
  QWEN: 'qwen',
  GLM: 'glm',
  MINIMAX: 'minimax',
  MIMO: 'mimo',
  KIMI: 'kimi',
  CUSTOM: 'custom',
} as const;

export type LLMProvider = typeof LLMProvider[keyof typeof LLMProvider];

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  visionEnabled?: boolean;
}

/**
 * 输出上限默认值。
 *
 * 推理模型（deepseek-reasoner、mimo-v2.5-pro、MiniMax-M 系列等）会先消耗
 * 大量 token 思考，思考内容也计入 max_tokens。简历解析的 JSON 本身就要
 * 1500~2500 token，若上限只有 4096，思考阶段就耗尽，正文返回空。
 */
export const DEFAULT_MAX_TOKENS = 8192;

/**
 * 截断重试允许自动提升到的上限。到此仍拿不到正文即放弃 AI 解析，
 * 回退本地规则，避免无限重试推高费用。
 */
export const MAX_TOKENS_CEILING = 32768;

export const PROVIDER_PRESETS: Record<LLMProvider, {
  /** 下拉框中展示的名称 */
  label: string;
  /** OpenAI 兼容协议的 API 根地址（不含 /chat/completions） */
  baseUrl: string;
  /**
   * 选中该服务商时自动填入的默认模型。
   * 一律选用非推理模型：推理模型的思考内容占用 max_tokens，
   * 简历解析这类需要长 JSON 输出的任务容易在思考阶段耗尽额度、返回空正文。
   */
  defaultModel: string;
  /** 模型名称输入框的候选提示，只列非推理模型 */
  models: string[];
  /** 已知的推理模型，仅用于在界面上提示风险，不作为默认值 */
  reasoningModels?: string[];
  /** 该服务商当前在售模型均为推理模型时置为 true */
  reasoningOnly?: boolean;
  /** 获取 API Key 的控制台地址 */
  consoleUrl?: string;
}> = {
  [LLMProvider.OPENAI]: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
    // o 系列与 gpt-5 系列为推理模型
    reasoningModels: ['o4-mini', 'o3', 'gpt-5'],
    consoleUrl: 'https://platform.openai.com/api-keys',
  },
  [LLMProvider.CLAUDE]: {
    label: 'Claude',
    baseUrl: 'https://api.anthropic.com',
    // 本插件不开启 extended thinking，这几个模型即按非推理方式响应
    defaultModel: 'claude-haiku-4-5',
    models: ['claude-haiku-4-5', 'claude-sonnet-4-5'],
    consoleUrl: 'https://console.anthropic.com/settings/keys',
  },
  [LLMProvider.DEEPSEEK]: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat'],
    reasoningModels: ['deepseek-reasoner'],
    consoleUrl: 'https://platform.deepseek.com/api_keys',
  },
  [LLMProvider.QWEN]: {
    label: 'Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    models: ['qwen-plus', 'qwen-turbo', 'qwen-max', 'qwen-long'],
    reasoningModels: ['qwq-plus', 'qwen3-235b-a22b-thinking-2507'],
    consoleUrl: 'https://bailian.console.aliyun.com/',
  },
  [LLMProvider.GLM]: {
    label: 'GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    models: ['glm-4-flash', 'glm-4-air', 'glm-4-plus'],
    // glm-4.6 为混合推理模型，默认开启思考
    reasoningModels: ['glm-4.6', 'glm-z1-air'],
    consoleUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  [LLMProvider.MINIMAX]: {
    label: 'MiniMax',
    baseUrl: 'https://api.minimax.io/v1',
    // M 系列均为推理模型，缺少非推理替代，故标记为仅有推理模型
    defaultModel: 'MiniMax-M2.5',
    models: [],
    reasoningModels: ['MiniMax-M3', 'MiniMax-M2.5'],
    reasoningOnly: true,
    consoleUrl: 'https://platform.minimax.io/',
  },
  [LLMProvider.MIMO]: {
    label: 'MiMo',
    // tp- 开头的 Token Plan key 只在 token-plan-cn 域名下有效；
    // 若使用标准 API key，请改为 https://api.xiaomimimo.com/v1
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
    // mimo-v2.5-pro 为推理模型，无非推理版本
    defaultModel: 'mimo-v2.5-pro',
    models: [],
    reasoningModels: ['mimo-v2.5-pro'],
    reasoningOnly: true,
    consoleUrl: 'https://mimo.mi.com/',
  },
  [LLMProvider.KIMI]: {
    label: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-32k',
    models: ['moonshot-v1-32k', 'moonshot-v1-8k', 'moonshot-v1-128k', 'kimi-k2-0905-preview'],
    reasoningModels: ['kimi-k2-thinking'],
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

export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; data: string };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContentPart[];
}

export interface LLMResponse {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
}
