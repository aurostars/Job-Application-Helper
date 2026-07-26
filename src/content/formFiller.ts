import type { DetectedField, UserProfile } from '../shared/types';
import { FieldType } from '../shared/types';
import { GENDER_OPTIONS, DEGREE_OPTIONS } from '../shared/constants';

export class FormFiller {
  // 填充所有检测到的字段
  async fillForm(fields: DetectedField[], profile: UserProfile): Promise<void> {
    console.log(`Filling ${fields.length} form fields`);

    for (const field of fields) {
      try {
        const value = this.getValueForField(field.fieldType as FieldType, profile);
        if (value !== null && value !== undefined) {
          await this.fillField(field.element, value);
        }
      } catch (error) {
        console.error(`Failed to fill field ${field.fieldType}:`, error);
      }
    }

    console.log('Form filling completed');
  }

  // 根据字段类型获取对应的值
  private getValueForField(fieldType: FieldType, profile: UserProfile): string | null {
    switch (fieldType) {
      case FieldType.NAME:
        return profile.personal.name || null;

      case FieldType.GENDER:
        return this.normalizeGender(profile.personal.gender);

      case FieldType.BIRTH_DATE:
        return profile.personal.birthDate || null;

      case FieldType.PHONE:
        return profile.personal.phone || null;

      case FieldType.EMAIL:
        return profile.personal.email || null;

      case FieldType.WECHAT:
        return profile.personal.wechat || null;

      case FieldType.ID_CARD:
        return profile.personal.idCard || null;

      case FieldType.SCHOOL:
        return profile.education[0]?.school || null;

      case FieldType.MAJOR:
        return profile.education[0]?.major || null;

      case FieldType.DEGREE:
        return this.normalizeDegree(profile.education[0]?.degree);

      case FieldType.GPA:
        return profile.education[0]?.gpa || null;

      case FieldType.GRADUATION_DATE:
        return profile.education[0]?.endDate || null;

      case FieldType.COMPANY:
        return profile.experience[0]?.company || null;

      case FieldType.POSITION:
        return profile.experience[0]?.position || null;

      case FieldType.START_DATE:
        return profile.experience[0]?.startDate || null;

      case FieldType.END_DATE:
        return profile.experience[0]?.endDate || null;

      case FieldType.DESCRIPTION:
        return profile.experience[0]?.description || null;

      case FieldType.SKILLS:
        return profile.skills.join(', ') || null;

      default:
        return null;
    }
  }

  // 标准化性别值
  private normalizeGender(gender: string): string | null {
    if (!gender) return null;

    const genderLower = gender.toLowerCase();

    // 检查男性
    if (GENDER_OPTIONS.male.some((opt) => opt.toLowerCase() === genderLower)) {
      return '男';
    }

    // 检查女性
    if (GENDER_OPTIONS.female.some((opt) => opt.toLowerCase() === genderLower)) {
      return '女';
    }

    return gender;
  }

  // 标准化学历值
  private normalizeDegree(degree?: string): string | null {
    if (!degree) return null;

    const degreeLower = degree.toLowerCase();

    for (const [key, values] of Object.entries(DEGREE_OPTIONS)) {
      if (values.some((v) => v.toLowerCase() === degreeLower)) {
        return values[0]; // 返回标准化的中文值
      }
    }

    return degree;
  }

  // 填充单个字段
  private async fillField(
    element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
    value: string
  ): Promise<void> {
    // 根据元素类型进行不同的填充
    if (element.tagName === 'SELECT') {
      this.fillSelectField(element as HTMLSelectElement, value);
    } else {
      this.fillInputField(element as HTMLInputElement | HTMLTextAreaElement, value);
    }

    // 等待一小段时间，确保事件处理完成
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  // 填充下拉框
  private fillSelectField(element: HTMLSelectElement, value: string): void {
    // 尝试精确匹配
    for (let i = 0; i < element.options.length; i++) {
      const option = element.options[i];
      if (
        option.value === value ||
        option.text === value ||
        option.text.includes(value) ||
        value.includes(option.text)
      ) {
        element.selectedIndex = i;
        this.triggerEvents(element);
        return;
      }
    }

    // 如果没有匹配，尝试部分匹配
    for (let i = 0; i < element.options.length; i++) {
      const option = element.options[i];
      const optionText = option.text.toLowerCase();
      const valueLower = value.toLowerCase();

      if (optionText.includes(valueLower) || valueLower.includes(optionText)) {
        element.selectedIndex = i;
        this.triggerEvents(element);
        return;
      }
    }
  }

  // 填充输入框
  private fillInputField(
    element: HTMLInputElement | HTMLTextAreaElement,
    value: string
  ): void {
    // 使用原生 setter 设置值（兼容 React）
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;

    const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    )?.set;

    if (element.tagName === 'INPUT' && nativeInputValueSetter) {
      nativeInputValueSetter.call(element, value);
    } else if (element.tagName === 'TEXTAREA' && nativeTextAreaValueSetter) {
      nativeTextAreaValueSetter.call(element, value);
    }

    // 直接设置值
    element.value = value;

    // 触发所有相关事件
    this.triggerEvents(element);
  }

  // 触发表单事件（兼容 React/Vue/Angular）
  private triggerEvents(element: HTMLElement): void {
    const events = [
      new Event('input', { bubbles: true, cancelable: true }),
      new Event('change', { bubbles: true, cancelable: true }),
      new Event('blur', { bubbles: true, cancelable: true }),
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true }),
      new KeyboardEvent('keyup', { bubbles: true, cancelable: true })
    ];

    events.forEach((event) => {
      element.dispatchEvent(event);
    });
  }

  // 上传简历文件
  async uploadResume(
    fileInput: HTMLInputElement,
    fileData: string,
    fileName: string
  ): Promise<void> {
    try {
      // 将 base64 转换为 Blob
      const blob = this.base64ToBlob(fileData);

      // 创建 File 对象
      const file = new File([blob], fileName, { type: blob.type });

      // 创建 DataTransfer 对象
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      // 设置文件
      fileInput.files = dataTransfer.files;

      // 触发 change 事件
      this.triggerEvents(fileInput);

      console.log(`Resume uploaded: ${fileName}`);
    } catch (error) {
      console.error('Failed to upload resume:', error);
      throw error;
    }
  }

  // 将 base64 转换为 Blob
  private base64ToBlob(base64Data: string): Blob {
    // 提取 MIME 类型和数据
    const parts = base64Data.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const base64String = parts[1] || parts[0];

    // 解码 base64
    const binaryString = atob(base64String);
    const bytes = new Uint8Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return new Blob([bytes], { type: mime });
  }
}
