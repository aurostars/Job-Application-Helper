import type { DetectedField, UserProfile } from '../shared/types';
import { FieldType } from '../shared/types';
import { GENDER_OPTIONS, DEGREE_OPTIONS } from '../shared/constants';

export type FillSection = 'all' | 'personal' | 'education' | 'experience' | 'projects';

const EDUCATION_FIELD_TYPES = new Set<FieldType>([
  FieldType.SCHOOL,
  FieldType.COLLEGE,
  FieldType.EDUCATION_TYPE,
  FieldType.MAJOR,
  FieldType.DEGREE,
  FieldType.GPA,
  FieldType.EDUCATION_START_DATE,
  FieldType.GRADUATION_DATE,
]);

const EXPERIENCE_FIELD_TYPES = new Set<FieldType>([
  FieldType.COMPANY,
  FieldType.POSITION,
  FieldType.START_DATE,
  FieldType.END_DATE,
  FieldType.DESCRIPTION,
]);

export class FormFiller {
  // 字节等网申页面常见模式：经历条目需要先点击“添加”才会出现空白行
  async prepareDynamicSections(profile: UserProfile, section: FillSection = 'all'): Promise<void> {
    if (section === 'all' || section === 'education') {
      await this.ensureEducationRows(profile.education.length);
    }
    if (section === 'all' || section === 'experience') {
      await this.ensureExperienceRows(profile.experience.length);
    }
  }

  async fillElementValues(
    values: Array<{
      element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      value: string;
    }>,
    shouldContinue: () => boolean = () => true
  ): Promise<number> {
    let filledCount = 0;

    for (const item of values) {
      if (!shouldContinue()) break;
      if (!item.value) continue;
      await this.fillField(item.element, item.value);
      filledCount++;
    }

    return filledCount;
  }

  async fillFocusedControl(
    element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
    value: string
  ): Promise<boolean> {
    if (!element.isConnected || element.disabled) return false;

    await this.fillField(element, value);
    await this.wait(100);

    if (element.tagName === 'SELECT') {
      const select = element as HTMLSelectElement;
      const selectedText = select.options[select.selectedIndex]?.text || '';
      return select.value === value || selectedText === value;
    }

    if (element.getAttribute('role') === 'combobox' && element.closest('.ud__select')) {
      const container = element.closest<HTMLElement>(
        '[data-form-field-id], [data-form-field-name], [data-form-field-i18n-name]'
      );
      const selectedText = (
        container?.querySelector('.ud__select__selector__selectItem')?.textContent || ''
      ).trim();
      return selectedText === value || element.value === value;
    }

    return element.value === value;
  }

  // 填充所有检测到的字段
  async fillForm(fields: DetectedField[], profile: UserProfile): Promise<void> {
    console.log(`Filling ${fields.length} form fields`);

    const educationIndexes: Partial<Record<FieldType, number>> = {};
    const experienceIndexes: Partial<Record<FieldType, number>> = {};
    await this.fillDateRangeFields(fields, profile);
    const orderedFields = fields.filter(field => !this.isDateRangeField(field.fieldType as FieldType));

    for (const field of orderedFields) {
      try {
        const fieldType = field.fieldType as FieldType;
        const educationIndex = this.getNextEducationIndex(fieldType, educationIndexes);
        const experienceIndex = this.getNextExperienceIndex(fieldType, experienceIndexes);
        const value = this.getValueForField(fieldType, profile, educationIndex, experienceIndex);
        if (value !== null && value !== undefined) {
          await this.fillField(field.element, value);
        }
      } catch (error) {
        console.error(`Failed to fill field ${field.fieldType}:`, error);
      }
    }

    console.log('Form filling completed');
  }

