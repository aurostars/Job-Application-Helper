export enum LLMProvider {
  OPENAI = 'openai',
  CLAUDE = 'claude',
  DEEPSEEK = 'deepseek',
  QWEN = 'qwen',
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
  baseUrl: string;
}> = {
  [LLMProvider.OPENAI]: {
    baseUrl: 'https://api.openai.com/v1',
  },
  [LLMProvider.CLAUDE]: {
    baseUrl: 'https://api.anthropic.com/v1',
  },
  [LLMProvider.DEEPSEEK]: {
    baseUrl: 'https://api.deepseek.com/v1',
  },
  [LLMProvider.QWEN]: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
};

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
}
