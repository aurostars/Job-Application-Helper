import { LLMProvider, type LLMConfig } from './types.ts';

export type VisionSupportReason =
  | 'NO_MODEL'
  | 'PROVIDER_UNSUPPORTED'
  | 'CUSTOM_VISION_DISABLED';

export type VisionSupportResult =
  | { supported: true }
  | { supported: false; reason: VisionSupportReason };

type BuiltinVisionMatrix = Record<Exclude<LLMProvider, 'custom'>, readonly string[]>;

const BUILTIN_VISION_MODELS: BuiltinVisionMatrix = {
  [LLMProvider.OPENAI]: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini'],
  [LLMProvider.CLAUDE]: ['claude-sonnet-4-5', 'claude-haiku-4-5'],
  [LLMProvider.DEEPSEEK]: [],
  [LLMProvider.QWEN]: ['qwen-vl-max', 'qwen-vl-plus'],
  [LLMProvider.GLM]: ['glm-4v-plus', 'glm-4.1v-thinking'],
  [LLMProvider.MINIMAX]: ['MiniMax-VL-01', 'MiniMax-Text-01'],
  [LLMProvider.MIMO]: [],
  [LLMProvider.KIMI]: ['moonshot-v1-vision-preview'],
};

function normalizeModelName(model: string): string {
  return model.trim().toLowerCase();
}

function getBuiltinVisionModels(provider: Exclude<LLMProvider, 'custom'>): Set<string> {
  return new Set(BUILTIN_VISION_MODELS[provider].map(normalizeModelName));
}

export function supportsVisionInput(config: LLMConfig): VisionSupportResult {
  const model = normalizeModelName(config.model);
  if (!model) {
    return { supported: false, reason: 'NO_MODEL' };
  }

  if (config.provider === LLMProvider.CUSTOM) {
    return config.visionEnabled
      ? { supported: true }
      : { supported: false, reason: 'CUSTOM_VISION_DISABLED' };
  }

  return getBuiltinVisionModels(config.provider).has(model)
    ? { supported: true }
    : { supported: false, reason: 'PROVIDER_UNSUPPORTED' };
}