  private async fillDateRangeFields(fields: DetectedField[], profile: UserProfile): Promise<void> {
    const rangeFields = fields.filter(field => this.isDateRangeField(field.fieldType as FieldType));
    const groups = new Map<HTMLElement, DetectedField[]>();

    for (const field of rangeFields) {
      const container = field.element.closest<HTMLElement>(
        '[data-form-field-id="start_end_time"], [data-form-field-name="start_end_time"], [data-form-field-i18n-name="起止时间"]'
      );
      if (!container) continue;

      groups.set(container, [...(groups.get(container) || []), field]);
    }

    const sectionIndexes: Partial<Record<FillSection, number>> = {};
    const orderedGroups = Array.from(groups.entries()).sort(([a], [b]) => {
      const position = a.compareDocumentPosition(b);
      return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    for (const [container, groupFields] of orderedGroups) {
      const section = this.getSectionForElement(container);
      if (section !== 'education' && section !== 'experience') continue;

      const index = sectionIndexes[section] ?? 0;
      sectionIndexes[section] = index + 1;

      const source = section === 'education'
        ? profile.education[index]
        : profile.experience[index];
      if (!source) continue;

      const dates = this.getOrderedDateRange(source.startDate, source.endDate);
      const inputs = groupFields
        .map(field => field.element)
        .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);

      const startInput = inputs[0];
      const endInput = inputs[1];

      // 字节日期范围组件会校验“开始时间不能晚于结束时间”。
      // 先写右侧较晚时间，再写左侧较早时间，避免旧值触发校验回滚。
      if (endInput && dates.end) {
        await this.fillField(endInput, dates.end);
      }
      if (startInput && dates.start) {
        await this.fillField(startInput, dates.start);
      }
    }
  }

  private isDateRangeField(fieldType: FieldType): boolean {
    return [
      FieldType.EDUCATION_START_DATE,
      FieldType.GRADUATION_DATE,
      FieldType.START_DATE,
      FieldType.END_DATE,
    ].includes(fieldType);
  }

  private getSectionForElement(element: Element): FillSection | null {
    let current: Element | null = element;

    while (current && current !== document.body) {
      const text = (current.textContent || '').replace(/\s+/g, ' ');
      if (/教育经历|学历类型|学校名称|学院|导师/.test(text)) return 'education';
      if (/实习经历|没有实习经历|公司名称|职位名称/.test(text)) return 'experience';
      if (/项目经历|项目名称|项目角色/.test(text)) return 'projects';
      if (/基本信息|手机号码|个人证件/.test(text)) return 'personal';
      current = current.parentElement;
    }

    return null;
  }

  private async ensureEducationRows(targetCount: number): Promise<void> {
    if (targetCount <= 1) return;

    await this.ensureRows({
      moduleKeyword: '教育经历',
      rowFieldName: 'school',
      targetCount,
    });
  }

  private async ensureExperienceRows(targetCount: number): Promise<void> {
    if (targetCount === 0) return;

    const internshipModule = this.findModule('实习经历');
    const noExperienceCheckbox = internshipModule
      ?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    const moduleText = (internshipModule?.textContent || '').replace(/\s+/g, ' ');

    if (noExperienceCheckbox?.checked || moduleText.includes('没有实习经历')) {
      noExperienceCheckbox?.click();
      await this.wait(500);
    }

    await this.ensureRows({
      moduleKeyword: '实习经历',
      rowFieldName: 'company',
      targetCount,
    });
  }

  private async ensureRows(options: {
    moduleKeyword: string;
    rowFieldName: string;
    targetCount: number;
  }): Promise<void> {
    for (let attempts = 0; attempts < options.targetCount + 3; attempts++) {
      const currentCount = this.countFieldsInModule(options.moduleKeyword, options.rowFieldName);
      if (currentCount >= options.targetCount) return;

      const addButton = this.findAddButton(options.moduleKeyword);
      if (!addButton) return;

      addButton.click();
      await this.wait(700);
    }
  }

  private findModule(keyword: string): HTMLElement | null {
    const modules = Array.from(
      document.querySelectorAll<HTMLElement>('[class*=applyFormModuleWrapper]')
    );

    return modules
      .filter(module => (module.textContent || '').includes(keyword))
      .sort((a, b) => b.querySelectorAll('input, textarea, select, button').length - a.querySelectorAll('input, textarea, select, button').length)[0] || null;
  }

  private countFieldsInModule(moduleKeyword: string, fieldName: string): number {
    const module = this.findModule(moduleKeyword);
    if (!module) return 0;

    return Array.from(module.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input:not([type="hidden"]), textarea, select'
    )).filter(element => {
      const container = element.closest<HTMLElement>(
        '[data-form-field-id], [data-form-field-name], [data-form-field-i18n-name]'
      );
      return (
        element.getAttribute('data-form-field-name') === fieldName ||
        element.getAttribute('data-form-field-id') === fieldName ||
        container?.getAttribute('data-form-field-name') === fieldName ||
        container?.getAttribute('data-form-field-id') === fieldName
      );
    }).length;
  }

