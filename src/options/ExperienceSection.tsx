import React from 'react';
import type { ExperienceInfo, ProjectInfo } from '../shared/types';
import { sectionStyles as styles } from './sectionStyles';

interface Props {
  experience: ExperienceInfo[];
  projects: ProjectInfo[];
  skills: string[];
  onChangeExperience: (items: ExperienceInfo[]) => void;
  onChangeProjects: (items: ProjectInfo[]) => void;
  onChangeSkills: (skills: string[]) => void;
}

/**
 * 实习经历、项目/校园经历与技能的编辑界面。
 * 与教育经历一致，顺序决定自动填充取用哪一条。
 */
export function ExperienceSection({
  experience,
  projects,
  skills,
  onChangeExperience,
  onChangeProjects,
  onChangeSkills,
}: Props) {
  const updateExp = (index: number, field: keyof ExperienceInfo, value: string) => {
    const next = [...experience];
    next[index] = { ...next[index], [field]: value };
    onChangeExperience(next);
  };

  const moveExp = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= experience.length) return;
    const next = [...experience];
    [next[index], next[target]] = [next[target], next[index]];
    onChangeExperience(next);
  };

  const updateProj = (index: number, field: keyof ProjectInfo, value: string) => {
    const next = [...projects];
    next[index] = { ...next[index], [field]: value };
    onChangeProjects(next);
  };

  const moveProj = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= projects.length) return;
    const next = [...projects];
    [next[index], next[target]] = [next[target], next[index]];
    onChangeProjects(next);
  };

  return (
    <div>
      <h2 style={styles.sectionTitle}>实习 / 工作经历</h2>
      <p style={styles.description}>
        自动填充时默认使用第一条，请把最相关的经历排在最前。
      </p>

      {experience.length === 0 && (
        <div style={styles.empty}>还没有实习经历，点击下方按钮添加，或在「简历上传」中导入。</div>
      )}

      {experience.map((item, index) => (
        <div key={item.id || index} style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.cardIndex}>
              {index === 0 ? '主要经历' : `经历 ${index + 1}`}
            </span>
            <div style={styles.cardActions}>
              <button onClick={() => moveExp(index, -1)} disabled={index === 0} style={styles.iconButton}>上移</button>
              <button onClick={() => moveExp(index, 1)} disabled={index === experience.length - 1} style={styles.iconButton}>下移</button>
              <button
                onClick={() => onChangeExperience(experience.filter((_, i) => i !== index))}
                style={styles.removeButton}
              >
                删除
              </button>
            </div>
          </div>

          <div style={styles.row}>
            <div style={styles.group}>
              <label style={styles.label}>公司 / 机构</label>
              <input
                type="text"
                value={item.company || ''}
                onChange={e => updateExp(index, 'company', e.target.value)}
                style={styles.input}
                placeholder="如 科大讯飞"
              />
            </div>
            <div style={styles.group}>
              <label style={styles.label}>岗位</label>
              <input
                type="text"
                value={item.position || ''}
                onChange={e => updateExp(index, 'position', e.target.value)}
                style={styles.input}
                placeholder="如 AI产品经理"
              />
            </div>
          </div>

          <div style={styles.row}>
            <div style={styles.group}>
              <label style={styles.label}>开始时间</label>
              <input
                type="text"
                value={item.startDate || ''}
                onChange={e => updateExp(index, 'startDate', e.target.value)}
                style={styles.input}
                placeholder="如 2026.03"
              />
            </div>
            <div style={styles.group}>
              <label style={styles.label}>结束时间</label>
              <input
                type="text"
                value={item.endDate || ''}
                onChange={e => updateExp(index, 'endDate', e.target.value)}
                style={styles.input}
                placeholder="如 2026.07 或 至今"
              />
            </div>
          </div>

          <div style={styles.group}>
            <label style={styles.label}>工作内容</label>
            <textarea
              value={item.description || ''}
              onChange={e => updateExp(index, 'description', e.target.value)}
              style={{ ...styles.textarea, minHeight: '120px' }}
              placeholder="职责与成果，网申中的实习描述会用到这段内容"
            />
          </div>
        </div>
      ))}

      <button
        onClick={() =>
          onChangeExperience([
            ...experience,
            {
              id: crypto.randomUUID(),
              company: '',
              position: '',
              startDate: '',
              endDate: '',
              description: '',
            },
          ])
        }
        style={styles.addButton}
      >
        添加实习经历
      </button>

      <h2 style={{ ...styles.sectionTitle, marginTop: '36px' }}>项目 / 校园经历</h2>
      <p style={styles.description}>
        学生工作、社会实践、科研项目等都可以放在这里。
      </p>

      {projects.length === 0 && (
        <div style={styles.empty}>还没有项目经历，点击下方按钮添加。</div>
      )}

      {projects.map((item, index) => (
        <div key={item.id || index} style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.cardIndex}>项目 {index + 1}</span>
            <div style={styles.cardActions}>
              <button onClick={() => moveProj(index, -1)} disabled={index === 0} style={styles.iconButton}>上移</button>
              <button onClick={() => moveProj(index, 1)} disabled={index === projects.length - 1} style={styles.iconButton}>下移</button>
              <button
                onClick={() => onChangeProjects(projects.filter((_, i) => i !== index))}
                style={styles.removeButton}
              >
                删除
              </button>
            </div>
          </div>

          <div style={styles.row}>
            <div style={styles.group}>
              <label style={styles.label}>项目名称</label>
              <input
                type="text"
                value={item.name || ''}
                onChange={e => updateProj(index, 'name', e.target.value)}
                style={styles.input}
                placeholder="如 院学生会"
              />
            </div>
            <div style={styles.group}>
              <label style={styles.label}>担任角色</label>
              <input
                type="text"
                value={item.role || ''}
                onChange={e => updateProj(index, 'role', e.target.value)}
                style={styles.input}
                placeholder="如 部长"
              />
            </div>
          </div>

          <div style={styles.row}>
            <div style={styles.group}>
              <label style={styles.label}>开始时间</label>
              <input
                type="text"
                value={item.startDate || ''}
                onChange={e => updateProj(index, 'startDate', e.target.value)}
                style={styles.input}
                placeholder="可留空"
              />
            </div>
            <div style={styles.group}>
              <label style={styles.label}>结束时间</label>
              <input
                type="text"
                value={item.endDate || ''}
                onChange={e => updateProj(index, 'endDate', e.target.value)}
                style={styles.input}
                placeholder="可留空"
              />
            </div>
          </div>

          <div style={styles.group}>
            <label style={styles.label}>项目描述</label>
            <textarea
              value={item.description || ''}
              onChange={e => updateProj(index, 'description', e.target.value)}
              style={{ ...styles.textarea, minHeight: '100px' }}
              placeholder="做了什么、取得什么结果"
            />
          </div>
        </div>
      ))}

      <button
        onClick={() =>
          onChangeProjects([
            ...projects,
            {
              id: crypto.randomUUID(),
              name: '',
              role: '',
              startDate: '',
              endDate: '',
              description: '',
              achievements: '',
            },
          ])
        }
        style={styles.addButton}
      >
        添加项目经历
      </button>

      <h2 style={{ ...styles.sectionTitle, marginTop: '36px' }}>专业技能</h2>
      <p style={styles.description}>每行一条，填充技能类字段时会合并为一段文本。</p>
      <textarea
        value={skills.join('\n')}
        onChange={e => onChangeSkills(e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
        style={{ ...styles.textarea, minHeight: '140px' }}
        placeholder={'运用SQL、Python进行数据分析\n运用Axure、Figma绘制交互原型'}
      />
    </div>
  );
}
