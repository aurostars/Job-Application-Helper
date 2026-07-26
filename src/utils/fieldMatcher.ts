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
    const name = element.getAttribute('name') || '';
    const id = element.id || '';
    const placeholder = element.getAttribute('placeholder') || '';
    const type = element.getAttribute('type') || '';
    const autocomplete = element.getAttribute('autocomplete') || '';

    // 查找关联的 label
    let labelText = '';
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`);
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

    return { name, id, placeholder, labelText, type, autocomplete };
  }
}
