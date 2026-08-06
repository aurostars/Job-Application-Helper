import type { ApplicationSyncConfig } from '../shared/types.ts';

export const DEFAULT_APPLICATION_SYNC_FILENAME = 'application-records.csv';

export interface ApplicationSyncFormState extends ApplicationSyncConfig {
  feishu: {
    appToken: string;
    tableId: string;
    viewName: string;
  };
}

export function buildInitialApplicationSyncFormState(
  config: ApplicationSyncConfig | null,
): ApplicationSyncFormState {
  return {
    destination: config?.destination ?? 'none',
    autoSync: Boolean(config?.autoSync),
    webdavCsvFileName: config?.webdavCsvFileName?.trim() || DEFAULT_APPLICATION_SYNC_FILENAME,
    feishu: {
      appToken: config?.feishu?.appToken ?? '',
      tableId: config?.feishu?.tableId ?? '',
      viewName: config?.feishu?.viewName ?? '',
    },
  };
}

export function buildApplicationSyncConfigPayload(
  state: ApplicationSyncFormState,
): ApplicationSyncConfig {
  const destination = state.destination;
  const webdavCsvFileName =
    state.webdavCsvFileName.trim() || DEFAULT_APPLICATION_SYNC_FILENAME;
  const appToken = state.feishu.appToken.trim();
  const tableId = state.feishu.tableId.trim();
  const viewName = state.feishu.viewName.trim();

  return {
    destination,
    autoSync: Boolean(state.autoSync),
    webdavCsvFileName,
    feishu: isApplicationSyncFeishuEnabled(destination)
      ? {
          appToken,
          tableId,
          viewName: viewName || undefined,
        }
      : undefined,
  };
}

export function isApplicationSyncWebDAVEnabled(
  destination: ApplicationSyncConfig['destination'],
): boolean {
  return destination === 'webdav' || destination === 'both';
}

export function isApplicationSyncFeishuEnabled(
  destination: ApplicationSyncConfig['destination'],
): boolean {
  return destination === 'feishu' || destination === 'both';
}
