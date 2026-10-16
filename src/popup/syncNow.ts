import type { MessageResponse, SyncExecutionResult } from '../shared/types.ts';

export async function runPopupSync(deps: {
  sync: () => Promise<MessageResponse<SyncExecutionResult>>;
  openSyncSettings: () => Promise<void>;
}): Promise<'synced' | 'redirected' | 'error'> {
  const response = await deps.sync();
  if (!response.success || !response.data || response.data.status === 'error') return 'error';
  if (response.data.status === 'conflict' || response.data.status === 'disabled') {
    await deps.openSyncSettings();
    return 'redirected';
  }
  return response.data.status === 'synced' ? 'synced' : 'error';
}
