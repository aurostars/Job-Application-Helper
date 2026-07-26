import { FormDetector } from './formDetector';
import { FormFiller } from './formFiller';
import { OpenQuestionDetector } from './openQuestionDetector';
import { MessageService } from '../shared/message';
import type { DetectedField, UserProfile } from '../shared/types';

console.log('Content script loaded');

// 初始化
const formDetector = new FormDetector();
const formFiller = new FormFiller();
let detectedFields: DetectedField[] = [];

// 页面加载完成后检测表单
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDetection);
} else {
  initializeDetection();
}

function initializeDetection() {
  // 延迟检测，等待动态内容加载
  setTimeout(() => {
    detectAndInjectButton();
    injectAIButtons();
  }, 1000);

  // 开始监听 DOM 变化
  formDetector.startObserving((fields) => {
    detectedFields = fields;
    if (fields.length > 0) {
      console.log(`Re-detected ${fields.length} fields`);
      injectAIButtons();
    }
  });
}

function detectAndInjectButton() {
  detectedFields = formDetector.detectFields();

  if (detectedFields.length > 0) {
    console.log(`Found ${detectedFields.length} fillable fields`);
    injectFloatingButton();
  }
}

// 注入浮动按钮
function injectFloatingButton() {
  // 检查是否已经注入
  if (document.getElementById('job-helper-floating-btn')) {
    return;
  }

  // 创建浮动按钮
  const button = document.createElement('div');
  button.id = 'job-helper-floating-btn';
  button.innerHTML = `
    <div style="
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 12px 20px;
      border-radius: 25px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.2);
      cursor: pointer;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.3s ease;
    " onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 6px 20px rgba(0,0,0,0.3)';" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 15px rgba(0,0,0,0.2)';">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
        <polyline points="10 9 9 9 8 9"></polyline>
      </svg>
      <span>一键填充</span>
    </div>
  `;

  // 添加点击事件
  button.addEventListener('click', handleFillButtonClick);

  document.body.appendChild(button);
  console.log('Floating button injected');
}

// 处理填充按钮点击
async function handleFillButtonClick() {
  try {
    const button = document.getElementById('job-helper-floating-btn');
    if (button) {
      const span = button.querySelector('span');
      if (span) {
        span.textContent = '填充中...';
      }
    }

    // 获取用户资料
    const response = await MessageService.sendMessage<UserProfile>({
      type: 'GET_USER_PROFILE'
    });

    if (!response.success || !response.data) {
      alert('请先在插件选项页面中设置个人信息！');
      return;
    }

    // 重新检测字段（防止动态加载）
    detectedFields = formDetector.detectFields();

    // 尝试用 LLM 匹配低置信度字段
    await enhanceDetectionWithLLM();

    if (detectedFields.length === 0) {
      alert('未检测到可填充的表单字段');
      return;
    }

    // 填充表单
    await formFiller.fillForm(detectedFields, response.data);

    // 处理简历文件上传
    const fileInputs = formDetector.findFileInputs();
    if (fileInputs.length > 0 && response.data.resume) {
      for (const fileInput of fileInputs) {
        try {
          await formFiller.uploadResume(
            fileInput,
            response.data.resume.fileData,
            response.data.resume.fileName
          );
        } catch (error) {
          console.error('Failed to upload resume to input:', error);
        }
      }
    }

    // 显示成功消息
    showSuccessMessage();

    if (button) {
      const span = button.querySelector('span');
      if (span) {
        span.textContent = '填充完成 ✓';
        setTimeout(() => {
          span.textContent = '一键填充';
        }, 2000);
      }
    }
  } catch (error) {
    console.error('Fill form error:', error);
    alert('填充表单时出错，请查看控制台了解详情');

    const button = document.getElementById('job-helper-floating-btn');
    if (button) {
      const span = button.querySelector('span');
      if (span) {
        span.textContent = '一键填充';
      }
    }
  }
}

