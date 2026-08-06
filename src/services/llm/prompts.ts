import type { UserProfile, VisualRegionFillPayload } from '../../shared/types';
import type { ChatContentPart } from './types.ts';

export interface GenerateAnswerPayload {
  questionText: string;
  context?: string;
  fieldMaxLength?: number;
  language?: 'zh' | 'en';
}

export interface MatchFieldsPayload {
  fields: Array<{
    index: number;
    name: string;
    id: string;
    placeholder: string;
    labelText: string;
    type: string;
  }>;
  domain: string;
}

export interface AIFillSectionPayload {
  requestId: string;
  section: string;
  fields: Array<{
    index: number;
    rowIndex: number;
    name: string;
    label: string;
    type: string;
    options: string[];
    context: string;
  }>;
  domain: string;
}

export function buildAnswerGenerationPrompt(
  payload: GenerateAnswerPayload,
  profile: UserProfile
): { system: string; user: string } {
  const profileSummary = buildProfileSummary(profile);

  const system = `你是一个求职顾问AI，帮助求职者生成高质量的网申回答。
要求：
- 基于候选人的真实背景信息来生成回答
- 语言风格自然、专业、有说服力
- 突出候选人的优势和与岗位的匹配度
- 回答长度适中，不超过字数限制
- 使用第一人称
- 如果问题是中文就用中文回答，英文就用英文回答`;

  const user = `候选人背景信息：
${profileSummary}

应聘上下文：${payload.context || '未知'}

问题：${payload.questionText}
${payload.fieldMaxLength ? `字数限制：${payload.fieldMaxLength}字以内` : ''}

请生成一段回答：`;

  return { system, user };
}

export function buildResumeParsingPrompt(rawText: string): { system: string; user: string } {
  const system = `你是简历解析专家。从给定的简历原文中提取结构化数据，输出严格的JSON格式。

输出格式要求：
{
  "personal": {
    "name": "姓名",
    "gender": "性别",
    "birthDate": "出生日期 (YYYY-MM，只有年份时填 YYYY)",
    "phone": "手机号",
    "email": "邮箱",
    "wechat": "微信号",
    "politicalStatus": "政治面貌",
    "ethnicity": "民族",
    "hometown": "籍贯",
    "currentAddress": "现居地",
    "selfEvaluation": "自我评价/个人总结"
  },
  "education": [
    {
      "school": "学校名称",
      "college": "学院/院系",
      "educationType": "学历类型/学习形式（如统招全日制、统招非全日制、海外及港澳台、自考、其他）",
      "major": "专业",
      "degree": "学历(高中/专科/本科/硕士/博士)",
      "startDate": "YYYY-MM",
      "endDate": "YYYY-MM",
      "gpa": "GPA或绩点"
    }
  ],
  "experience": [
    {
      "company": "公司名称",
      "position": "职位",
      "startDate": "YYYY-MM",
      "endDate": "YYYY-MM",
      "description": "工作描述",
      "achievements": "工作成果"
    }
  ],
  "projects": [
    {
      "name": "项目名称",
      "role": "角色",
      "startDate": "YYYY-MM",
      "endDate": "YYYY-MM",
      "description": "项目描述",
      "achievements": "项目成果",
      "technologies": "使用技术"
    }
  ],
  "skills": ["技能1", "技能2"]
}

规则：
- 只输出JSON，不要其他文字
- 缺失的字段填空字符串""，不要猜测或编造
- 日期统一为YYYY-MM格式；结束时间为在读/在职时填"至今"
- 教育/工作经历按时间倒序排列
- 原文来自PDF/Word提取，同一句话可能被硬换行拆到多行，请自行拼回完整句子
- 个人信息常无标签并排写在开头（如"中共党员 2002年5月"），需按取值本身判断字段归属
- 学校行常把学校、专业、学历、起止时间写在一行，需拆分到对应字段，不要整行填进school
- 公司名不一定含"公司/集团"（如"科大讯飞""美团快驴""BOSS直聘"），按机构名识别
- description保留该条经历下的完整工作内容，不要压缩成一句话
- 简历中确实没有的信息（如未写性别）必须留空，不得由姓名或其他字段推断`;

  const user = `请解析以下简历：

${rawText}`;

  return { system, user };
}

