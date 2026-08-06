import type {
  ApplicationEvent,
  ApplicationRecord,
  ApplicationStatus,
  CreateApplicationRecordInput,
  FeishuRecordSyncState,
  UpdateApplicationRecordInput,
} from '../../shared/types.ts';

function createEvent(
  type: ApplicationEvent['type'],
  summary: string,
  detail?: string,
  createdAt = new Date().toISOString(),
): ApplicationEvent {
  return {
    id: crypto.randomUUID(),
    type,
    createdAt,
    summary,
    detail,
  };
}

function buildPendingFeishuState(previous?: FeishuRecordSyncState): FeishuRecordSyncState {
  return {
    ...previous,
    status: 'pending',
    lastError: undefined,
  };
}

export function createApplicationRecord(input: CreateApplicationRecordInput): ApplicationRecord {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    siteName: input.siteName.trim(),
    siteUrl: input.siteUrl.trim(),
    siteHost: input.siteHost.trim(),
    companyName: input.companyName.trim(),
    jobTitle: input.jobTitle.trim(),
    city: input.city?.trim() || undefined,
    department: input.department?.trim() || undefined,
    salaryText: input.salaryText?.trim() || undefined,
    appliedAt: input.appliedAt?.trim() || undefined,
    deadline: input.deadline?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    resumeName: input.resumeName?.trim() || undefined,
    contactName: input.contactName?.trim() || undefined,
    contactInfo: input.contactInfo?.trim() || undefined,
    status: '待投递',
    createdAt: now,
    updatedAt: now,
    events: [createEvent('created', '创建投递记录', undefined, now)],
    deletedAt: null,
  };
}

export function updateApplicationRecord(
  record: ApplicationRecord,
  patch: UpdateApplicationRecordInput,
): ApplicationRecord {
  const now = new Date().toISOString();
  const events = [...record.events];
  const nextStatus = patch.status ?? record.status;
  const nextNotes = patch.notes?.trim() || undefined;

  if (nextStatus !== record.status) {
    events.unshift(createEvent('status_change', `状态更新为${nextStatus}`, `${record.status} → ${nextStatus}`, now));
  }

  if (nextNotes !== undefined && nextNotes !== record.notes) {
    events.unshift(createEvent('note_added', '更新备注', nextNotes, now));
  }

  return {
    ...record,
    ...patch,
    siteName: patch.siteName?.trim() ?? record.siteName,
    siteUrl: patch.siteUrl?.trim() ?? record.siteUrl,
    siteHost: patch.siteHost?.trim() ?? record.siteHost,
    companyName: patch.companyName?.trim() ?? record.companyName,
    jobTitle: patch.jobTitle?.trim() ?? record.jobTitle,
    city: patch.city?.trim() || (patch.city === '' ? undefined : record.city),
    department: patch.department?.trim() || (patch.department === '' ? undefined : record.department),
    salaryText: patch.salaryText?.trim() || (patch.salaryText === '' ? undefined : record.salaryText),
    appliedAt: patch.appliedAt?.trim() || (patch.appliedAt === '' ? undefined : record.appliedAt),
    deadline: patch.deadline?.trim() || (patch.deadline === '' ? undefined : record.deadline),
    notes: nextNotes ?? (patch.notes === '' ? undefined : record.notes),
    resumeName: patch.resumeName?.trim() || (patch.resumeName === '' ? undefined : record.resumeName),
    contactName: patch.contactName?.trim() || (patch.contactName === '' ? undefined : record.contactName),
    contactInfo: patch.contactInfo?.trim() || (patch.contactInfo === '' ? undefined : record.contactInfo),
    status: nextStatus,
    updatedAt: now,
    events,
    deletedAt: record.deletedAt ?? null,
  };
}

export function softDeleteApplicationRecord(record: ApplicationRecord): ApplicationRecord {
  const now = new Date().toISOString();
  return {
    ...record,
    deletedAt: now,
    updatedAt: now,
    events: [
      createEvent('status_change', '已删除投递记录', undefined, now),
      ...record.events,
    ],
  };
}

export function markRecordPendingSync(
  record: ApplicationRecord,
  destination: 'none' | 'webdav' | 'feishu' | 'both',
): ApplicationRecord {
  if (destination === 'none' || destination === 'webdav') return record;
  return {
    ...record,
    feishuSync: buildPendingFeishuState(record.feishuSync),
  };
}

export function markRecordSyncResult(
  record: ApplicationRecord,
  result: {
    status: 'synced' | 'error';
    remoteRecordId?: string;
    error?: string;
  },
): ApplicationRecord {
  if (result.status === 'synced') {
    return {
      ...record,
      feishuSync: {
        recordId: result.remoteRecordId ?? record.feishuSync?.recordId,
        lastSyncedAt: new Date().toISOString(),
        status: 'synced',
      },
    };
  }

  return {
    ...record,
    feishuSync: {
      ...record.feishuSync,
      status: 'error',
      lastError: result.error || '飞书同步失败',
    },
  };
}

export function filterDeletedRecords(
  records: ApplicationRecord[],
  includeDeleted = false,
): ApplicationRecord[] {
  if (includeDeleted) return records;
  return records.filter((record) => !record.deletedAt);
}

export function isTerminalStatus(status: ApplicationStatus): boolean {
  return status === '已结束' || status === '已拒绝' || status === '已录用';
}
