import React from 'react';
import type { EducationInfo } from '../shared/types';

interface Props {
  items: EducationInfo[];
  onChange: (items: EducationInfo[]) => void;
}

const DEGREES = ['博士', '硕士', '本科', '大专', '高中'];

/**
 * 教育经历编辑列表。
 * 顺序有实际意义：自动填充只取第一条，因此提供上移/下移。
 */
export function EducationSection({ items, onChange }: Props) {
  const update = (index: number, field: keyof EducationInfo, value: string) => {
    const next = [...items];
    next[index] = { ...next[index], [field]: value };
    onChange(next);
  };

  const add = () => {
    onChange([
      ...items,
      {
        id: crypto.randomUUID(),
        school: '',
        major: '',
        degree: '',
        startDate: '',
        endDate: '',
      },
    ]);
  };

  const remove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div>
      <h2 style={styles.sectionTitle}>教育经历</h2>
      <p style={styles.description}>
        自动填充时默认使用第一条，请把最高学历或最相关的经历排在最前。
      </p>

      {items.length === 0 && (
        <div style={styles.empty}>还没有教育经历，点击下方按钮添加，或在「简历上传」中导入。</div>
      )}

      {items.map((item, index) => (
        <div key={item.id || index} style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.cardIndex}>
              {index === 0 ? '主要学历' : `经历 ${index + 1}`}
            </span>
            <div style={styles.cardActions}>
              <button onClick={() => move(index, -1)} disabled={index === 0} style={styles.iconButton}>↑</button>
              <button onClick={() => move(index, 1)} disabled={index === items.length - 1} style={styles.iconButton}>↓</button>
              <button onClick={() => remove(index)} style={styles.removeButton}>删除</button>
            </div>
          </div>

          <div style={styles.row}>
            <div style={styles.group}>
              <label style={styles.label}>学校</label>
              <input
                type="text"
                value={item.school || ''}
                onChange={e => update(index, 'school', e.target.value)}
                style={styles.input}
                placeholder="如 北京师范大学"
              />
            </div>
            <div style={styles.group}>
              <label style={styles.label}>专业</label>
              <input
                type="text"
                value={item.major || ''}
                onChange={e => update(index, 'major', e.target.value)}
                style={styles.input}
                placeholder="如 理论经济学"
              />
            </div>
          </div>

          <div style={styles.row}>
            <div style={styles.group}>
              <label style={styles.label}>学历</label>
              <select
                value={item.degree || ''}
                onChange={e => update(index, 'degree', e.target.value)}
                style={styles.input}
              >
                <option value="">请选择</option>
                {DEGREES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div style={styles.group}>
              <label style={styles.label}>入学时间</label>
              <input
                type="text"
                value={item.startDate || ''}
                onChange={e => update(index, 'startDate', e.target.value)}
                style={styles.input}
                placeholder="如 2024.09"
              />
            </div>
            <div style={styles.group}>
              <label style={styles.label}>毕业时间</label>
              <input
                type="text"
                value={item.endDate || ''}
                onChange={e => update(index, 'endDate', e.target.value)}
                style={styles.input}
                placeholder="如 2027.06"
              />
            </div>
          </div>

          <div style={styles.row}>
            <div style={styles.group}>
              <label style={styles.label}>GPA / 成绩</label>
              <input
                type="text"
                value={item.gpa || ''}
                onChange={e => update(index, 'gpa', e.target.value)}
                style={styles.input}
                placeholder="如 3.8/4.0，可留空"
              />
            </div>
            <div style={styles.group}>
              <label style={styles.label}>排名</label>
              <input
                type="text"
                value={item.ranking || ''}
                onChange={e => update(index, 'ranking', e.target.value)}
                style={styles.input}
                placeholder="如 5/120，可留空"
              />
            </div>
          </div>

          <div style={styles.group}>
            <label style={styles.label}>在校荣誉 / 主修课程</label>
            <textarea
              value={item.achievements || ''}
              onChange={e => update(index, 'achievements', e.target.value)}
              style={styles.textarea}
              placeholder="奖学金、荣誉称号、核心课程等，可留空"
            />
          </div>
        </div>
      ))}

      <button onClick={add} style={styles.addButton}>+ 添加教育经历</button>
    </div>
  );
}

export const sectionStyles: Record<string, React.CSSProperties> = {
  sectionTitle: { margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600, color: '#333' },
  description: { margin: '0 0 20px 0', fontSize: '14px', color: '#666' },
  empty: {
    padding: '20px',
    marginBottom: '16px',
    border: '1px dashed #d1d5db',
    borderRadius: '8px',
    color: '#888',
    fontSize: '14px',
    textAlign: 'center',
  },
  card: {
    padding: '16px',
    marginBottom: '16px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    backgroundColor: '#fafafa',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '14px',
  },
  cardIndex: { fontSize: '13px', fontWeight: 600, color: '#667eea' },
  cardActions: { display: 'flex', gap: '6px' },
  iconButton: {
    width: '26px',
    height: '26px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '13px',
    color: '#555',
  },
  removeButton: {
    padding: '0 10px',
    height: '26px',
    border: '1px solid #fecaca',
    borderRadius: '4px',
    backgroundColor: 'white',
    color: '#dc2626',
    cursor: 'pointer',
    fontSize: '12px',
    fontFamily: 'inherit',
  },
  row: { display: 'flex', gap: '12px', marginBottom: '12px' },
  group: { flex: 1, marginBottom: '12px' },
  label: {
    display: 'block',
    marginBottom: '6px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#444',
  },
  input: {
    width: '100%',
    padding: '8px 10px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    minHeight: '70px',
    padding: '8px 10px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    resize: 'vertical',
    lineHeight: 1.6,
  },
  addButton: {
    padding: '10px 18px',
    border: '1px dashed #667eea',
    borderRadius: '6px',
    backgroundColor: 'white',
    color: '#667eea',
    fontSize: '14px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};

const styles = sectionStyles;
