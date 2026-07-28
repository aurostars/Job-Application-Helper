import type { ParsedResumeData } from '../shared/types';

/**
 * 简历 JSON 解析器
 *
 * 支持在线简历编辑器导出的 JSON（含 basic / education / experience /
 * projects / skillContent 等字段）。由于数据本身已结构化，直接映射即可，
 * 无需 LLM 或正则推断，准确率最高且不消耗 API 额度。
 */

/** 富文本字段可能含 HTML 标签，转为纯文本 */
function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 拆分 "2024.09 - 2027.06" / "2026/03 - 2026/07" 这类日期区间 */
function splitDateRange(date: string): { startDate: string; endDate: string } {
  if (!date) return { startDate: '', endDate: '' };
  const parts = date.split(/\s*[-—~至]\s*/);
  return {
    startDate: (parts[0] || '').trim(),
    endDate: (parts[1] || '').trim(),
  };
}

/** 取首行并截断，用作缺失标题时的兜底名称 */
function firstLine(text: string): string {
  const line = text.split('\n').find(l => l.trim())?.trim() ?? '';
  return line.length > 40 ? line.slice(0, 40) + '…' : line;
}

/** 中共党员等政治面貌关键词，用于从 employementStatus 中识别 */
const POLITICAL_KEYWORDS = ['中共党员', '预备党员', '共青团员', '群众', '党员'];

export function parseResumeJSON(jsonText: string): ParsedResumeData {
  let data: any;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error('JSON 格式有误，无法解析。请确认文件内容是合法的 JSON。');
  }

  if (!data || typeof data !== 'object') {
    throw new Error('JSON 内容不是有效的简历对象。');
  }

  const basic = data.basic ?? {};
  const status: string = basic.employementStatus ?? '';

  const personal: ParsedResumeData['personal'] = {
    name: basic.name || '',
    birthDate: basic.birthDate || '',
    phone: basic.phone || '',
    email: basic.email || '',
    currentAddress: basic.location || '',
  };

  // employementStatus 在该编辑器中常被用来填政治面貌
  if (POLITICAL_KEYWORDS.some(k => status.includes(k))) {
    personal.politicalStatus = status;
  }

  // 自定义字段可能包含微信、籍贯等信息
  for (const field of basic.customFields ?? []) {
    const label: string = field?.label ?? '';
    const value: string = field?.value ?? '';
    if (!value) continue;
    if (label.includes('微信')) personal.wechat = value;
    else if (label.includes('籍贯')) personal.hometown = value;
    else if (label.includes('性别')) personal.gender = value;
    else if (label.includes('民族')) personal.ethnicity = value;
  }

  // 注意：不按 visible 过滤。visible=false 只表示该条目在简历排版中被隐藏，
  // 经历本身依然真实存在，网申填表时可能需要，故一并导入。
  const education = (data.education ?? [])
    .map((e: any) => ({
      id: e.id || crypto.randomUUID(),
      school: e.school || '',
      major: e.major || '',
      degree: e.degree || '',
      startDate: e.startDate || '',
      endDate: e.endDate || '',
      gpa: e.gpa || '',
      achievements: stripHtml(e.description || ''),
    }));

  const experience = (data.experience ?? [])
    .map((e: any) => {
      const { startDate, endDate } = splitDateRange(e.date || '');
      return {
        id: e.id || crypto.randomUUID(),
        company: e.company || '',
        position: e.position || '',
        startDate,
        endDate,
        description: stripHtml(e.details || ''),
      };
    });

  const projects = (data.projects ?? [])
    .map((p: any) => {
      const { startDate, endDate } = splitDateRange(p.date || '');
      const description = stripHtml(p.description || '');
      return {
        id: p.id || crypto.randomUUID(),
        // 该编辑器允许项目名留空，此时用描述首行兜底，避免条目不可辨识
        name: p.name || firstLine(description),
        role: p.role || '',
        startDate,
        endDate,
        description,
        achievements: '',
      };
    })
    // 完全空白的占位条目才丢弃
    .filter((p: any) => p.name || p.description);

  const skills = parseSkills(data.skillContent || '');

  return {
    personal,
    education,
    experience,
    projects,
    skills,
    rawText: buildRawText(data, personal, education, experience, projects, skills),
  };
}

/**
 * 技能字段是富文本，形态不固定：可能是列表（每行一项），
 * 也可能是整段叙述性文字。后者按标点切分会破坏语义，
 * 因此仅在明显为列表时逐项拆分，否则按行保留。
 */
function parseSkills(skillContent: string): string[] {
  const text = stripHtml(skillContent);
  if (!text) return [];

  const lines = text
    .split('\n')
    .map(l => l.replace(/^[•\-\*\s]+/, '').trim())
    .filter(Boolean);

  return lines
    .flatMap(line => {
      // 句末有句号或长度较长，视为叙述性文字，整句保留
      const isSentence = /[。；;]\s*$/.test(line) || line.length > 30;
      if (isSentence) return [line];
      return line.split(/[、,，]/).map(s => s.trim()).filter(Boolean);
    })
    .filter(s => s.length > 0 && s.length <= 200);
}

/** 生成纯文本版本，供表单语义匹配与「已解析内容」预览使用 */
function buildRawText(
  data: any,
  personal: any,
  education: any[],
  experience: any[],
  projects: any[],
  skills: string[]
): string {
  const lines: string[] = [];

  lines.push(`姓名：${personal.name}`);
  if (personal.birthDate) lines.push(`出生日期：${personal.birthDate}`);
  if (personal.phone) lines.push(`电话：${personal.phone}`);
  if (personal.email) lines.push(`邮箱：${personal.email}`);
  if (personal.politicalStatus) lines.push(`政治面貌：${personal.politicalStatus}`);
  if (personal.currentAddress) lines.push(`所在地：${personal.currentAddress}`);

  if (education.length) {
    lines.push('', '【教育经历】');
    for (const e of education) {
      lines.push(`${e.startDate} - ${e.endDate} ${e.school} ${e.major} ${e.degree}`.trim());
      if (e.gpa) lines.push(`GPA：${e.gpa}`);
      if (e.achievements) lines.push(e.achievements);
    }
  }

  if (experience.length) {
    lines.push('', '【工作/实习经历】');
    for (const e of experience) {
      lines.push(`${e.startDate} - ${e.endDate} ${e.company} ${e.position}`.trim());
      if (e.description) lines.push(e.description);
    }
  }

  if (projects.length) {
    lines.push('', '【项目经历】');
    for (const p of projects) {
      lines.push(`${p.startDate} - ${p.endDate} ${p.name} ${p.role}`.trim());
      if (p.description) lines.push(p.description);
    }
  }

  if (skills.length) {
    lines.push('', '【技能】', skills.join('、'));
  }

  const selfEval = stripHtml(data.selfEvaluationContent || '');
  if (selfEval) lines.push('', '【自我评价】', selfEval);

  return lines.filter(l => l !== undefined).join('\n').trim();
}
