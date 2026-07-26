import type { DetectedField } from '../shared/types';
import { FieldType } from '../shared/types';
import { FieldMatcher } from '../utils/fieldMatcher';

export interface UnmatchedField {
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  identifiers: ReturnType<typeof FieldMatcher.extractIdentifiers>;
}

export class FormDetector {
  private observer: MutationObserver | null = null;
  private detectedFields: DetectedField[] = [];
  private unmatchedFields: UnmatchedField[] = [];

  // 检测页面中的所有表单字段
  detectFields(): DetectedField[] {
    this.detectedFields = [];
    this.unmatchedFields = [];

    // 查找所有输入元素
    const inputs = document.querySelectorAll<HTMLInputElement>(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"])'
    );
    const textareas = document.querySelectorAll<HTMLTextAreaElement>('textarea');
    const selects = document.querySelectorAll<HTMLSelectElement>('select');

    // 处理 input 元素
    inputs.forEach((input) => {
      this.analyzeElement(input);
    });

    // 处理 textarea 元素
    textareas.forEach((textarea) => {
      this.analyzeElement(textarea);
    });

    // 处理 select 元素
    selects.forEach((select) => {
      this.analyzeElement(select);
    });

    console.log(`Detected ${this.detectedFields.length} form fields, ${this.unmatchedFields.length} unmatched`);
    return this.detectedFields;
  }

  // 分析单个元素
  private analyzeElement(
    element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  ): void {
    // 跳过不可见或禁用的元素
    if (
      element.offsetParent === null ||
      element.disabled ||
      ('readOnly' in element && element.readOnly)
    ) {
      return;
    }

    // 提取元素标识符
    const identifiers = FieldMatcher.extractIdentifiers(element);

    // 匹配字段类型
    const { fieldType, confidence } = FieldMatcher.matchFieldType(
      identifiers.name,
      identifiers.id,
      identifiers.placeholder,
      identifiers.labelText,
      identifiers.type,
      identifiers.autocomplete
    );

    if (confidence >= 0.5 && fieldType !== FieldType.UNKNOWN) {
      this.detectedFields.push({
        element,
        fieldType,
        confidence,
        value: element.value
      });
    } else {
      this.unmatchedFields.push({ element, identifiers });
    }
  }

  // 开始监听DOM变化
  startObserving(callback: (fields: DetectedField[]) => void): void {
    if (this.observer) {
      return;
    }

    this.observer = new MutationObserver((mutations) => {
      let shouldRedetect = false;

      for (const mutation of mutations) {
        // 检查是否添加了新的表单元素
        if (mutation.addedNodes.length > 0) {
          for (const node of Array.from(mutation.addedNodes)) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              if (
                element.tagName === 'INPUT' ||
                element.tagName === 'TEXTAREA' ||
                element.tagName === 'SELECT' ||
                element.querySelector('input, textarea, select')
              ) {
                shouldRedetect = true;
                break;
              }
            }
          }
        }

        if (shouldRedetect) break;
      }

      if (shouldRedetect) {
        const fields = this.detectFields();
        callback(fields);
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    console.log('Started observing DOM changes');
  }

  // 停止监听
  stopObserving(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
      console.log('Stopped observing DOM changes');
    }
  }

  // 获取已检测的字段
  getDetectedFields(): DetectedField[] {
    return this.detectedFields;
  }

  // 获取未匹配的字段（供 LLM 语义匹配使用）
  getUnmatchedFields(): UnmatchedField[] {
    return this.unmatchedFields;
  }

  // 根据字段类型查找元素
  findFieldsByType(fieldType: FieldType): DetectedField[] {
    return this.detectedFields.filter((field) => field.fieldType === fieldType);
  }

  // 查找文件上传控件
  findFileInputs(): HTMLInputElement[] {
    const fileInputs = document.querySelectorAll<HTMLInputElement>(
      'input[type="file"]'
    );

    return Array.from(fileInputs).filter((input) => {
      // 检查是否与简历相关
      const identifiers = FieldMatcher.extractIdentifiers(input);
      const searchText =
        `${identifiers.name} ${identifiers.id} ${identifiers.placeholder} ${identifiers.labelText}`.toLowerCase();

      return /简历|resume|cv|附件|attach/i.test(searchText);
    });
  }
}