  private findAddButton(moduleKeyword: string): HTMLButtonElement | null {
    const module = this.findModule(moduleKeyword);
    if (!module) return null;

    return Array.from(module.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => (button.textContent || '').trim() === '添加' && !button.disabled) || null;
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getNextEducationIndex(
    fieldType: FieldType,
    educationIndexes: Partial<Record<FieldType, number>>
  ): number | undefined {
    if (!EDUCATION_FIELD_TYPES.has(fieldType)) return undefined;

    const index = educationIndexes[fieldType] ?? 0;
    educationIndexes[fieldType] = index + 1;
    return index;
  }

  private getNextExperienceIndex(
    fieldType: FieldType,
    experienceIndexes: Partial<Record<FieldType, number>>
  ): number | undefined {
    if (!EXPERIENCE_FIELD_TYPES.has(fieldType)) return undefined;

    const index = experienceIndexes[fieldType] ?? 0;
    experienceIndexes[fieldType] = index + 1;
    return index;
  }

  // 根据字段类型获取对应的值
  private getValueForField(
    fieldType: FieldType,
    profile: UserProfile,
    educationIndex = 0,
    experienceIndex = 0
  ): string | null {
    const education = profile.education[educationIndex];
    const experience = profile.experience[experienceIndex];
    const educationDates = this.getOrderedDateRange(education?.startDate, education?.endDate);
    const experienceDates = this.getOrderedDateRange(experience?.startDate, experience?.endDate);

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

      case FieldType.SELF_EVALUATION:
        return profile.personal.selfEvaluation || null;

      case FieldType.SCHOOL:
        return education?.school || null;

      case FieldType.COLLEGE:
        return education?.college || this.inferCollege(education?.school, education?.major) || null;

      case FieldType.EDUCATION_TYPE:
        return education?.educationType || '统招全日制';

      case FieldType.MAJOR:
        return education?.major || null;

      case FieldType.DEGREE:
        return this.normalizeDegree(education?.degree);

      case FieldType.GPA:
        return education?.gpa || null;

      case FieldType.EDUCATION_START_DATE:
        return educationDates.start || null;

      case FieldType.GRADUATION_DATE:
        return educationDates.end || null;

      case FieldType.COMPANY:
        return experience?.company || null;

      case FieldType.POSITION:
        return experience?.position || null;

      case FieldType.START_DATE:
        return experienceDates.start || null;

      case FieldType.END_DATE:
        return experienceDates.end || null;

      case FieldType.DESCRIPTION:
        return experience?.description || null;

      case FieldType.SKILLS:
        return profile.skills.join(', ') || null;

      default:
        return null;
    }
  }

  private getOrderedDateRange(
    startDate?: string,
    endDate?: string
  ): { start: string; end: string } {
    if (!startDate || !endDate) {
      return { start: startDate || '', end: endDate || '' };
    }

    const startKey = this.toComparableDate(startDate);
    const endKey = this.toComparableDate(endDate);

    if (startKey && endKey && startKey > endKey) {
      return { start: endDate, end: startDate };
    }

    return { start: startDate, end: endDate };
  }

  private toComparableDate(value: string): string {
    const match = value.match(/(\d{4})\D{0,3}(\d{1,2})?/);
    if (!match) return '';

    const year = match[1];
    const month = (match[2] || '01').padStart(2, '0');
    return `${year}-${month}`;
  }

