import React from 'react';
import type {
  CustomInformation,
  EducationInfo,
  ExperienceInfo,
  ProjectInfo,
  UserProfile,
} from '../shared/types.ts';
import { BasicInformationSection } from './BasicInformationSection.tsx';
import { SectionSummary } from './SectionSummary.tsx';

type FieldSpec<T> = {
  key: keyof T;
  label: string;
};

const educationFields: FieldSpec<EducationInfo>[] = [
  { key: 'school', label: '学校' },
  { key: 'college', label: '学院' },
  { key: 'educationType', label: '学历类型' },
  { key: 'major', label: '专业' },
  { key: 'degree', label: '学历' },
  { key: 'startDate', label: '入学时间' },
  { key: 'endDate', label: '毕业时间' },
  { key: 'gpa', label: 'GPA / 成绩' },
  { key: 'ranking', label: '排名' },
];

const experienceFields: FieldSpec<ExperienceInfo>[] = [
  { key: 'company', label: '公司 / 机构' },
  { key: 'position', label: '岗位' },
  { key: 'startDate', label: '开始时间' },
  { key: 'endDate', label: '结束时间' },
  { key: 'description', label: '工作内容' },
  { key: 'achievements', label: '成果' },
];

const projectFields: FieldSpec<ProjectInfo>[] = [
  { key: 'name', label: '项目名称' },
  { key: 'role', label: '角色' },
  { key: 'startDate', label: '开始时间' },
  { key: 'endDate', label: '结束时间' },
  { key: 'description', label: '项目描述' },
  { key: 'achievements', label: '成果' },
  { key: 'technologies', label: '技术栈' },
];

type ProfileSectionsProps = {
  profile: UserProfile;
  workingKey: string | null;
  onFieldClick: (key: string, value: string) => void;
};

export function ProfileSections({
  profile,
  workingKey,
  onFieldClick,
}: ProfileSectionsProps): React.JSX.Element {
  return (
    <>
      <BasicInformationSection
        personal={profile.personal}
        workingKey={workingKey}
        onFieldClick={onFieldClick}
      />
      <RecordSection
        title="教育经历"
        records={profile.education}
        fields={educationFields}
        workingKey={workingKey}
        onFieldClick={onFieldClick}
        getTitle={(record, index) => record.school || `教育经历 ${index + 1}`}
      />
      <RecordSection
        title="实习经历"
        records={profile.experience}
        fields={experienceFields}
        workingKey={workingKey}
        onFieldClick={onFieldClick}
        getTitle={(record, index) => record.company || `实习经历 ${index + 1}`}
      />
      <RecordSection
        title="项目经历"
        records={profile.projects}
        fields={projectFields}
        workingKey={workingKey}
        onFieldClick={onFieldClick}
        getTitle={(record, index) => record.name || `项目经历 ${index + 1}`}
      />
      <CustomInformationSection
        records={profile.customInformation || []}
        workingKey={workingKey}
        onFieldClick={onFieldClick}
      />
    </>
  );
}

function CustomInformationSection({
  records,
  workingKey,
  onFieldClick,
}: {
  records: CustomInformation[];
  workingKey: string | null;
  onFieldClick: (key: string, value: string) => void;
}): React.JSX.Element {
  return (
    <details className="record-section" open>
      <SectionSummary title="自定义信息" count={records.length} />
      {records.length === 0 ? (
        <p className="empty-text">暂无自定义信息</p>
      ) : (
        <div className="custom-field-list">
          {records.map((record, index) => {
            const value = record.content.trim();
            const key = `自定义信息-${record.id}`;
            return (
              <button
                className="field-button custom-field-button"
                key={record.id}
                disabled={!value || Boolean(workingKey)}
                onClick={() => onFieldClick(key, value)}
                title={value ? '点击写入网页当前输入框' : '该字段未填写'}
              >
                <span className="field-label">
                  {record.name.trim() || `自定义信息 ${index + 1}`}
                </span>
                <span className={value ? 'field-value' : 'field-value empty-value'}>
                  {value || '未填写'}
                </span>
                {workingKey === key && <span className="field-working">写入中</span>}
              </button>
            );
          })}
        </div>
      )}
    </details>
  );
}

function RecordSection<T extends { id: string }>({
  title,
  records,
  fields,
  workingKey,
  onFieldClick,
  getTitle,
}: {
  title: string;
  records: T[];
  fields: FieldSpec<T>[];
  workingKey: string | null;
  onFieldClick: (key: string, value: string) => void;
  getTitle: (record: T, index: number) => string;
}): React.JSX.Element {
  return (
    <details className="record-section" open>
      <SectionSummary title={title} count={records.length} />
      {records.length === 0 ? (
        <p className="empty-text">暂无{title}</p>
      ) : (
        <div className="record-list">
          {records.map((record, recordIndex) => (
            <article className="record-card" key={record.id}>
              <h2>{getTitle(record, recordIndex)}</h2>
              <div className="field-list">
                {fields.map((field) => {
                  const value = String(record[field.key] ?? '');
                  const key = `${title}-${record.id}-${String(field.key)}`;
                  const empty = value.trim() === '';
                  return (
                    <button
                      className="field-button"
                      key={String(field.key)}
                      disabled={empty || Boolean(workingKey)}
                      onClick={() => onFieldClick(key, value)}
                      title={empty ? '该字段未填写' : '点击写入网页当前输入框'}
                    >
                      <span className="field-label">{field.label}</span>
                      <span className={empty ? 'field-value empty-value' : 'field-value'}>
                        {empty ? '未填写' : value}
                      </span>
                      {workingKey === key && <span className="field-working">写入中</span>}
                    </button>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}
    </details>
  );
}
