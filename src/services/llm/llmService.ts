import type { LLMConfig, ChatMessage, LLMResponse } from './types';
import { LLMProvider } from './types';

export class LLMService {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async chat(messages: ChatMessage[], signal?: AbortSignal): Promise<LLMResponse> {
    if (this.config.provider === LLMProvider.CLAUDE) {
      return this.callClaude(messages, signal);
    }
    return this.callOpenAICompatible(messages, signal);
  }

  /** 去掉用户粘贴地址时常见的结尾斜杠，避免出现 //chat/completions */
  private trimmedBaseUrl(): string {
    return this.config.baseUrl.trim().replace(/\/+$/, '');
  }

  /**
   * Claude 的端点固定为 {base}/v1/messages。用户和旧配置里常把 /v1 写进 baseUrl，
   * 这里统一剥掉，避免拼成 /v1/v1/messages。
   */
  private claudeBaseUrl(): string {
    return this.trimmedBaseUrl().replace(/\/v1$/, '');
  }

  private async callOpenAICompatible(messages: ChatMessage[], signal?: AbortSignal): Promise<LLMResponse> {
    const response = await fetch(`${this.trimmedBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: this.config.temperature ?? 0.7,
        max_tokens: this.config.maxTokens ?? 4096,
      }),
      signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM API error (${response.status}): ${extractErrorMessage(error)}`);
    }

    const data = await response.json();

    // 部分国产平台（如智谱、MiniMax）在 HTTP 200 下用 body 内的错误码报错
    const inlineError = data.error?.message ?? data.base_resp?.status_msg;
    if (inlineError && !data.choices?.length) {
      throw new Error(`LLM API error: ${inlineError}`);
    }

    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') {
      // 推理模型（如 mimo-v2.5-pro、deepseek-reasoner）可能因 max_tokens
      // 在思考阶段就耗尽，导致正文为空
      const finishReason = data.choices?.[0]?.finish_reason;
      if (finishReason === 'length') {
        throw new Error('模型输出被 max_tokens 截断，正文为空。推理模型请调大 max_tokens 或改用非推理模型。');
      }
      throw new Error('LLM 返回内容为空，请检查模型名称是否正确');
    }

    return {
      content,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
      } : undefined,
    };
  }

  private async callClaude(messages: ChatMessage[], signal?: AbortSignal): Promise<LLMResponse> {
    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const nonSystemMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const response = await fetch(`${this.claudeBaseUrl()}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        // 官方 API 默认拒绝浏览器发起的请求，扩展环境需显式声明
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.config.model,
        system: systemMsg,
        messages: nonSystemMessages,
        max_tokens: this.config.maxTokens ?? 2048,
        temperature: this.config.temperature ?? 0.7,
      }),
      signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error (${response.status}): ${extractErrorMessage(error)}`);
    }

    // 中转站地址填错时常返回 200 + 网站 HTML，这里给出可定位的提示而非 JSON 解析错误
    const raw = await response.text();
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(
        `Claude API 返回的不是 JSON，请检查 Base URL 是否正确（当前请求 ${this.claudeBaseUrl()}/v1/messages）。响应开头：${raw.slice(0, 80)}`,
      );
    }

    const content = data.content?.[0]?.text;
    if (typeof content !== 'string' || content.trim() === '') {
      throw new Error(
        `Claude 返回内容为空或格式异常，请检查模型名称是否正确。${extractErrorMessage(raw)}`,
      );
    }

    return {
      content,
      usage: data.usage ? {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
      } : undefined,
    };
  }

  /** 连通性测试：失败时抛出原始错误，便于界面显示具体原因 */
  async testConnection(): Promise<void> {
    await this.chat([{ role: 'user', content: 'Hi. Reply with just "ok".' }]);
  }
}

/** 各家平台的错误体格式不一，尽量抽出可读的一句话，否则退回原始文本 */
function extractErrorMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return (
      parsed.error?.message ??
      parsed.base_resp?.status_msg ??
      parsed.message ??
      raw
    );
  } catch {
    return raw;
  }
}