  private inferCollege(school?: string, major?: string): string {
    if (school === '北京大学' && major === '计算机科学与技术') {
      return '信息科学技术学院';
    }
    if (school === '浙江大学' && major === '软件工程') {
      return '软件学院';
    }
    if (school === '北京市第四中学') {
      return '理科实验班';
    }
    return '';
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

    for (const values of Object.values(DEGREE_OPTIONS)) {
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
    if (element.getAttribute('role') === 'combobox' && element.closest('.ud__select')) {
      const selected = await this.fillCustomSelectField(element as HTMLInputElement, value);
      if (selected) return;
    }

    // 根据元素类型进行不同的填充
    if (element.tagName === 'SELECT') {
      this.fillSelectField(element as HTMLSelectElement, value);
    } else {
      this.fillInputField(element as HTMLInputElement | HTMLTextAreaElement, value);
    }

    // 等待一小段时间，确保事件处理完成
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  private async fillCustomSelectField(element: HTMLInputElement, value: string): Promise<boolean> {
    const selector = element.closest<HTMLElement>('.ud__select__selector');
    if (!selector) return false;

    selector.scrollIntoView({ block: 'center', inline: 'nearest' });
    await this.wait(100);
    selector.click();
    await this.wait(500);

    const dropdowns = Array.from(
      document.querySelectorAll<HTMLElement>('.ud__select__dropdown')
    );
    const dropdown = dropdowns
      .filter(candidate => {
        const style = window.getComputedStyle(candidate);
        return (
          !candidate.classList.contains('ud__select__dropdown-hidden') &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        );
      })
      .pop();
    const options = Array.from(
      dropdown?.querySelectorAll<HTMLElement>('.ud__select__list__item') || []
    );
    const normalizedValue = value.trim().toLowerCase();
    const target = options.find(option => {
      const text = (option.textContent || '').trim();
      const normalizedText = text.toLowerCase();
      return (
        normalizedText === normalizedValue ||
        normalizedText.includes(normalizedValue) ||
        normalizedValue.includes(normalizedText)
      );
    });

    if (!target) {
      document.body.click();
      return false;
    }

    target.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      view: window,
    }));
    target.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      view: window,
    }));
    target.click();

    const reactKey = Object.keys(target).find(
      key => key.startsWith('__reactEventHandlers$') || key.startsWith('__reactProps$')
    );
    const handlers = reactKey ? (target as any)[reactKey] : null;
    if (typeof handlers?.onClick === 'function') {
      handlers.onClick({
        target,
        currentTarget: target,
        type: 'click',
        nativeEvent: new MouseEvent('click'),
        bubbles: true,
        cancelable: true,
        preventDefault: () => {},
        stopPropagation: () => {},
        isDefaultPrevented: () => false,
        isPropagationStopped: () => false,
        persist: () => {},
      });
    }

    await this.wait(150);
    return true;
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
    const oldValue = element.value;

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
    } else {
      element.value = value;
    }

    // React 受控输入会用 _valueTracker 判断值是否变化。
    // 先把 tracker 保持为旧值，再触发事件，React 才会接受新值。
    const trackedElement = element as HTMLInputElement & {
      _valueTracker?: { setValue: (value: string) => void };
      [key: string]: any;
    };
    trackedElement._valueTracker?.setValue(oldValue);

    // 触发所有相关事件
    this.triggerEvents(element);
  }

  // 触发表单事件（兼容 React/Vue/Angular）
  private triggerEvents(element: HTMLElement): void {
    const inputEvent = new Event('input', { bubbles: true, cancelable: true });
    element.dispatchEvent(inputEvent);
    this.triggerReactChange(element, inputEvent);

    const events = [
      new Event('change', { bubbles: true, cancelable: true }),
      new Event('blur', { bubbles: true, cancelable: true }),
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true }),
      new KeyboardEvent('keyup', { bubbles: true, cancelable: true })
    ];

    events.forEach((event) => {
      element.dispatchEvent(event);
    });
  }

  private triggerReactChange(element: HTMLElement, nativeEvent: Event): void {
    const reactKey = Object.keys(element).find(
      key => key.startsWith('__reactEventHandlers$') || key.startsWith('__reactProps$')
    );
    const handlers = reactKey ? (element as any)[reactKey] : null;

    if (typeof handlers?.onChange !== 'function') return;

    handlers.onChange({
      target: element,
      currentTarget: element,
      type: 'change',
      nativeEvent,
      bubbles: true,
      cancelable: true,
      defaultPrevented: false,
      isDefaultPrevented: () => false,
      isPropagationStopped: () => false,
      persist: () => {},
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
