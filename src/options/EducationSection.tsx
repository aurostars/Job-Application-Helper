import type { EducationInfo } from '../shared/types';
import { sectionStyles as styles } from './sectionStyles';

interface Props {
  items: EducationInfo[];
  onChange: (items: EducationInfo[]) => void;
}

const DEGREES = ['博士', '硕士', '本科', '大专', '高中'];

/**
 * 教育经历编辑列表。
 * 顺序有实际意义：自动填充会按页面上的教育经历字段顺序依次取用。
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
        college: '',
        educationType: '统招全日制',
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
        自动填充时会按顺序依次使用教育经历：页面有几组教育字段，就尽量填几条。
      </p>

      {items.length === 0 && (
        <div style={styles.empty}>还没有教育经历，点击下方按钮添加，或在「简历上传」中导入。</div>
      )}

      {items.map((item, index) => (
        <div key={item.id || index} style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.cardIndex}>
              {`经历 ${index + 1}`}
            </span>
            <div style={styles.cardActions}>
              <button onClick={() => move(index, -1)} disabled={index === 0} style={styles.iconButton}>上移</button>
              <button onClick={() => move(index, 1)} disabled={index === items.length - 1} style={styles.iconButton}>下移</button>
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
              <label style={styles.label}>学院</label>
              <input
                type="text"
                value={item.college || ''}
                onChange={e => update(index, 'college', e.target.value)}
                style={styles.input}
                placeholder="如 计算机学院"
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
              <label style={styles.label}>学历类型</label>
              <select
                value={item.educationType || ''}
                onChange={e => update(index, 'educationType', e.target.value)}
                style={styles.input}
              >
                <option value="">请选择</option>
                <option value="海外及港澳台">海外及港澳台</option>
                <option value="统招全日制">统招全日制</option>
                <option value="统招非全日制">统招非全日制</option>
                <option value="自考">自考</option>
                <option value="其他">其他</option>
              </select>
            </div>
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

        </div>
      ))}

      <button onClick={add} style={styles.addButton}>添加教育经历</button>
    </div>
  );
}
