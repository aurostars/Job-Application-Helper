import type {
  UserProfile,
  VisualRegionControlCandidate,
  VisualRegionFillMapping,
  VisualRegionFillMappingResult,
  VisualRegionFillPayload,
} from '../../shared/types.ts';

export function parseVisualRegionFillResponse(raw: string): VisualRegionFillMappingResult {
  const normalized = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw new Error('视觉补填结果不是合法 JSON');
  }

  const mappings = Array.isArray((parsed as { mappings?: unknown })?.mappings)
    ? (parsed as { mappings: unknown[] }).mappings
        .filter(isVisualRegionFillMapping)
        .map(mapping => ({
          controlId: mapping.controlId.trim(),
          fieldMeaning: mapping.fieldMeaning.trim(),
          matchedProfilePath: mapping.matchedProfilePath.trim(),
          value: mapping.value.trim(),
        }))
    : [];

  return { mappings };
}

export function validateVisualRegionMappings(
  mappings: VisualRegionFillMappingResult['mappings'],
  payload: VisualRegionFillPayload,
  profile: UserProfile,
): VisualRegionFillMappingResult['mappings'] {
  const controls = new Map<string, VisualRegionControlCandidate>(
    payload.controls.map(control => [control.controlId, control]),
  );

  return mappings.filter((mapping): mapping is VisualRegionFillMapping => {
    const control = controls.get(mapping.controlId);
    if (!control) return false;
    if (!mapping.value.trim()) return false;

    const profileValue = getProfileValue(profile, mapping.matchedProfilePath);
    if (typeof profileValue !== 'string' || profileValue !== mapping.value) return false;

    return control.options.length === 0 || control.options.includes(mapping.value);
  });
}

function getProfileValue(profile: UserProfile, path: string): unknown {
  return path
    .split('.')
    .filter(Boolean)
    .reduce<unknown>((current, segment) => {
      if (current === null || current === undefined) return undefined;
      const key = /^\d+$/.test(segment) ? Number(segment) : segment;
      return (current as Record<string, unknown> | unknown[])[key as never];
    }, profile);
}

function isVisualRegionFillMapping(value: unknown): value is VisualRegionFillMapping {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.controlId === 'string'
    && typeof candidate.fieldMeaning === 'string'
    && typeof candidate.matchedProfilePath === 'string'
    && typeof candidate.value === 'string'
  );
}
