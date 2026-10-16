import React from 'react';
import type { AwardInfo } from '../shared/types.ts';
import { AwardsSection } from './AwardsSection.tsx';
import { SkillsEditor } from './SkillsEditor.tsx';

export function SkillsAwardsSection(props: {
  skills: string[];
  awards: AwardInfo[];
  onChangeSkills: (skills: string[]) => void;
  onChangeAwards: (awards: AwardInfo[]) => void;
}) {
  return (
    <>
      <SkillsEditor skills={props.skills} onChange={props.onChangeSkills} />
      <AwardsSection awards={props.awards} onChange={props.onChangeAwards} />
    </>
  );
}
