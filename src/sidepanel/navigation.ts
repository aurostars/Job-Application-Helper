const SIDEPANEL_ENTRY = 'src/sidepanel/index.html';

export function getTargetWindowIdFromSearch(search: string): number | undefined {
  const rawValue = new URLSearchParams(search).get('targetWindowId');
  if (rawValue === null) return undefined;

  const parsed = Number(rawValue);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

export function buildSidepanelUrl({
  targetWindowId,
}: {
  targetWindowId?: number;
}): string {
  const params = new URLSearchParams();
  if (Number.isInteger(targetWindowId) && (targetWindowId as number) >= 0) {
    params.set('targetWindowId', String(targetWindowId));
  }
  const query = params.toString();
  return query ? `${SIDEPANEL_ENTRY}?${query}` : SIDEPANEL_ENTRY;
}
