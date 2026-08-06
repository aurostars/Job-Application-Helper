import type {
  ApplicationRecord,
  ApplicationSyncConfig,
  WebDAVConfig,
} from '../../shared/types.ts';

export interface FeishuSyncRecordResult {
  localId: string;
  remoteRecordId?: string;
  status: 'synced' | 'error';
  error?: string;
}

export interface DestinationSyncResult {
  status: 'synced' | 'error' | 'skipped';
  error?: string;
  exportedCount?: number;
  records?: FeishuSyncRecordResult[];
}

export interface ApplicationSyncCoordinatorArgs {
  records: ApplicationRecord[];
  syncConfig: ApplicationSyncConfig | null;
  webdavConfig: WebDAVConfig | null;
}

interface ApplicationSyncHooks {
  webdav?: (args: {
    records: ApplicationRecord[];
    csv: string;
    fileName: string;
    config: WebDAVConfig | null;
  }) => Promise<DestinationSyncResult>;
  feishu?: (
    records: ApplicationRecord[],
    config: NonNullable<ApplicationSyncConfig['feishu']>,
  ) => Promise<FeishuSyncRecordResult[]>;
}

const syncHooks: ApplicationSyncHooks = {};

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function buildApplicationCsv(records: ApplicationRecord[]): string {
  const headers = [
    '记录ID',
    '岗位名称',
    '公司',
    '网站',
    '链接',
    '域名',
    '状态',
    '更新时间',
    '备注',
    '是否已删除',
  ];

  const rows = records.map((record) => [
    record.id,
    record.jobTitle,
    record.companyName,
    record.siteName,
    record.siteUrl,
    record.siteHost,
    record.status,
    record.updatedAt,
    record.notes || '',
    record.deletedAt ? '是' : '否',
  ]);

  return [headers.join(','), ...rows.map((row) => row.map((cell) => escapeCsv(cell)).join(','))].join('\n');
}

export function setApplicationSyncHooks(nextHooks: ApplicationSyncHooks): void {
  syncHooks.webdav = nextHooks.webdav;
  syncHooks.feishu = nextHooks.feishu;
}

export function resetApplicationSyncHooks(): void {
  syncHooks.webdav = undefined;
  syncHooks.feishu = undefined;
}

export async function syncApplicationDestinations(
  args: ApplicationSyncCoordinatorArgs,
): Promise<{ webdav?: DestinationSyncResult; feishu?: DestinationSyncResult }> {
  const { records, syncConfig, webdavConfig } = args;
  if (!syncConfig || syncConfig.destination === 'none') return {};

  const result: { webdav?: DestinationSyncResult; feishu?: DestinationSyncResult } = {};

  if (syncConfig.destination === 'webdav' || syncConfig.destination === 'both') {
    if (!syncHooks.webdav) {
      result.webdav = { status: 'error', error: 'WebDAV CSV 同步尚未接入' };
    } else {
      result.webdav = await syncHooks.webdav({
        records,
        csv: buildApplicationCsv(records),
        fileName: syncConfig.webdavCsvFileName,
        config: webdavConfig,
      });
    }
  }

  if (syncConfig.destination === 'feishu' || syncConfig.destination === 'both') {
    if (!syncConfig.feishu?.appToken || !syncConfig.feishu?.tableId) {
      result.feishu = { status: 'error', error: '飞书同步配置不完整' };
    } else if (!syncHooks.feishu) {
      result.feishu = { status: 'error', error: '飞书同步尚未接入' };
    } else {
      const recordsResult = await syncHooks.feishu(records, syncConfig.feishu);
      result.feishu = {
        status: recordsResult.some((item) => item.status === 'error') ? 'error' : 'synced',
        records: recordsResult,
      };
    }
  }

  return result;
}
