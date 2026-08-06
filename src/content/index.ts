import { FormDetector } from './formDetector';
import { FormFiller, type FillSection } from './formFiller';
import { OpenQuestionDetector } from './openQuestionDetector';
import { createVisualRegionFillController } from './visualRegionFill.ts';
import type {
  DetectedField,
  FocusedFieldWriteResult,
  Message,
  MessageResponse,
  UserProfile,
} from '../shared/types';

async function sendRuntimeMessage<T = any>(message: Message): Promise<MessageResponse<T>> {
  try {
    return await chrome.runtime.sendMessage(message) as MessageResponse<T>;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

console.log('Content script loaded');

// 初始化
const formDetector = new FormDetector();
const formFiller = new FormFiller();
const visualRegionFillController = createVisualRegionFillController({
  sendRuntimeMessage,
  fillElementValues: (values, shouldContinue) => formFiller.fillElementValues(
    values as Parameters<FormFiller['fillElementValues']>[0],
    shouldContinue,
  ),
});
let detectedFields: DetectedField[] = [];
let lastFocusedControl:
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLSelectElement
  | null = null;

document.addEventListener('focusin', (event) => {
  const target = event.target;
  if (isWritableControl(target)) {
    lastFocusedControl = target;
  }
}, true);

function isWritableControl(
  target: EventTarget | null
): target is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (
    !(target instanceof HTMLInputElement) &&
    !(target instanceof HTMLTextAreaElement) &&
    !(target instanceof HTMLSelectElement)
  ) {
    return false;
  }
  if (target.disabled) return false;

  if (target instanceof HTMLInputElement) {
    const unsupportedTypes = new Set([
      'hidden',
      'file',
      'button',
      'submit',
      'reset',
      'checkbox',
      'radio',
      'image',
    ]);
    if (unsupportedTypes.has(target.type.toLowerCase())) return false;
    if (target.readOnly) {
      return target.getAttribute('role') === 'combobox' && Boolean(target.closest('.ud__select'));
    }
  }

  if (target instanceof HTMLTextAreaElement && target.readOnly) return false;
  return true;
}

async function applyValueToFocusedControl(value: string): Promise<FocusedFieldWriteResult> {
  if (!lastFocusedControl) {
    return { written: false, reason: 'NO_FOCUSED_FIELD' };
  }
  if (!lastFocusedControl.isConnected) {
    lastFocusedControl = null;
    return { written: false, reason: 'FIELD_DETACHED' };
  }
  if (!isWritableControl(lastFocusedControl)) {
    return { written: false, reason: 'FIELD_NOT_WRITABLE' };
  }

  const written = await formFiller.fillFocusedControl(lastFocusedControl, value);
  return written
    ? { written: true }
    : { written: false, reason: 'VALUE_REJECTED' };
}

// 页面加载完成后检测表单
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDetection);
} else {
  initializeDetection();
}

function initializeDetection() {
  // 延迟检测，等待动态内容加载
  setTimeout(() => {
    detectedFields = formDetector.detectFields();
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

// 处理填充按钮点击
async function handleFillButtonClick() {
  await fillSection('all');
}

async function fillSection(section: FillSection) {
  try {
    // 获取用户资料
    const response = await sendRuntimeMessage<UserProfile>({
      type: 'GET_USER_PROFILE'
    });

    if (!response.success || !response.data) {
      alert('请先在插件选项页面中设置个人信息！');
      return;
    }

    // 先补足需要点击“添加”才会出现的动态经历行，再重新检测字段
    await formFiller.prepareDynamicSections(response.data, section);
    detectedFields = formDetector.detectFields();

    // 尝试用 LLM 匹配低置信度字段
    await enhanceDetectionWithLLM();

    const fieldsToFill = filterFieldsBySection(detectedFields, section);

    if (fieldsToFill.length === 0) {
      alert('未检测到可填充的表单字段');
      return;
    }

    // 填充表单
    await formFiller.fillForm(fieldsToFill, response.data);

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

  } catch (error) {
    console.error('Fill form error:', error);
    alert('填充表单时出错，请查看控制台了解详情');
  }
}

function filterFieldsBySection(fields: DetectedField[], section: FillSection): DetectedField[] {
  if (section === 'all') return fields;

  return fields.filter(field => getElementSection(field.element) === section);
}

function getElementSection(element: Element): FillSection | null {
  const module = element.closest<HTMLElement>('[class*=applyFormModuleWrapper]');
  const text = (module?.textContent || '').replace(/\s+/g, ' ');

  if (text.includes('基本信息')) return 'personal';
  if (text.includes('教育经历')) return 'education';
  if (text.includes('实习经历')) return 'experience';
  if (text.includes('项目经历')) return 'projects';

  return null;
}

function startAIRegionSelection() {
  visualRegionFillController.beginVisualRegionFill();
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

    const response = await sendRuntimeMessage({
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

      const response = await sendRuntimeMessage({
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

  if (message.type === 'START_AI_REGION_FILL') {
    startAIRegionSelection();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'APPLY_FOCUSED_FIELD') {
    applyValueToFocusedControl(message.payload.value).then((result) => {
      sendResponse({ success: true, data: result });
    }).catch((error) => {
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : '写入目标字段失败',
      });
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
