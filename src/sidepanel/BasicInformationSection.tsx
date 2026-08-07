import React from 'react';
import type { PersonalInfo } from '../shared/types.ts';
import { buildBasicInfoItems } from './basicInfo.ts';

type BasicInformationSectionProps = {
  personal: PersonalInfo;
  workingKey: string | null;
  onFieldClick: (key: string, value: string) => void;
};

export function BasicInformationSection({
  personal,
  workingKey,
  onFieldClick,
}: BasicInformationSectionProps): React.JSX.Element {
  const items = buildBasicInfoItems(personal);

  return (
    <details className="record-section" open>
      <summary>
        <span>基本信息</span>
        <span className="count">{items.length}</span>
      </summary>
      <div className="field-list">
        {items.map((item) => {
          const key = `基本信息-${String(item.key)}`;
          return (
            <button
              className="field-button"
              key={String(item.key)}
              disabled={item.empty || Boolean(workingKey)}
              onClick={() => onFieldClick(key, item.value)}
              title={item.empty ? '该字段未填写' : '点击写入网页当前输入框'}
            >
              <span className="field-label">{item.label}</span>
              <span className={item.empty ? 'field-value empty-value' : 'field-value'}>
                {item.empty ? '未填写' : item.displayValue}
              </span>
              {workingKey === key && <span className="field-working">写入中</span>}
            </button>
          );
        })}
      </div>
    </details>
  );
}