// 使用 LLM 增强字段检测
async function enhanceDetectionWithLLM() {
  const unmatched = formDetector.getUnmatchedFields();
  if (unmatched.length === 0) return;

  try {
    const payload = {
      fields: unmatched.map((f, i) => ({
        index: i,
        name: f.identifiers.name,
        id: f.identifiers.id,
        placeholder: f.identifiers.placeholder,
        labelText: f.identifiers.labelText,
        type: f.identifiers.type,
      })),
      domain: window.location.hostname,
    };

    const response = await MessageService.sendMessage({
      type: 'MATCH_FIELDS_LLM',
      payload,
    });

    if (response.success && response.data) {
      const mappings = response.data as Record<string, string>;
      for (const [indexStr, fieldType] of Object.entries(mappings)) {
        const idx = parseInt(indexStr);
        if (fieldType !== 'unknown' && unmatched[idx]) {
          detectedFields.push({
            element: unmatched[idx].element,
            fieldType,
            confidence: 0.75,
          });
        }
      }
    }
  } catch (error) {
    console.warn('LLM field matching failed:', error);
  }
}

// 注入 AI 生成按钮到开放性问题旁
function injectAIButtons() {
  const detector = new OpenQuestionDetector();
  const openFields = detector.detect();

  for (const field of openFields) {
    if (field.element.parentElement?.querySelector('.ai-gen-btn')) continue;

    const btn = document.createElement('button');
    btn.className = 'ai-gen-btn';
    btn.textContent = 'AI 生成';
    btn.style.cssText = `
      margin-left: 8px; margin-top: 6px; padding: 4px 12px;
      background: linear-gradient(135deg, #667eea, #764ba2);
      color: white; border: none; border-radius: 4px;
      font-size: 12px; cursor: pointer; display: inline-block;
    `;

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.textContent = '生成中...';
      (btn as HTMLButtonElement).disabled = true;

      const response = await MessageService.sendMessage({
        type: 'GENERATE_ANSWER',
        payload: {
          questionText: field.questionText,
          context: field.context,
          fieldMaxLength: parseInt(field.element.getAttribute('maxlength') || '0') || undefined,
          language: /[一-鿿]/.test(field.questionText) ? 'zh' : 'en',
        },
      });

      if (response.success && response.data) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, 'value'
        )?.set || Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set;

        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(field.element, response.data.answer);
        } else {
          field.element.value = response.data.answer;
        }
        field.element.dispatchEvent(new Event('input', { bubbles: true }));
        field.element.dispatchEvent(new Event('change', { bubbles: true }));
        field.element.style.border = '2px solid #667eea';
        btn.textContent = 'AI 生成 ✓';
      } else {
        btn.textContent = '生成失败';
        console.error('Generation failed:', response.error);
      }

      setTimeout(() => {
        btn.textContent = 'AI 生成';
        (btn as HTMLButtonElement).disabled = false;
      }, 3000);
    });

    field.element.insertAdjacentElement('afterend', btn);
  }
}

// 显示成功消息
function showSuccessMessage() {
  const message = document.createElement('div');
  message.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 1000000;
    background: #10b981;
    color: white;
    padding: 16px 24px;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 10px;
    animation: slideIn 0.3s ease;
  `;

  message.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
    <span>表单填充成功！</span>
  `;

  document.body.appendChild(message);

  setTimeout(() => {
    message.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => {
      document.body.removeChild(message);
    }, 300);
  }, 3000);
}

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DETECT_FIELDS') {
    detectedFields = formDetector.detectFields();
    sendResponse({
      success: true,
      data: {
        count: detectedFields.length,
        fields: detectedFields.map((f) => ({
          fieldType: f.fieldType,
          confidence: f.confidence
        }))
      }
    });
    return true;
  }

  if (message.type === 'FILL_FORM') {
    handleFillButtonClick().then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

// 添加 CSS 动画
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);
