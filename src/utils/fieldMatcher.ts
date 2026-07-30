import { FIELD_PATTERNS } from '../shared/constants';
import { FieldType } from '../shared/types';

export class FieldMatcher {
  // 计算两个字符串的相似度 (Levenshtein距离)
  private static calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    const costs: number[] = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) {
        costs[s2.length] = lastValue;
      }
    }

    const maxLength = Math.max(s1.length, s2.length);
    return maxLength === 0 ? 1 : 1 - costs[s2.length] / maxLength;
  }

  // 匹配字段类型
  static matchFieldType(
    name: string,
    id: string,
    placeholder: string,
    labelText: string,
    type: string,
    autocomplete: string
  ): { fieldType: FieldType; confidence: number } {
    const searchText = `${name} ${id} ${placeholder} ${labelText} ${autocomplete}`.toLowerCase();

    // 特殊类型直接匹配
    if (type === 'email') {
      return { fieldType: FieldType.EMAIL, confidence: 1.0 };
    }
    if (type === 'tel') {
      return { fieldType: FieldType.PHONE, confidence: 1.0 };
    }
    if (type === 'date') {
      if (searchText.includes('birth')) {
        return { fieldType: FieldType.BIRTH_DATE, confidence: 0.9 };
      }
    }
    if (type === 'file') {
      return { fieldType: FieldType.RESUME_FILE, confidence: 0.8 };
    }

    // 字节等站点会使用 education_type 作为学历类型字段名。
    // 必须在通用的 education/school 模式前精确判断，避免被误识别成学校。
    if (/学历类型|学习形式|培养方式|education[_\s-]?type|study[_\s-]?type/.test(searchText)) {
      return { fieldType: FieldType.EDUCATION_TYPE, confidence: 1.0 };
    }

    const hasEducationContext = /教育|学校|院校|大学|学院|就读|入学|毕业|education|school|university|college|academic|enroll|enrol|admission/.test(searchText);
    const hasWorkContext = /工作|实习|公司|单位|入职|离职|岗位|职位|work|job|company|employer|intern|employment/.test(searchText);
    if (hasEducationContext && !hasWorkContext) {
      if (/结束|毕业|预计毕业|to|end|finish|graduate|graduation/.test(searchText)) {
        return { fieldType: FieldType.GRADUATION_DATE, confidence: 0.95 };
      }
      if (/开始|起始|入学|就读开始|from|begin|enroll|enrol|admission|educationstart/.test(searchText)) {
        return { fieldType: FieldType.EDUCATION_START_DATE, confidence: 0.95 };
      }
    }

    if (hasWorkContext && !hasEducationContext) {
      if (/结束|离职|结束时间|to|end|finish/.test(searchText)) {
        return { fieldType: FieldType.END_DATE, confidence: 0.95 };
      }
      if (/开始|起始|入职|开始时间|from|begin|startdate/.test(searchText)) {
        return { fieldType: FieldType.START_DATE, confidence: 0.95 };
      }
    }

    // 遍历所有字段模式进行匹配
    let bestMatch = { fieldType: FieldType.UNKNOWN, confidence: 0 };

    for (const [fieldType, patterns] of Object.entries(FIELD_PATTERNS)) {
      for (const pattern of patterns) {
        // 精确匹配
        if (searchText.includes(pattern.toLowerCase())) {
          const confidence = 0.9;
          if (confidence > bestMatch.confidence) {
            bestMatch = { fieldType: fieldType as FieldType, confidence };
          }
        }

        // 模糊匹配
        const similarity = this.calculateSimilarity(searchText, pattern);
        if (similarity > 0.7 && similarity > bestMatch.confidence) {
          bestMatch = { fieldType: fieldType as FieldType, confidence: similarity };
        }
      }
    }

    return bestMatch;
  }

  // 从元素中提取所有可能的标识符
  static extractIdentifiers(
    element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  ): {
    name: string;
    id: string;
    placeholder: string;
    labelText: string;
    type: string;
    autocomplete: string;
  } {
    const fieldContainer = element.closest<HTMLElement>(
      '[data-form-field-id], [data-form-field-name], [data-form-field-i18n-name]'
    );
    const elementDataId = element.getAttribute('data-form-field-id') || '';
    const elementDataName = element.getAttribute('data-form-field-name') || '';
    const elementDataI18nName = element.getAttribute('data-form-field-i18n-name') || '';
    const containerDataId = fieldContainer?.getAttribute('data-form-field-id') || '';
    const containerDataName = fieldContainer?.getAttribute('data-form-field-name') || '';
    const containerDataI18nName = fieldContainer?.getAttribute('data-form-field-i18n-name') || '';

    const name = [
      element.getAttribute('name') || '',
      elementDataName,
      elementDataId,
      containerDataName,
      containerDataId,
    ].filter(Boolean).join(' ');
    const id = [
      element.id || '',
      elementDataId,
      containerDataId,
    ].filter(Boolean).join(' ');
    const placeholder = element.getAttribute('placeholder') || '';
    const type = element.getAttribute('type') || '';
    const autocomplete = element.getAttribute('autocomplete') || '';

    // 查找关联的 label
    let labelText = '';
    if (id) {
      const label = element.id ? document.querySelector(`label[for="${element.id}"]`) : null;
      if (label) {
        labelText = label.textContent || '';
      }
    }

    if (!labelText && fieldContainer) {
      const label = fieldContainer.querySelector(
        '.ud-formily-item-label label, .ud-formily-item-label, label'
      );
      if (label) {
        labelText = label.textContent || '';
      }
    }

    // 如果没有找到 label[for]，尝试找父级 label
    if (!labelText) {
      const parentLabel = element.closest('label');
      if (parentLabel) {
        labelText = parentLabel.textContent || '';
      }
    }

    // 如果还是没有，查找前面的兄弟节点
    if (!labelText) {
      let prevSibling = element.previousElementSibling;
      while (prevSibling) {
        if (prevSibling.tagName === 'LABEL' || prevSibling.tagName === 'SPAN') {
          labelText = prevSibling.textContent || '';
          break;
        }
        prevSibling = prevSibling.previousElementSibling;
      }
    }

    if (!labelText) {
      labelText = [elementDataI18nName, containerDataI18nName].filter(Boolean).join(' ');
    }

    const moduleContainer = element.closest<HTMLElement>('[class*=applyFormModuleWrapper]');
    const moduleText = (moduleContainer?.textContent || '').replace(/\s+/g, ' ').trim();
    const contextText = `${moduleText} ${labelText} ${name} ${id}`;

    if (fieldContainer && /起止时间|date range|start.*end|start_end/i.test(`${labelText} ${name} ${id}`)) {
      const fieldsInContainer = Array.from(
        fieldContainer.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
          'input:not([type="hidden"]), textarea, select'
        )
      );
      const fieldIndex = fieldsInContainer.indexOf(element);
      const isEducationRange = /教育经历|学历类型|学校名称|学院|导师/.test(contextText);
      const isWorkRange = /实习经历|工作经历|公司名称|职位名称|没有实习经历/.test(contextText);

      if (isEducationRange && fieldIndex === 0) {
        labelText = `${labelText} 入学时间 educationstart`;
      } else if (isEducationRange && fieldIndex === 1) {
        labelText = `${labelText} 毕业时间 graduation`;
      } else if (isWorkRange && fieldIndex === 0) {
        labelText = `${labelText} 开始时间 startdate`;
      } else if (isWorkRange && fieldIndex === 1) {
        labelText = `${labelText} 结束时间 enddate`;
      }
    }

    return { name, id, placeholder, labelText, type, autocomplete };
  }
}
