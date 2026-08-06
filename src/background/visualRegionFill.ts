import { buildVisualRegionFillPrompt } from '../services/llm/prompts.ts';
import { LLMService } from '../services/llm/llmService.ts';
import type { LLMConfig, LLMResponse } from '../services/llm/types.ts';
import {
  parseVisualRegionFillResponse,
  validateVisualRegionMappings,
} from '../services/llm/visualRegionFill.ts';
import { supportsVisionInput } from '../services/llm/visionCapabilities.ts';
import type { VisionSupportReason } from '../services/llm/visionCapabilities.ts';
import { StorageService } from '../shared/storage.ts';
import type {
  MessageResponse,
  UserProfile,
  VisualRegionFillMappingResult,
  VisualRegionFillPayload,
  VisualRegionImagePayload,
} from '../shared/types.ts';

export interface DOMRectLike {
  x?: number;
  y?: number;
  left?: number;
  top?: number;
  width: number;
  height: number;
}

interface VisualRegionFillDeps {
  getLLMConfig: () => Promise<LLMConfig | null>;
  getUserProfile: () => Promise<UserProfile | null>;
  createLLM: (config: LLMConfig) => { chat: (messages: Parameters<LLMService['chat']>[0]) => Promise<LLMResponse> };
  getContexts: () => Promise<chrome.runtime.ExtensionContext[]>;
  createOffscreenDocument: (options: chrome.offscreen.CreateParameters) => Promise<void>;
  captureVisibleTab: (windowId: number, options: { format: 'png' }) => Promise<string>;
  sendRuntimeMessage: <T>(message: unknown) => Promise<MessageResponse<T>>;
}

const defaultDeps: VisualRegionFillDeps = {
  getLLMConfig: () => StorageService.getLLMConfig(),
  getUserProfile: () => StorageService.getUserProfile(),
  createLLM: config => new LLMService(config),
  getContexts: async () => (
    typeof chrome.runtime.getContexts === 'function'
      ? chrome.runtime.getContexts({
          contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
        })
      : []
  ),
  createOffscreenDocument: options => chrome.offscreen.createDocument(options),
  captureVisibleTab: (windowId, options) => chrome.tabs.captureVisibleTab(windowId, options),
  sendRuntimeMessage: message => chrome.runtime.sendMessage(message),
};

export async function handleVisualRegionFill(
  payload: VisualRegionFillPayload,
  deps: VisualRegionFillDeps = defaultDeps,
): Promise<MessageResponse<VisualRegionFillMappingResult>> {
  try {
    const config = await deps.getLLMConfig();
    if (!config?.apiKey?.trim()) {
      return { success: false, error: '请先在设置中配置 AI 服务' };
    }

    const vision = supportsVisionInput(config);
    if (!vision.supported) {
      return {
        success: false,
        error: mapVisionSupportError(vision.reason),
      };
    }

    const profile = await deps.getUserProfile();
    if (!profile) {
      return { success: false, error: '请先保存个人资料' };
    }

    const { system, userParts } = buildVisualRegionFillPrompt(payload, profile);
    const llm = deps.createLLM(config);
    const result = await llm.chat([
      { role: 'system', content: system },
      { role: 'user', content: userParts },
    ]);

    const parsed = parseVisualRegionFillResponse(result.content);
    const mappings = validateVisualRegionMappings(parsed.mappings, payload, profile);
    if (mappings.length === 0) {
      return { success: false, error: 'AI 未返回可写入的可靠结果' };
    }

    return {
      success: true,
      data: { mappings },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '视觉补填失败',
    };
  }
}

export async function captureVisibleRegion(
  windowId: number,
  selectionRect: DOMRectLike,
  deps: VisualRegionFillDeps = defaultDeps,
): Promise<VisualRegionImagePayload> {
  const imageDataUrl = await deps.captureVisibleTab(windowId, { format: 'png' });
  await ensureOffscreenDocument(deps);

  const response = await deps.sendRuntimeMessage<VisualRegionImagePayload>({
    type: 'CROP_IMAGE_OFFSCREEN',
    payload: {
      imageDataUrl,
      selectionRect: normalizeRect(selectionRect),
    },
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || '截图裁剪失败');
  }

  return response.data;
}

async function ensureOffscreenDocument(deps: VisualRegionFillDeps): Promise<void> {
  const contexts = await deps.getContexts();
  if (contexts.length > 0) return;

  await deps.createOffscreenDocument({
    url: 'src/offscreen/index.html',
    reasons: ['DOM_PARSER' as chrome.offscreen.Reason],
    justification: 'Crop captured screenshots for visual region fill',
  });
}

function normalizeRect(selectionRect: DOMRectLike) {
  return {
    x: Math.max(0, Math.round(selectionRect.x ?? selectionRect.left ?? 0)),
    y: Math.max(0, Math.round(selectionRect.y ?? selectionRect.top ?? 0)),
    width: Math.max(1, Math.round(selectionRect.width)),
    height: Math.max(1, Math.round(selectionRect.height)),
  };
}

function mapVisionSupportError(reason: VisionSupportReason): string {
  switch (reason) {
    case 'NO_MODEL':
      return '请先在设置中选择支持图片输入的模型';
    case 'CUSTOM_VISION_DISABLED':
      return '当前自定义模型未开启视觉输入，请在设置中启用视觉能力后重试';
    case 'PROVIDER_UNSUPPORTED':
    default:
      return '当前模型不支持图片输入，请在设置中切换到支持视觉输入的模型';
  }
}
