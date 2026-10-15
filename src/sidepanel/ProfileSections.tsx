import React from 'react';
import type {
  AwardInfo,
  CustomInformation,
  EducationInfo,
  ExperienceInfo,
  ProjectInfo,
  UserProfile,
} from '../shared/types.ts';
import { BasicInformationSection } from './BasicInformationSection.tsx';
import { FieldRow } from './FieldRow.tsx';
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
  { key: 'majorCourses', label: '主要课程' },
];

const experienceFields: FieldSpec<ExperienceInfo>[] = [
  { key: 'company', label: '公司 / 机构' },
  { key: 'position', label: '岗位' },
  { key: 'startDate', label: '开始时间' },
  { key: 'endDate', label: '结束时间' },
  { key: 'description', label: '工作内容' },
];

const awardFields: FieldSpec<AwardInfo>[] = [
  { key: 'name', label: '名称' },
  { key: 'role', label: '担任角色' },
  { key: 'date', label: '获取时间' },
  { key: 'description', label: '详细描述' },
];

const projectFields: FieldSpec<ProjectInfo>[] = [
  { key: 'name', label: '项目名称' },
  { key: 'role', label: '角色' },
  { key: 'startDate', label: '开始时间' },
  { key: 'endDate', label: '结束时间' },
  { key: 'description', label: '项目描述' },
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
      <SkillsSection
        skills={profile.skills || []}
        workingKey={workingKey}
        onFieldClick={onFieldClick}
      />
      {profile.awards.length > 0 && (
        <RecordSection
          title="奖项 / 荣誉"
          records={profile.awards}
          fields={awardFields}
          workingKey={workingKey}
          onFieldClick={onFieldClick}
          getTitle={(record, index) => record.name || `奖项 / 荣誉 ${index + 1}`}
          hideEmptyFields
        />
      )}
      <CustomInformationSection
        records={profile.customInformation || []}
        workingKey={workingKey}
        onFieldClick={onFieldClick}
      />
    </>
  );
}

function SkillsSection({
  skills,
  workingKey,
  onFieldClick,
}: {
  skills: string[];
  workingKey: string | null;
  onFieldClick: (key: string, value: string) => void;
}): React.JSX.Element | null {
  const visibleSkills = skills
    .map((skill, index) => ({ value: skill.trim(), index }))
    .filter(skill => skill.value.length > 0);
  if (visibleSkills.length === 0) return null;

  return (
    <details className="record-section" open>
      <SectionSummary title="专业技能" count={visibleSkills.length} />
      <div className="record-list">
        {visibleSkills.map(skill => {
          const key = `skill-${skill.index}`;
          return (
            <article className="record-card skill-card" key={key}>
              <div className="field-list">
                <FieldRow
                  fieldKey={key}
                  value={skill.value}
                  working={workingKey === key}
                  disabled={workingKey !== null}
                  className="skill-field-row"
                  onFieldClick={onFieldClick}
                />
              </div>
            </article>
          );
        })}
      </div>
    </details>
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
            const label = record.name.trim() || `自定义信息 ${index + 1}`;
            return (
              <FieldRow
                key={record.id}
                fieldKey={key}
                label={label}
                value={value}
                empty={!value}
                working={workingKey === key}
                disabled={workingKey !== null}
                className="custom-field-row"
                onFieldClick={onFieldClick}
              />
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
  hideEmptyFields = false,
}: {
  title: string;
  records: T[];
  fields: FieldSpec<T>[];
  workingKey: string | null;
  onFieldClick: (key: string, value: string) => void;
  getTitle: (record: T, index: number) => string;
  hideEmptyFields?: boolean;
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
                {fields
                  .filter(
                    (field) =>
                      !hideEmptyFields || String(record[field.key] ?? '').trim() !== '',
                  )
                  .map((field) => {
                  const value = String(record[field.key] ?? '');
                  const key = `${title}-${record.id}-${String(field.key)}`;
                  const empty = value.trim() === '';
                  return (
                    <FieldRow
                      key={String(field.key)}
                      fieldKey={key}
                      label={field.label}
                      value={value}
                      empty={empty}
                      working={workingKey === key}
                      disabled={workingKey !== null}
                      onFieldClick={onFieldClick}
                    />
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
