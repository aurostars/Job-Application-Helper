import type { Message, MessageResponse } from './types';

export class MessageService {
  // 发送消息到 background
  static async sendMessage<T = any>(message: Message): Promise<MessageResponse<T>> {
    try {
      const response = await chrome.runtime.sendMessage(message);
      return response as MessageResponse<T>;
    } catch (error) {
      console.error('Failed to send message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // 发送消息到指定 tab
  static async sendMessageToTab<T = any>(
    tabId: number,
    message: Message
  ): Promise<MessageResponse<T>> {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      return response as MessageResponse<T>;
    } catch (error) {
      console.error('Failed to send message to tab:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // 监听消息
  static addListener(
    callback: (
      message: Message,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: MessageResponse) => void
    ) => boolean | void
  ): void {
    chrome.runtime.onMessage.addListener(callback);
  }

  // 移除监听器
  static removeListener(
    callback: (
      message: Message,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: MessageResponse) => void
    ) => boolean | void
  ): void {
    chrome.runtime.onMessage.removeListener(callback);
  }
}
