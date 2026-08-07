import { FormDetector } from './formDetector';
import { FormFiller, type FillSection } from './formFiller';
import { OpenQuestionDetector } from './openQuestionDetector';
import { groupPageScanFields, type PageScanField, type PageScanSection } from './pageScan';
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

async function handleAIPageFill() {
  const status = showAIRegionStatus('正在扫描整页表单...');
  const requestId = crypto.randomUUID();
  let cancelled = false;

  status.setCancelHandler(async () => {
    if (cancelled) return;
    cancelled = true;
    status.update('正在终止 AI 扫描填充...');
    await sendRuntimeMessage({
      type: 'CANCEL_AI_FILL',
      payload: { requestId },
    });
    status.update('AI 扫描填充已终止', 'warning');
  });

  try {
    const response = await sendRuntimeMessage<UserProfile>({
      type: 'GET_USER_PROFILE',
    });
    if (!response.success || !response.data) {
      throw new Error('请先在插件选项页面中设置个人信息');
    }

    await formFiller.prepareDynamicSections(response.data, 'all');
    detectedFields = formDetector.detectFields();
    const scannedFields = collectPageScanFields();
    if (scannedFields.length === 0) {
      status.update('未检测到可扫描的空白表单字段', 'warning');
      return;
    }

    const groups = groupPageScanFields(scannedFields);
    const fieldsByIndex = new Map(scannedFields.map(field => [field.index, field]));
    let filledCount = 0;

    for (const group of groups) {
      if (cancelled) return;
      const fields = group.fields
        .map(field => fieldsByIndex.get(field.index))
        .filter((field): field is ScannedPageField => Boolean(field));
      if (fields.length === 0) continue;

      status.update(`AI 正在扫描${getPageSectionName(group.section)}：${fields.length} 个字段...`);
      filledCount += await fillPageScanGroup(
        group.section,
        fields,
        requestId,
        () => !cancelled,
      );
    }

    if (cancelled) return;

    const fileInputs = formDetector.findFileInputs();
    if (fileInputs.length > 0 && response.data.resume) {
      for (const fileInput of fileInputs) {
        await formFiller.uploadResume(
          fileInput,
          response.data.resume.fileData,
          response.data.resume.fileName,
        );
      }
    }

    status.update(`AI 扫描填充完成：已填 ${filledCount} 项`, 'success');
  } catch (error) {
    if (cancelled) return;
    console.error('AI page scan fill failed:', error);
    status.update(
      `AI 扫描填充失败：${error instanceof Error ? error.message : '未知错误'}`,
      'error',
    );
  }
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

type ScannedPageField = PageScanField & {
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
};

function collectPageScanFields(): ScannedPageField[] {
  const elements = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea, select, [role="combobox"]',
    ),
  ).filter(element => {
    if (element.offsetParent === null || element.disabled) return false;
    if ('readOnly' in element && element.readOnly && element.getAttribute('role') !== 'combobox') {
      return false;
    }
    return !getControlValue(element);
  });
  const rowCounters = new Map<string, number>();

  return elements.map((element, index) => {
    const container = element.closest<HTMLElement>(
      '[data-form-field-id], [data-form-field-name], [data-form-field-i18n-name]',
    );
    const name = (
      element.getAttribute('data-form-field-name') ||
      container?.getAttribute('data-form-field-name') ||
      element.getAttribute('data-form-field-id') ||
      container?.getAttribute('data-form-field-id') ||
      (element as HTMLInputElement).name ||
      ''
    ).trim();
    const label = (
      element.getAttribute('data-form-field-i18n-name') ||
      container?.getAttribute('data-form-field-i18n-name') ||
      container?.querySelector('label')?.textContent ||
      element.getAttribute('aria-label') ||
      element.getAttribute('placeholder') ||
      ''
    ).trim();
    const key = `${name}|${label}`;
    const occurrence = rowCounters.get(key) || 0;
    rowCounters.set(key, occurrence + 1);
    const section = toPageScanSection(getElementSection(element));
    const dateInputs = isDateRangeControl(name, label) && container
      ? Array.from(container.querySelectorAll('input:not([type="hidden"]), textarea, select'))
        .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
      : [];
    const datePosition = dateInputs.indexOf(element);
    const isDateRange = dateInputs.length > 0;
    const context = `${getPageSectionName(section)}；${(container?.textContent || element.parentElement?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300)}`;

    return {
      element,
      index,
      rowIndex: isDateRange ? Math.floor(occurrence / 2) : occurrence,
      section,
      name,
      label,
      type: isDateRange
        ? (datePosition === 1 ? 'date-end' : 'date-start')
        : (element.getAttribute('role') === 'combobox' ? 'combobox' : element.tagName.toLowerCase()),
      options: getKnownOptions(label, name),
      context,
    };
  });
}

function getControlValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  const container = element.closest<HTMLElement>(
    '[data-form-field-id], [data-form-field-name], [data-form-field-i18n-name]',
  );
  return (
    container?.querySelector('.ud__select__selector__selectItem')?.textContent ||
    element.value ||
    ''
  ).trim();
}

function isDateRangeControl(name: string, label: string): boolean {
  return name === 'start_end_time' || label === '起止时间';
}

function toPageScanSection(section: FillSection | null): PageScanSection {
  return section && section !== 'all' ? section : 'other';
}

function getPageSectionName(section: PageScanSection): string {
  return {
    personal: '基本信息',
    education: '教育经历',
    experience: '实习经历',
    projects: '项目经历',
    other: '其它表单',
  }[section];
}

async function fillPageScanGroup(
  section: PageScanSection,
  fields: ScannedPageField[],
  requestId: string,
  shouldContinue: () => boolean,
): Promise<number> {
  const response = await sendRuntimeMessage<Record<string, string>>({
    type: 'AI_FILL_SECTION',
    payload: {
      requestId,
      section,
      domain: window.location.hostname,
      fields: fields.map(field => ({
        index: field.index,
        rowIndex: field.rowIndex,
        name: field.name,
        label: field.label,
        type: field.type,
        options: field.options,
        context: field.context,
      })),
    },
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'AI 未返回扫描结果');
  }

  const values = Object.entries(response.data)
    .map(([index, value]) => {
      const field = fields.find(item => item.index === Number(index));
      return field ? { element: field.element, value } : null;
    })
    .filter((item): item is {
      element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      value: string;
    } => Boolean(item))
    .sort((a, b) => getDateRangeFillPriority(a.element) - getDateRangeFillPriority(b.element));

  return formFiller.fillElementValues(values, shouldContinue);
}

function showAIRegionStatus(initialText: string) {
  const element = document.createElement('div');
  const textElement = document.createElement('span');
  const cancelButton = document.createElement('button');
  element.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:1000005;max-width:440px;padding:12px 14px;border-radius:8px;background:#24262d;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.28);font:500 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;align-items:center;gap:12px;';
  textElement.textContent = initialText;
  cancelButton.type = 'button';
  cancelButton.textContent = '终止';
  cancelButton.style.cssText = 'flex:none;padding:5px 10px;border:1px solid rgba(255,255,255,.65);border-radius:5px;background:transparent;color:#fff;cursor:pointer;font:500 12px inherit;';
  element.append(textElement, cancelButton);
  document.body.appendChild(element);

  return {
    setCancelHandler(handler: () => void | Promise<void>) {
      cancelButton.onclick = () => {
        cancelButton.disabled = true;
        cancelButton.textContent = '终止中';
        void handler();
      };
    },
    update(text: string, type: 'normal' | 'success' | 'warning' | 'error' = 'normal') {
      textElement.textContent = text;
      element.style.background = type === 'success'
        ? '#15803d'
        : type === 'warning'
          ? '#a16207'
          : type === 'error'
            ? '#b91c1c'
            : '#24262d';
      if (type !== 'normal') {
        cancelButton.remove();
        setTimeout(() => element.remove(), 5000);
      }
    },
  };
}

function getKnownOptions(label: string, name: string): string[] {
  if (label === '学历类型' || name === 'education_type') {
    return ['海外及港澳台', '统招全日制', '统招非全日制', '自考', '其他'];
  }
  if (label === '学历' || name === 'degree') {
    return ['高中', '专科', '本科', '硕士', '博士'];
  }
  return [];
}

function getDateRangeFillPriority(element: Element): number {
  const container = element.closest<HTMLElement>(
    '[data-form-field-id="start_end_time"], [data-form-field-name="start_end_time"], [data-form-field-i18n-name="起止时间"]'
  );
  if (!container) return 2;

  const inputs = Array.from(
    container.querySelectorAll('input:not([type="hidden"]), textarea, select')
  ).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
  return inputs.indexOf(element) === 1 ? 0 : 1;
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

  if (message.type === 'START_AI_PAGE_FILL') {
    handleAIPageFill().then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'AI 扫描填充失败',
      });
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
