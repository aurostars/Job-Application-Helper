import React from 'react';
import type { PersonalInfo } from '../shared/types.ts';
import { buildBasicInfoItems } from './basicInfo.ts';
import { FieldRow } from './FieldRow.tsx';
import { SectionSummary } from './SectionSummary.tsx';

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
      <SectionSummary title="基本信息" count={items.length} />
      <div className="field-list">
        {items.map((item) => {
          const key = `基本信息-${String(item.key)}`;
          return (
            <FieldRow
              key={String(item.key)}
              fieldKey={key}
              label={item.label}
              value={item.value}
              displayValue={item.displayValue}
              empty={item.empty}
              working={workingKey === key}
              disabled={workingKey !== null}
              className={item.key === 'selfEvaluation' ? 'field-value-single-line' : ''}
              onFieldClick={onFieldClick}
            />
          );
        })}
      </div>
    </details>
  );
}
