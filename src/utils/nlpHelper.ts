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

    for (const skill of commonSkills) {
      const regex = new RegExp(skill, 'gi');
      if (regex.test(text)) {
        skills.push(skill);
      }
    }

    return [...new Set(skills)];
  }

  // 从简历文本中提取结构化数据
  static parseResumeText(text: string): ParsedResumeData {
    const phones = this.extractPhone(text);
    const emails = this.extractEmail(text);
    const dates = this.extractDates(text);
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

    // 尝试提取姓名（通常在简历开头）
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      // 如果第一行很短（2-4个字符）且不包含其他信息，可能是姓名
      if (firstLine.length >= 2 && firstLine.length <= 10 && !phones.includes(firstLine) && !emails.includes(firstLine)) {
        personal.name = firstLine;
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
