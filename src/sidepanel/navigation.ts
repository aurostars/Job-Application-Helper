export type SidepanelView = 'profile' | 'applications';

const SIDEPANEL_ENTRY = 'src/sidepanel/index.html';

export function getInitialSidepanelView(search: string): SidepanelView {
  const view = new URLSearchParams(search).get('view');
  return view === 'applications' ? 'applications' : 'profile';
}

export function getTargetWindowIdFromSearch(search: string): number | undefined {
  const rawValue = new URLSearchParams(search).get('targetWindowId');
  if (rawValue === null) return undefined;

  const parsed = Number(rawValue);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

export function buildSidepanelUrl({
  targetWindowId,
  view = 'profile',
}: {
  targetWindowId?: number;
  view?: SidepanelView;
}): string {
  const params = new URLSearchParams();
  if (Number.isInteger(targetWindowId) && (targetWindowId as number) >= 0) {
    params.set('targetWindowId', String(targetWindowId));
  }
  if (view === 'applications') {
    params.set('view', 'applications');
  }

  const query = params.toString();
  return query ? `${SIDEPANEL_ENTRY}?${query}` : SIDEPANEL_ENTRY;
}
