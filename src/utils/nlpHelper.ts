import type { ParsedResumeData, PersonalInfo, EducationInfo, ExperienceInfo } from '../shared/types';

export class NLPHelper {
  // 提取手机号
  static extractPhone(text: string): string[] {
    const phoneRegex = /1[3-9]\d{9}/g;
    return text.match(phoneRegex) || [];
  }

  // 提取邮箱
  static extractEmail(text: string): string[] {
    const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
    return text.match(emailRegex) || [];
  }

  // 提取日期
  static extractDates(text: string): string[] {
    const datePatterns = [
      /\d{4}[年\-./]\d{1,2}[月\-./]?\d{0,2}[日]?/g,
      /\d{4}\.\d{1,2}/g,
      /\d{4}-\d{1,2}/g
    ];

    const dates: string[] = [];
    for (const pattern of datePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        dates.push(...matches);
      }
    }

    return [...new Set(dates)];
  }

  // 提取学校名称
  static extractSchools(text: string): string[] {
    const schoolKeywords = [
      '大学', '学院', 'University', 'College', 'Institute',
      '理工', '师范', '医学院', '科技'
    ];

    const schools: string[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
      for (const keyword of schoolKeywords) {
        if (line.includes(keyword)) {
          // 提取包含关键词的整行或附近的文本
          const trimmedLine = line.trim();
          if (trimmedLine.length > 0 && trimmedLine.length < 100) {
            schools.push(trimmedLine);
            break;
          }
        }
      }
    }

    return [...new Set(schools)];
  }

  // 提取公司名称
  static extractCompanies(text: string): string[] {
    const companyKeywords = [
      '公司', '集团', '科技', '有限', 'Ltd', 'Inc', 'Corp',
      'Technology', 'Corporation', '股份'
    ];

    const companies: string[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
      for (const keyword of companyKeywords) {
        if (line.includes(keyword)) {
          const trimmedLine = line.trim();
          if (trimmedLine.length > 0 && trimmedLine.length < 100) {
            companies.push(trimmedLine);
            break;
          }
        }
      }
    }

    return [...new Set(companies)];
  }

  // 提取技能
  static extractSkills(text: string): string[] {
    const commonSkills = [
      'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'Go', 'Rust',
      'React', 'Vue', 'Angular', 'Node.js', 'Spring', 'Django', 'Flask',
      'HTML', 'CSS', 'SQL', 'MongoDB', 'Redis', 'MySQL', 'PostgreSQL',
      'Git', 'Docker', 'Kubernetes', 'Linux', 'AWS', 'Azure',
      'TensorFlow', 'PyTorch', 'Machine Learning', 'Deep Learning'
    ];

    const skills: string[] = [];

    // 技能名可能含正则元字符（如 C++、Node.js），需转义后再匹配
    const lowerText = text.toLowerCase();
    for (const skill of commonSkills) {
      if (lowerText.includes(skill.toLowerCase())) {
        skills.push(skill);
      }
    }

    return [...new Set(skills)];
  }

  /**
   * 提取「标签: 值」形式的个人字段。
   * 兼容中英文冒号、Markdown 列表符号，以及「状态」这类
   * 简历编辑器用来存放政治面貌的字段名。
   */
  static extractLabeledFields(text: string): Partial<PersonalInfo> {
    const result: Partial<PersonalInfo> = {};

    // 标签别名 -> PersonalInfo 字段
    const labelMap: Array<[RegExp, keyof PersonalInfo]> = [
      [/(?:政治面貌|政治状态|党派|状态)/, 'politicalStatus'],
      [/(?:出生日期|出生年月|生日|生年月日)/, 'birthDate'],
      [/(?:性别)/, 'gender'],
      [/(?:民族)/, 'ethnicity'],
      [/(?:籍贯|户籍|户口所在地)/, 'hometown'],
      [/(?:现居地|现居住地|所在地|居住地|现住址)/, 'currentAddress'],
      [/(?:微信|微信号|WeChat)/i, 'wechat'],
      [/(?:身份证号?码?|身份证)/, 'idCard'],
      [/(?:姓名|名字)/, 'name'],
    ];

    for (const rawLine of text.split('\n')) {
      // 去掉 Markdown 列表符号与多余空白
      const line = rawLine.replace(/^[\s\-*•]+/, '').trim();
      if (!line) continue;

      const match = line.match(/^([^:：]{1,10})[:：]\s*(.+)$/);
      if (!match) continue;

      const label = match[1].trim();
      const value = match[2].trim();
      if (!value || value.length > 60) continue;

      for (const [pattern, field] of labelMap) {
        if (pattern.test(label) && !result[field]) {
          // 「状态」只在值确实是政治面貌时才采纳，避免误收「在职」等
          if (field === 'politicalStatus' && /^状态$/.test(label)
              && !/(党员|团员|群众|民主党派)/.test(value)) {
            break;
          }
          result[field] = value;
          break;
        }
      }
    }

    return result;
  }

  // 从简历文本中提取结构化数据
  static parseResumeText(text: string): ParsedResumeData {
    const phones = this.extractPhone(text);
    const emails = this.extractEmail(text);
    const schools = this.extractSchools(text);
    const companies = this.extractCompanies(text);
    const skills = this.extractSkills(text);

    // 构建个人信息
    const personal: Partial<PersonalInfo> = {};
    if (phones.length > 0) {
      personal.phone = phones[0];
    }
    if (emails.length > 0) {
      personal.email = emails[0];
    }

    // 提取「标签: 值」形式的字段（简历常见写法，如「生日: 2002年5月」）
    Object.assign(personal, this.extractLabeledFields(text));

    // 尝试提取姓名。标签式（姓名: xxx）已在上一步处理，此处按位置推断。
    if (!personal.name) {
      const lines = text.split('\n')
        .map(l => l.replace(/^#+\s*/, '').trim())
        .filter(l => l.length > 0);

      // 文档标题常为「XXX的个人简历」，可从中反推姓名
      for (const line of lines.slice(0, 8)) {
        const titleMatch = line.match(/^(.{2,4})的(?:个人)?简历/);
        if (titleMatch) {
          personal.name = titleMatch[1];
          break;
        }
      }

      // 否则取靠前的一个短行（排除章节标题与联系方式）
      if (!personal.name) {
        const sectionWords = /(简历|基本信息|教育|实习|工作|经历|技能|项目|评价|校园|获奖)/;
        for (const line of lines.slice(0, 8)) {
          if (line.length >= 2 && line.length <= 6
              && !sectionWords.test(line)
              && !/[:：@\d]/.test(line)) {
            personal.name = line;
            break;
          }
        }
      }
    }

    // 构建教育经历
    const education: Partial<EducationInfo>[] = schools.map((school, index) => ({
      id: `edu-${index}`,
      school: school,
      major: '',
      degree: '',
      startDate: '',
      endDate: ''
    }));

    // 构建工作经历
    const experience: Partial<ExperienceInfo>[] = companies.map((company, index) => ({
      id: `exp-${index}`,
      company: company,
      position: '',
      startDate: '',
      endDate: '',
      description: ''
    }));

    return {
      personal: Object.keys(personal).length > 0 ? personal : undefined,
      education: education.length > 0 ? education : undefined,
      experience: experience.length > 0 ? experience : undefined,
      skills: skills.length > 0 ? skills : undefined,
      rawText: text
    };
  }

  // 清理和标准化文本
  static cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/[\r\n]+/g, '\n')
      .trim();
  }

  // 提取特定部分的内容
  static extractSection(text: string, sectionName: string): string {
    const sectionPatterns = [
      new RegExp(`${sectionName}[：:\\s]*([\\s\\S]*?)(?=\\n[一二三四五六七八九十]+[、.、]|\\n[A-Z][a-z]+|$)`, 'i'),
      new RegExp(`${sectionName}[：:\\s]*([\\s\\S]*?)(?=\\n\\n|$)`, 'i')
    ];

    for (const pattern of sectionPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return '';
  }
}
