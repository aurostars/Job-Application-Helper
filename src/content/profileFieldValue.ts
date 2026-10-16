import { FieldType, type UserProfile } from '../shared/types.ts';

export function getExtendedProfileFieldValue(
  fieldType: FieldType,
  profile: UserProfile,
  educationIndex = 0,
): string | null | undefined {
  if (fieldType === FieldType.HOBBIES) return profile.personal.hobbies || null;
  if (fieldType === FieldType.MAJOR_COURSES) {
    return profile.education[educationIndex]?.majorCourses || null;
  }
  return undefined;
}
