import type {
  ParsedResumeData,
  PersonalInfo,
  EducationInfo,
  ExperienceInfo,
  ProjectInfo,
} from '../shared/types';

/** 简历章节类型 */
export type SectionKind =
  | 'basic'
  | 'education'
  | 'experience'
  | 'project'
  | 'campus'
  | 'skills'
  | 'selfEvaluation'
  | 'award'
  | 'other';

export interface ResumeSection {
  kind: SectionKind;
  title: string;
  lines: string[];
}

/**
 * 章节标题识别规则。顺序有意义：先匹配更具体的标题
 * （如「实习经历」要在「经历」之前，「项目经历」要在「实习」之前）。
 */
const SECTION_RULES: Array<[RegExp, SectionKind]> = [
  [/^(?:自我评价|个人评价|自我介绍|个人总结|自我总结)$/, 'selfEvaluation'],
  [/^(?:专业技能|技能特长|技能清单|个人技能|IT技能|专业能力|技能)$/i, 'skills'],
  [/^(?:教育经历|教育背景|学历|学习经历|教育情况)$/, 'education'],
  [/^(?:项目经历|项目经验|项目实践|科研经历|研究经历)$/, 'project'],
  [/^(?:实习经历|实习经验|工作经历|工作经验|职业经历|实践经历|工作履历)$/, 'experience'],
  [/^(?:校园经历|在校经历|校内经历|学生工作|社团经历|社会实践)$/, 'campus'],
  [/^(?:获奖(?:情况|经历)?|荣誉奖项|奖励荣誉|证书|资格证书)$/, 'award'],
  [/^(?:基本信息|个人信息|个人资料|联系方式)$/, 'basic'],
];

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

  /**
   * 按章节标题把简历切段。
   * 标题行的判断依据：整行（去掉装饰符号后）恰好等于某个已知章节名。
   */
  static splitSections(text: string): ResumeSection[] {
    const sections: ResumeSection[] = [];
    let current: ResumeSection = { kind: 'basic', title: '', lines: [] };

    for (const rawLine of text.split('\n')) {
      // 去掉列表符号、下划线装饰与首尾空白
      const line = rawLine.replace(/^[\s\-*•·|]+/, '').replace(/[\s_=—–-]+$/, '').trim();
      if (!line) continue;

      const heading = line.replace(/^#+\s*/, '').replace(/[:：]$/, '').replace(/\s+/g, '');
      const matched = heading.length <= 12
        ? SECTION_RULES.find(([pattern]) => pattern.test(heading))
        : undefined;

      if (matched) {
        if (current.lines.length > 0 || current.title) sections.push(current);
        current = { kind: matched[1], title: heading, lines: [] };
        continue;
      }

      current.lines.push(line);
    }

    if (current.lines.length > 0 || current.title) sections.push(current);

    return sections;
  }

  /** 从一行中抽出起止日期，返回归一化的 YYYY-MM 与去掉日期后的剩余文本 */
  static extractDateRange(line: string): {
    startDate: string;
    endDate: string;
    rest: string;
  } {
    // 2024/09 - 2027/06、2025.10-2026.01、2023年10月至今、2020-09 ~ 2024-06
    const rangeRegex =
      /(\d{4})\s*[年./-]\s*(\d{1,2})\s*月?\s*(?:-|~|—|–|to|至|～)\s*(?:(\d{4})\s*[年./-]\s*(\d{1,2})\s*月?|(至今|现在|now|present))/i;

    const match = line.match(rangeRegex);
    if (match) {
      const pad = (v: string) => v.padStart(2, '0');
      const startDate = `${match[1]}-${pad(match[2])}`;
      const endDate = match[3] ? `${match[3]}-${pad(match[4])}` : '至今';
      return { startDate, endDate, rest: line.replace(match[0], ' ').trim() };
    }

    return { startDate: '', endDate: '', rest: line };
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

  /**
   * 解析教育经历章节。
   * 典型行：「北京师范大学 理论经济学专业 · 硕士 2024/09 - 2027/06」
   * 学校、专业、学历、日期的先后顺序不固定，因此按特征各自识别，
   * 而不是依赖位置切分。
   */
  static parseEducationSection(lines: string[]): Partial<EducationInfo>[] {
    const degreeRegex = /(博士后|博士|硕士|研究生|本科|学士|大专|专科|高中|中专|MBA|EMBA)/;
    const schoolRegex = /(大学|学院|学校|University|College|Institute|School)/i;
    const entries: Partial<EducationInfo>[] = [];

    for (const line of lines) {
      const { startDate, endDate, rest } = NLPHelper.extractDateRange(line);
      if (!schoolRegex.test(rest)) continue;

      // 以分隔符切成若干片段，逐片判定角色
      const parts = rest
        .split(/[·|｜,，、\s]+|\s{2,}/)
        .map(p => p.trim())
        .filter(Boolean);

      let school = '';
      let college = '';
      let major = '';
      let degree = '';
      let gpa = '';

      for (const part of parts) {
        const gpaMatch = part.match(/(?:GPA|绩点|均分|平均分)[:：\s]*([\d.]+(?:\/[\d.]+)?)/i);
        if (gpaMatch) {
          gpa ||= gpaMatch[1];
          continue;
        }
        if (!degree && degreeRegex.test(part) && part.length <= 8) {
          degree = (part.match(degreeRegex) as RegExpMatchArray)[1];
          const remainder = part.replace(degreeRegex, '').trim();
          if (remainder && !major && /专业/.test(remainder)) major = remainder;
          continue;
        }
        if (!school && schoolRegex.test(part)) {
          // 「XX大学XX学院」拆成学校与学院
          const collegeMatch = part.match(/^(.*?(?:大学|University))(.+?(?:学院|系|School))$/i);
          if (collegeMatch) {
            school = collegeMatch[1].trim();
            college = collegeMatch[2].trim();
          } else {
            school = part;
          }
          continue;
        }
        if (!college && /(?:学院|系|School)$/i.test(part) && school) {
          college = part;
          continue;
        }
        if (!major && /专业/.test(part)) {
          major = part.replace(/专业$/, '').trim();
          continue;
        }
        // 没有「专业」字样时，取一个不含日期与学历的短片段兜底
        if (!major && part.length <= 20 && !/\d/.test(part) && !degreeRegex.test(part)) {
          major = part;
        }
      }

      if (!school) continue;

      entries.push({
        id: `edu-${entries.length}`,
        school,
        ...(college ? { college } : {}),
        major,
        degree,
        startDate,
        endDate,
        ...(gpa ? { gpa } : {}),
      });
    }

    return entries;
  }

  /**
   * 解析实习/工作经历章节。
   * 条目头部行的特征是含起止日期（如「科大讯飞 AI产品经理 2026/03 - 2026/06」），
   * 其后不含日期的行归为该条目的描述。这样不依赖公司名关键词，
   * 「科大讯飞」「美团快驴」「BOSS直聘」这类不含「公司/集团」的名称也能识别。
   */
  static parseExperienceSection(lines: string[]): Partial<ExperienceInfo>[] {
    const entries: Partial<ExperienceInfo>[] = [];
    let currentDescription: string[] = [];

    const flushDescription = () => {
      if (entries.length > 0 && currentDescription.length > 0) {
        entries[entries.length - 1].description = currentDescription.join('\n');
      }
      currentDescription = [];
    };

    for (const line of lines) {
      const { startDate, endDate, rest } = NLPHelper.extractDateRange(line);

      // 含日期且剩余部分较短 → 视为新条目的头部行
      if (startDate && rest.length <= 40) {
        flushDescription();

        const parts = rest.split(/[|｜·，,、\s]{1,}/).map(p => p.trim()).filter(Boolean);
        const { company, position } = NLPHelper.splitCompanyPosition(parts);

        entries.push({
          id: `exp-${entries.length}`,
          company,
          position,
          startDate,
          endDate,
          description: '',
        });
        continue;
      }

      if (entries.length > 0) currentDescription.push(line);
    }

    flushDescription();

    return entries;
  }

  /**
   * 从头部行的片段中区分公司名与职位。
   *
   * 不能只看是否含职位关键词：「国务院发展研究中心大数据研究院」含「研究」，
   * 会被误判成职位。因此优先用机构特征词锚定公司，职位则要求关键词落在
   * 片段末尾（中文职位名几乎都以职级词收尾）。
   */
  static splitCompanyPosition(parts: string[]): { company: string; position: string } {
    // 以职级词结尾才算职位名
    const positionRegex =
      /(经理|主管|总监|工程师|开发|设计师|运营|实习生|实习|助理|专员|顾问|分析师|研究员|销售|测试|讲师|教师|研究|策划|编辑|BP|HRBP|HR|PM|PMO|CEO|CTO|COO)$/i;
    // 机构特征词：出现即优先判为公司
    const orgRegex =
      /(公司|集团|有限|股份|中心|研究院|研究所|学院|大学|银行|事务所|工作室|实验室|部|局|署|厅|委|社|台|网|Ltd|Inc|Corp|LLC|Group|Technology|Technologies)$/i;

    if (parts.length === 0) return { company: '', position: '' };
    if (parts.length === 1) {
      return orgRegex.test(parts[0]) || !positionRegex.test(parts[0])
        ? { company: parts[0], position: '' }
        : { company: '', position: parts[0] };
    }

    // 机构特征词命中的片段直接作为公司，其余合并成职位
    const orgIndex = parts.findIndex(p => orgRegex.test(p));
    if (orgIndex !== -1) {
      return {
        company: parts[orgIndex],
        position: parts.filter((_, i) => i !== orgIndex).join(' '),
      };
    }

    // 否则找以职级词结尾的片段当职位，取最后一个命中项
    // （「科大讯飞 AI产品经理」里只有后者以「经理」结尾）
    let positionIndex = -1;
    for (let i = parts.length - 1; i >= 0; i--) {
      if (positionRegex.test(parts[i])) {
        positionIndex = i;
        break;
      }
    }

    if (positionIndex === -1) {
      return { company: parts[0], position: parts.slice(1).join(' ') };
    }

    return {
      position: parts[positionIndex],
      company: parts.filter((_, i) => i !== positionIndex).join(' '),
    };
  }

  /** 解析项目经历章节，规则与工作经历一致，仅字段名不同 */
  static parseProjectSection(lines: string[]): Partial<ProjectInfo>[] {
    return NLPHelper.parseExperienceSection(lines).map((exp, index) => ({
      id: `proj-${index}`,
      name: exp.company || '',
      role: exp.position || '',
      startDate: exp.startDate || '',
      endDate: exp.endDate || '',
      description: exp.description || '',
      achievements: '',
    }));
  }

  /**
   * 从技能章节文本中拆出技能条目。
   *
   * 技能章节常写成整句（「运用SQL、Python进行数据分析」），
   * 直接按顿号切会得到「SPSS进行数据提取」这类残句，
   * 因此切分后要裁掉动词短语并丢弃仍像句子的片段。
   */
  static parseSkillsSection(lines: string[]): string[] {
    const skills: string[] = [];

    for (const line of lines) {
      // 「常用办公软件：Excel、Word」→ 取冒号后的部分
      const colonIndex = Math.max(line.indexOf('：'), line.indexOf(':'));
      const afterColon = colonIndex >= 0 ? line.slice(colonIndex + 1) : line;

      for (const candidate of afterColon.split(/[、,，/;；]/)) {
        const cleaned = candidate
          .trim()
          // 去掉开头的动词（熟练运用 SQL → SQL）
          .replace(/^(?:熟练|熟悉|掌握|了解|精通|擅长|能够|运用|使用|常用|具备)+/, '')
          // 截断到动词短语之前（SPSS进行数据提取 → SPSS）
          .split(/(?:进行|用于|完成|实现|开发了?|绘制|提高)/)[0]
          // 去掉列举尾巴（Claude Code等AI工具 → Claude Code）
          .replace(/等[^、,，]*$/, '')
          .replace(/[。；、，]+$/, '')
          .trim();

        if (!cleaned || cleaned.length > 16) continue;
        // 仍含句子成分（的/是/有/和/与…）说明不是技能名
        if (/[的是有并及和与或对]|[。；！？]/.test(cleaned)) continue;
        if (!/[A-Za-z0-9一-龥]/.test(cleaned)) continue;

        skills.push(cleaned);
      }
    }

    return [...new Set(skills)];
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

  /**
   * 提取无标签的个人字段。
   * 很多简历模板把信息直接并排写在页眉，如「中共党员 2002年5月」，
   * 没有「政治面貌:」这类标签，只能按值本身的特征识别。
   * 仅在文本靠前的区域查找，避免正文里的词被误当作个人信息。
   */
  static extractUnlabeledFields(text: string, headLines = 12): Partial<PersonalInfo> {
    const result: Partial<PersonalInfo> = {};
    const head = text.split('\n').slice(0, headLines).join('\n');

    const politicalMatch = head.match(
      /(中共党员|中共预备党员|预备党员|共青团员|中共党员\(预备\)|党员|团员|群众|民主党派|无党派)/
    );
    if (politicalMatch) result.politicalStatus = politicalMatch[1];

    // 出生日期：2002年5月 / 2002.05 / 2002-05；排除明显是学历起止年份的范围
    const birthMatch = head.match(/(?<!\d)(19[5-9]\d|20[0-2]\d)\s*[年.\-/]\s*(\d{1,2})\s*月?(?!\s*[-~—–至])/);
    if (birthMatch) {
      result.birthDate = `${birthMatch[1]}-${birthMatch[2].padStart(2, '0')}`;
    }

    // 性别：作为独立词出现（前后是分隔符或行首行尾），避免匹配「男装」「女装」等
    const genderMatch = head.match(/(?:^|[\s|｜/·,，、])([男女])(?:$|[\s|｜/·,，、])/m);
    if (genderMatch) result.gender = genderMatch[1];

    const ethnicityMatch = head.match(/([一-龥]{1,4})族(?![\s\S]{0,2}自治)/);
    if (ethnicityMatch) result.ethnicity = `${ethnicityMatch[1]}族`;

    const idMatch = head.match(/(?<!\d)(\d{17}[\dXx])(?!\d)/);
    if (idMatch) result.idCard = idMatch[1];

    return result;
  }

  /**
   * 姓名候选：短、无标点数字、不是章节标题，
   * 也不能是政治面貌/性别/民族/婚育状况这类会与姓名并排出现的取值。
   */
  private static looksLikeName(line: string): boolean {
    const sectionWords =
      /(简历|基本信息|教育|实习|工作|经历|技能|项目|评价|校园|获奖|荣誉|证书|联系)/;
    // 页眉里常见的非姓名取值，如「中共党员 2002年5月」
    const fieldValues =
      /^(?:中共)?(?:预备)?党员$|^共青团员$|^团员$|^群众$|^民主党派$|^无党派$|^[男女]$|^.{1,3}族$|^(?:已|未)婚(?:已育|未育)?$|^汉$/;

    return (
      line.length >= 2 &&
      line.length <= 6 &&
      !sectionWords.test(line) &&
      !fieldValues.test(line) &&
      !/[:：@\d]/.test(line)
    );
  }

  /**
   * 从简历文本中提取结构化数据。
   *
   * 以章节为单位解析：先按标题切段，再用各段专属规则处理。
   * 这样「大学生创业训练计划」不会因为含「大学」被当成学校，
   * 描述文字也不会混进公司名。识别不到任何章节标题时，
   * 退回到全文关键词扫描。
   */
  static parseResumeText(text: string): ParsedResumeData {
    const sections = this.splitSections(text);
    const hasSections = sections.some(s => s.kind !== 'basic' && s.kind !== 'other');

    // 联系方式在全文任意位置都可能出现，直接全文扫描
    const personal: Partial<PersonalInfo> = {};
    const phones = this.extractPhone(text);
    const emails = this.extractEmail(text);
    if (phones.length > 0) personal.phone = phones[0];
    if (emails.length > 0) personal.email = emails[0];

    // 「标签: 值」优先，其次才是无标签的特征识别，避免覆盖更可靠的结果
    Object.assign(personal, this.extractUnlabeledFields(text));
    Object.assign(personal, this.extractLabeledFields(text));

    if (!personal.name) {
      const nameFromTitle = this.inferName(text);
      if (nameFromTitle) personal.name = nameFromTitle;
    }

    let education: Partial<EducationInfo>[] = [];
    let experience: Partial<ExperienceInfo>[] = [];
    let projects: Partial<ProjectInfo>[] = [];
    let skills: string[] = [];

    for (const section of sections) {
      switch (section.kind) {
        case 'education':
          education.push(...this.parseEducationSection(section.lines));
          break;
        case 'experience':
          experience.push(...this.parseExperienceSection(section.lines));
          break;
        case 'project':
          projects.push(...this.parseProjectSection(section.lines));
          break;
        case 'skills':
          skills.push(...this.parseSkillsSection(section.lines));
          break;
        case 'selfEvaluation':
          if (!personal.selfEvaluation && section.lines.length > 0) {
            personal.selfEvaluation = section.lines.join('');
          }
          break;
        default:
          break;
      }
    }

    // 重新编号，多个同类章节合并后 id 才不会重复
    education = education.map((e, i) => ({ ...e, id: `edu-${i}` }));
    experience = experience.map((e, i) => ({ ...e, id: `exp-${i}` }));
    projects = projects.map((p, i) => ({ ...p, id: `proj-${i}` }));

    // 没有章节标题的简历退回全文扫描。学校行同样带日期范围，
    // 若不先剔除会被工作经历解析器当成一条经历，故按行分流。
    if (!hasSections) {
      const allLines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const educationLines: string[] = [];
      const otherLines: string[] = [];

      for (const line of allLines) {
        if (this.parseEducationSection([line]).length > 0) {
          educationLines.push(line);
        } else {
          otherLines.push(line);
        }
      }

      if (education.length === 0) {
        education = this.parseEducationSection(educationLines)
          .map((e, i) => ({ ...e, id: `edu-${i}` }));
      }
      if (experience.length === 0) {
        experience = this.parseExperienceSection(otherLines)
          .map((e, i) => ({ ...e, id: `exp-${i}` }));
      }
    }

    if (skills.length === 0) skills = this.extractSkills(text);

    return {
      personal: Object.keys(personal).length > 0 ? personal : undefined,
      education: education.length > 0 ? education : undefined,
      experience: experience.length > 0 ? experience : undefined,
      projects: projects.length > 0 ? projects : undefined,
      skills: skills.length > 0 ? skills : undefined,
      rawText: text
    };
  }

  /** 从标题或靠前的短行推断姓名 */
  private static inferName(text: string): string {
    const lines = text.split('\n')
      .map(l => l.replace(/^#+\s*/, '').trim())
      .filter(l => l.length > 0);

    // 文档标题常为「XXX的个人简历」，可从中反推姓名
    for (const line of lines.slice(0, 8)) {
      const titleMatch = line.match(/^(.{2,4})的(?:个人)?简历/);
      if (titleMatch) return titleMatch[1];
    }

    // 页眉常把姓名与联系方式排在一行，如「董星 dst3056@qq.com 1980...」
    for (const line of lines.slice(0, 8)) {
      const first = line.split(/[\s|｜/·,，、]+/)[0]?.trim();
      if (first && this.looksLikeName(first)) return first;
    }

    return '';
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
