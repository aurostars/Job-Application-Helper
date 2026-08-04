import assert from 'node:assert/strict';
import test from 'node:test';
import { NLPHelper } from './nlpHelper.ts';

/**
 * 取自真实简历（Canva 导出 PDF）的文本结构：
 * 章节标题独立成行，个人信息无标签并排在页眉，
 * 学校/公司行把多个字段挤在一行，长描述被硬换行拆开。
 */
const RESUME = [
  '中共党员 2002年5月',
  '张明 zhangming@example.com 13812345678',
  '教育经历',
  '北京师范大学 理论经济学专业 · 硕士 2024/09 - 2027/06',
  '中国人民大学 劳动经济学专业 · 本科 2020/09 - 2024/06',
  '实习经历',
  '科大讯飞 AI产品经理 2026/03 - 2026/06',
  '产品迭代与功能优化：参与多模态医疗Agent产品从0到1的搭建、规划与迭代，推动产品体验持续优',
  '化。',
  '美团快驴 数据运营 2025.10-2026.01',
  '数据支持与看板搭建：独立承担业务数据支持工作，编写SQL完成数据提取与清洗。',
  '国务院发展研究中心大数据研究院 产品经理 2025.06-2025.09',
  '产品更新与迭代：深度参与大数据可视化平台的更新与迭代。',
  '校园经历',
  '参与大学生创业训练计划，负责市场分析与财务模块，获得国家级结项。',
  '专业技能',
  '运用SQL、Python、Stata、SPSS进行数据提取、清洗和分析。',
  '常用办公软件：Excel、Word、PowerPoint等。',
  '自我评价',
  '本人性格开朗乐观，热情待人，有强烈的责任心。',
].join('\n');

test('按章节标题切分简历', () => {
  const kinds = NLPHelper.splitSections(RESUME).map(s => s.kind);
  assert.deepEqual(kinds, [
    'basic', 'education', 'experience', 'campus', 'skills', 'selfEvaluation',
  ]);
});

test('提取无标签的个人信息', () => {
  const personal = NLPHelper.parseResumeText(RESUME).personal!;
  assert.equal(personal.name, '张明');
  assert.equal(personal.politicalStatus, '中共党员');
  assert.equal(personal.birthDate, '2002-05');
  assert.equal(personal.phone, '13812345678');
  assert.equal(personal.email, 'zhangming@example.com');
});

test('政治面貌不会被当成姓名', () => {
  const personal = NLPHelper.parseResumeText(RESUME).personal!;
  assert.notEqual(personal.name, '中共党员');
});

test('简历未写性别时不推断', () => {
  const personal = NLPHelper.parseResumeText(RESUME).personal!;
  assert.ok(!personal.gender, `不应推断性别，实际得到 ${personal.gender}`);
});

test('自我评价按章节提取', () => {
  const personal = NLPHelper.parseResumeText(RESUME).personal!;
  assert.match(personal.selfEvaluation || '', /性格开朗乐观/);
});

test('学校行拆分为学校/专业/学历/起止时间', () => {
  const education = NLPHelper.parseResumeText(RESUME).education!;
  assert.equal(education.length, 2);
  assert.deepEqual(
    { ...education[0], id: undefined },
    {
      id: undefined,
      school: '北京师范大学',
      major: '理论经济学',
      degree: '硕士',
      startDate: '2024-09',
      endDate: '2027-06',
    }
  );
  assert.equal(education[1].school, '中国人民大学');
  assert.equal(education[1].degree, '本科');
});

test('教育经历不收录含「大学」的校园活动描述', () => {
  const education = NLPHelper.parseResumeText(RESUME).education!;
  const schools = education.map(e => e.school);
  assert.ok(
    !schools.some(s => s?.includes('创业训练计划')),
    `校园活动被误判为学校：${JSON.stringify(schools)}`
  );
});

test('识别不含「公司/集团」的机构名', () => {
  const experience = NLPHelper.parseResumeText(RESUME).experience!;
  assert.equal(experience.length, 3);
  assert.equal(experience[0].company, '科大讯飞');
  assert.equal(experience[0].position, 'AI产品经理');
  assert.equal(experience[1].company, '美团快驴');
  assert.equal(experience[1].position, '数据运营');
});

test('机构名含「研究」时不与职位对调', () => {
  const experience = NLPHelper.parseResumeText(RESUME).experience!;
  assert.equal(experience[2].company, '国务院发展研究中心大数据研究院');
  assert.equal(experience[2].position, '产品经理');
});

test('经历起止时间归一化为 YYYY-MM', () => {
  const experience = NLPHelper.parseResumeText(RESUME).experience!;
  assert.equal(experience[1].startDate, '2025-10');
  assert.equal(experience[1].endDate, '2026-01');
});

test('描述归入所属经历且不串段', () => {
  const experience = NLPHelper.parseResumeText(RESUME).experience!;
  assert.match(experience[0].description || '', /多模态医疗Agent/);
  assert.ok(
    !experience[0].description?.includes('美团'),
    '下一条经历的内容串入了上一条'
  );
  assert.match(experience[1].description || '', /编写SQL/);
});

test('技能只保留技能名，不含句子片段', () => {
  const skills = NLPHelper.parseResumeText(RESUME).skills!;
  for (const expected of ['SQL', 'Python', 'Stata', 'SPSS', 'Excel', 'Word']) {
    assert.ok(skills.includes(expected), `缺少技能 ${expected}`);
  }
  for (const skill of skills) {
    assert.ok(skill.length <= 16, `技能项过长：${skill}`);
    assert.ok(!/[。；]/.test(skill), `技能项含句子标点：${skill}`);
  }
});

test('「至今」结束时间', () => {
  const range = NLPHelper.extractDateRange('某公司 产品经理 2025/03 - 至今');
  assert.equal(range.startDate, '2025-03');
  assert.equal(range.endDate, '至今');
});

test('无章节标题的简历回退到全文扫描', () => {
  const plain = [
    '李华 lihua@example.com 13900001111',
    '清华大学 计算机科学与技术专业 · 本科 2019/09 - 2023/06',
    '腾讯科技有限公司 后端工程师 2023/07 - 至今',
  ].join('\n');

  const parsed = NLPHelper.parseResumeText(plain);
  assert.equal(parsed.education?.[0].school, '清华大学');
  assert.equal(parsed.education?.[0].degree, '本科');
  assert.equal(parsed.experience?.[0].company, '腾讯科技有限公司');
  assert.equal(parsed.experience?.[0].position, '后端工程师');
  assert.equal(parsed.experience?.[0].endDate, '至今');
});
