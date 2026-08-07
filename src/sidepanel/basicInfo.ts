import type { PersonalInfo } from '../shared/types.ts';

export type BasicInfoField = {
  key: keyof PersonalInfo;
  label: string;
  singleLinePreview?: boolean;
};

export const BASIC_INFO_FIELDS: BasicInfoField[] = [
  { key: 'name', label: '姓名' },
  { key: 'gender', label: '性别' },
  { key: 'birthDate', label: '出生日期' },
  { key: 'politicalStatus', label: '政治面貌' },
  { key: 'ethnicity', label: '民族' },
  { key: 'phone', label: '手机号' },
  { key: 'email', label: '邮箱' },
  { key: 'wechat', label: '微信号' },
  { key: 'hometown', label: '籍贯' },
  { key: 'currentAddress', label: '现居地' },
  { key: 'idCard', label: '身份证号' },
  { key: 'selfEvaluation', label: '自我评价', singleLinePreview: true },
];

export function toSingleLinePreview(value: string, maxChars = 24): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}......`;
}

export function buildBasicInfoItems(personal: PersonalInfo) {
  return BASIC_INFO_FIELDS.map(field => {
    const raw = String(personal[field.key] ?? '').trim();
    const singleLinePreview = Boolean(field.singleLinePreview);

    return {
      key: field.key,
      label: field.label,
      value: raw,
      displayValue: singleLinePreview ? toSingleLinePreview(raw, 18) : raw,
      empty: raw === '',
      singleLinePreview,
    };
  });
}