export function buildFieldMatchingPrompt(
  fields: MatchFieldsPayload['fields']
): { system: string; user: string } {
  const fieldTypes = [
    'name', 'gender', 'birthDate', 'phone', 'email', 'wechat', 'idCard',
    'selfEvaluation', 'school', 'college', 'educationType', 'major', 'degree', 'gpa', 'educationStartDate', 'graduationDate',
    'company', 'position', 'startDate', 'endDate', 'description', 'skills',
  ];

  const system = `你是一个表单字段分类器。给定表单字段的属性信息，判断每个字段属于哪种类型。

可选的字段类型有：${fieldTypes.join(', ')}

如果无法判断，标记为 "unknown"。
返回JSON格式：{ "字段index": "fieldType", ... }
只返回JSON，不要其他内容。`;

  const fieldsDescription = fields.map(f =>
    `[${f.index}] name="${f.name}" id="${f.id}" placeholder="${f.placeholder}" label="${f.labelText}" type="${f.type}"`
  ).join('\n');

  const user = `请分析以下表单字段：\n${fieldsDescription}`;

  return { system, user };
}

export function buildSectionFillPrompt(
  payload: AIFillSectionPayload,
  profile: UserProfile
): { system: string; user: string } {
  const system = `你是网申表单补填助手。根据候选人已有资料，为当前模块仍为空的字段选择对应值。

严格规则：
- 只能使用候选人资料中明确存在的信息，不得编造学校、公司、日期、证件、成绩或经历
- rowIndex 从 0 开始，教育/实习/项目字段必须优先匹配资料中相同序号的记录
- 如果字段提供 options，返回值必须与其中一个选项完全一致
- 无法确定时返回空字符串
- 日期使用 YYYY-MM
- 只返回严格 JSON，格式为 {"字段index": "值"}，不要解释、不要 Markdown`;

  const user = `网站：${payload.domain}
模块：${payload.section}

候选人已有资料：
${JSON.stringify(profile, null, 2)}

待补填字段：
${JSON.stringify(payload.fields, null, 2)}

请返回字段 index 到填写值的 JSON 映射。`;

  return { system, user };
}

export function buildVisualRegionFillPrompt(
  payload: VisualRegionFillPayload,
  profile: UserProfile
): { system: string; userParts: ChatContentPart[] } {
  const system = `你是网申视觉补填助手。截图是主语义输入，controls 是唯一允许输出目标。

严格规则：
- 只能输出已有 controlId，且每条映射必须对应传入的 controls
- 只能使用候选人资料中已经存在的原始值，不得猜测、改写、归纳或编造
- 如果控件提供 options，value 必须与某个选项完全一致
- 无法确定时不要猜，直接返回空字符串
- 只返回严格 JSON，格式为 {"mappings":[{"controlId":"","fieldMeaning":"","matchedProfilePath":"","value":""}]}
- 不要输出解释、Markdown、代码块或额外字段`;

  const sections = [
    payload.requestId ? `requestId: ${payload.requestId}` : '',
    payload.domain ? `网站：${payload.domain}` : '',
    payload.instruction ? `补充指令：${payload.instruction}` : '',
    payload.targetLabel ? `目标标签：${payload.targetLabel}` : '',
    payload.pageContext ? `页面上下文：${payload.pageContext}` : '',
    `候选人资料：\n${JSON.stringify(profile, null, 2)}`,
    `控件清单（只允许输出这些 controlId）：\n${JSON.stringify(payload.controls ?? [], null, 2)}`,
    '请结合截图与控件清单，返回 JSON：{"mappings":[...]}。',
  ].filter(Boolean);

  const userParts: ChatContentPart[] = [
    { type: 'text', text: sections.join('\n\n') },
  ];

  if (payload.image) {
    userParts.push({
      type: 'image',
      mimeType: payload.image.mimeType,
      data: payload.image.base64,
    });
  }

  return { system, userParts };
}

function buildProfileSummary(profile: UserProfile): string {
  const parts: string[] = [];

  if (profile.personal.name) parts.push(`姓名：${profile.personal.name}`);
  if (profile.personal.selfEvaluation) {
    parts.push(`自我评价：${profile.personal.selfEvaluation}`);
  }

  if (profile.education.length > 0) {
    const edu = profile.education[0];
    parts.push(`教育：${edu.school} ${edu.major} ${edu.degree}`);
  }

  if (profile.experience.length > 0) {
    parts.push('工作经历：');
    for (const exp of profile.experience.slice(0, 3)) {
      parts.push(`- ${exp.company} | ${exp.position} | ${exp.description || ''}`);
    }
  }

  if (profile.projects.length > 0) {
    parts.push('项目经历：');
    for (const proj of profile.projects.slice(0, 3)) {
      parts.push(`- ${proj.name} | ${proj.role} | ${proj.description || ''}`);
    }
  }

  if (profile.skills.length > 0) {
    parts.push(`技能：${profile.skills.join(', ')}`);
  }

  return parts.join('\n');
}
