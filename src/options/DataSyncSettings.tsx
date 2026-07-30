import { useEffect, useRef, useState } from 'react';
import { MessageService } from '../shared/message';
import type {
  BackupSummary,
  SyncMetadata,
  WebDAVConfig,
} from '../shared/types';

const EMPTY_CONFIG: WebDAVConfig = {
  enabled: false,
  serverUrl: '',
  username: '',
  password: '',
};

const STATUS_LABELS: Record<SyncMetadata['status'], string> = {
  idle: '尚未同步',
  syncing: '同步中',
  synced: '已同步',
  conflict: '需要处理冲突',
  error: '同步失败',
};

interface Props {
  onDataChanged: () => void;
}

function Summary({ summary }: { summary: BackupSummary }) {
  return (
    <dl className="backup-summary">
      <div><dt>格式版本</dt><dd>V{summary.schemaVersion}</dd></div>
      <div><dt>导出时间</dt><dd>{new Date(summary.exportedAt).toLocaleString()}</dd></div>
      <div><dt>来源版本</dt><dd>{summary.extensionVersion}</dd></div>
      <div><dt>个人信息</dt><dd>{summary.hasUserProfile ? '包含' : '不包含'}</dd></div>
      <div><dt>简历原文件</dt><dd>{summary.hasResumeFile ? '包含' : '不包含'}</dd></div>
      <div><dt>AI 配置 / API Key</dt><dd>{summary.hasLLMConfig ? (summary.hasApiKey ? '包含（含 Key）' : '包含') : '不包含'}</dd></div>
      <div><dt>WebDAV 同步设置</dt><dd>{summary.hasWebDAVConfig ? '包含（含密码，导入后覆盖）' : '不包含'}</dd></div>
    </dl>
  );
}

export function DataSyncSettings({ onDataChanged }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importJson, setImportJson] = useState('');
  const [importSummary, setImportSummary] = useState<BackupSummary | null>(null);
  const [confirmingImport, setConfirmingImport] = useState(false);
  const [config, setConfig] = useState<WebDAVConfig>(EMPTY_CONFIG);
  const [metadata, setMetadata] = useState<SyncMetadata>({ status: 'idle' });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const refreshStatus = async () => {
    const response = await MessageService.sendMessage<SyncMetadata>({ type: 'GET_SYNC_STATUS' });
    if (response.success && response.data) setMetadata(response.data);
  };

  useEffect(() => {
    void Promise.all([
      MessageService.sendMessage<WebDAVConfig>({ type: 'GET_WEBDAV_CONFIG' }).then(response => {
        if (response.success && response.data) setConfig(response.data);
      }),
      refreshStatus(),
    ]);
    const timer = window.setInterval(refreshStatus, 3000);
    return () => window.clearInterval(timer);
  }, []);

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setNotice(null);
    try {
      await action();
    } finally {
      setBusy(null);
      await refreshStatus();
    }
  };

  const exportBackup = () => run('export', async () => {
    const response = await MessageService.sendMessage<{ json: string; filename: string }>({
      type: 'EXPORT_BACKUP',
    });
    if (!response.success || !response.data) {
      setNotice({ type: 'error', text: response.error || '导出失败' });
      return;
    }
    const url = URL.createObjectURL(new Blob([response.data.json], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = response.data.filename;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice({ type: 'success', text: '完整备份已导出' });
  });

  const selectBackup = async (file?: File) => {
    setImportSummary(null);
    setImportJson('');
    setNotice(null);
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setNotice({ type: 'error', text: '备份文件超过 20 MiB 上限' });
      return;
    }
    const json = await file.text();
    const response = await MessageService.sendMessage<BackupSummary>({
      type: 'PREVIEW_BACKUP_IMPORT',
      payload: { json },
    });
    if (!response.success || !response.data) {
      setNotice({ type: 'error', text: response.error || '备份预检失败' });
      return;
    }
    setImportJson(json);
    setImportSummary(response.data);
  };

  const importBackup = () => run('import', async () => {
    const response = await MessageService.sendMessage({
      type: 'IMPORT_BACKUP',
      payload: { json: importJson },
    });
    if (!response.success) {
      setNotice({ type: 'error', text: response.error || '导入失败，本地数据未更改' });
      return;
    }
    setConfirmingImport(false);
    setImportJson('');
    setImportSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onDataChanged();
    setNotice({ type: 'success', text: '备份已完整导入，本地资料已刷新' });
  });

  const saveConfig = () => run('save-config', async () => {
    const response = await MessageService.sendMessage({
      type: 'SAVE_WEBDAV_CONFIG',
      payload: config,
    });
    setNotice({
      type: response.success ? 'success' : 'error',
      text: response.success
        ? '同步设置已保存；不会立即上传，请手动执行首次同步'
        : response.error || '设置保存失败',
    });
  });

  const testWebDAV = () => run('test', async () => {
    const response = await MessageService.sendMessage<{ message: string }>({
      type: 'TEST_WEBDAV',
      payload: config,
    });
    setNotice({
      type: response.success ? 'success' : 'error',
      text: response.success ? response.data?.message || '连接成功' : response.error || '连接失败',
    });
  });

  const syncNow = () => run('sync', async () => {
    const response = await MessageService.sendMessage<{ status: string }>({
      type: 'SYNC_NOW',
    });
    if (!response.success) {
      setNotice({ type: 'error', text: response.error || '同步请求失败' });
      return;
    }
    setNotice({
      type: response.data?.status === 'synced' ? 'success' : 'error',
      text: response.data?.status === 'synced'
        ? '同步完成'
        : '操作未完成，请查看下方同步状态',
    });
  });

  const resolve = (choice: 'local' | 'remote') => run(`resolve-${choice}`, async () => {
    const response = await MessageService.sendMessage<{ status: string }>({
      type: 'RESOLVE_SYNC_CONFLICT',
      payload: { choice },
    });
    if (choice === 'remote' && response.data?.status === 'synced') onDataChanged();
    setNotice({
      type: response.data?.status === 'synced' ? 'success' : 'error',
      text: response.data?.status === 'synced'
        ? '冲突已解决'
        : '冲突仍未解决，未覆盖任何数据',
    });
  });

  return (
    <div className="data-sync-settings">
      <section className="data-section">
        <div className="data-section-heading">
          <div>
            <h2 className="settings-section-title">本地 JSON 备份</h2>
            <p className="settings-description">导出或完整恢复个人资料、简历原文件、AI 配置和通用设置。</p>
          </div>
          <div className="data-heading-actions">
            <button
              className="btn btn-primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy !== null}
            >
              导入完整数据
            </button>
            <button className="btn btn-secondary" onClick={exportBackup} disabled={busy !== null}>
              {busy === 'export' ? '导出中…' : '导出完整数据'}
            </button>
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept=".json,application/json"
              onChange={event => void selectBackup(event.target.files?.[0])}
            />
          </div>
        </div>

        <div className="sensitive-warning" role="note">
          备份为明文 JSON，包含完整个人信息、简历原文件、AI API Key 和 WebDAV 账号密码。请妥善保管，不要发送给他人。
        </div>

        {importSummary && (
          <div className="backup-preview">
            <h3>备份文件检查通过</h3>
            <p className="settings-hint">以下内容尚未导入，确认后才会覆盖当前数据。</p>
            <Summary summary={importSummary} />
            <button className="btn btn-secondary" onClick={() => setConfirmingImport(true)}>
              覆盖并导入
            </button>
          </div>
        )}
      </section>

      <section className="data-section">
        <div className="data-section-heading">
          <div>
            <h2 className="settings-section-title">WebDAV 同步</h2>
            <p className="settings-description">以 ETag 条件请求安全同步同一份明文 JSON；凭据仅保存在本机。</p>
          </div>
          <span className={`sync-status sync-status-${metadata.status}`}>
            {STATUS_LABELS[metadata.status]}
          </span>
        </div>

        <label className="sync-toggle">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={event => setConfig({ ...config, enabled: event.target.checked })}
          />
          <span>启用保存后的自动同步</span>
        </label>

        <div className="settings-field">
          <label htmlFor="webdav-url">WebDAV 服务器地址</label>
          <input
            id="webdav-url"
            type="url"
            className="settings-input"
            value={config.serverUrl}
            onChange={event => setConfig({ ...config, serverUrl: event.target.value })}
            placeholder="https://dav.example.com/path/"
          />
          <p className="settings-hint">
            必须使用 HTTPS。首次同步时会自动创建 job-application-helper 目录，并在其中保存备份文件。
          </p>
        </div>
        <div className="sync-credentials">
          <div className="settings-field">
            <label htmlFor="webdav-username">用户名</label>
            <input
              id="webdav-username"
              className="settings-input"
              value={config.username}
              onChange={event => setConfig({ ...config, username: event.target.value })}
              autoComplete="username"
            />
          </div>
          <div className="settings-field">
            <label htmlFor="webdav-password">密码</label>
            <input
              id="webdav-password"
              type="password"
              className="settings-input"
              value={config.password}
              onChange={event => setConfig({ ...config, password: event.target.value })}
              autoComplete="current-password"
            />
          </div>
        </div>

        <div className="sync-actions">
          <button className="btn btn-secondary" onClick={testWebDAV} disabled={busy !== null}>测试连接</button>
          <button className="btn btn-primary" onClick={saveConfig} disabled={busy !== null}>保存同步设置</button>
          <button className="btn btn-secondary" onClick={syncNow} disabled={busy !== null || !config.enabled}>
            {busy === 'sync' ? '同步中…' : '立即同步'}
          </button>
        </div>

        <div className="sync-detail" aria-live="polite">
          <span>最近成功同步：{metadata.lastSyncedAt ? new Date(metadata.lastSyncedAt).toLocaleString() : '暂无'}</span>
          {metadata.lastError && <p>{metadata.lastError}</p>}
        </div>

        {metadata.status === 'conflict' && (
          <div className="sync-conflict">
            <h3>{metadata.conflict ? '本地与远端都已变化' : '远端文件状态已变化'}</h3>
            <p>
              {metadata.conflict
                ? '系统没有覆盖任何一方。请核对摘要后选择整份保留，或暂不处理。'
                : '远端文件可能已被删除。系统没有自动重建，请确认后重新上传本地数据，或暂不处理。'}
            </p>
            {metadata.conflict && (
              <div className="conflict-comparison">
                <div><h4>本地版本</h4><Summary summary={metadata.conflict.local} /></div>
                <div><h4>远端版本</h4><Summary summary={metadata.conflict.remote} /></div>
              </div>
            )}
            <div className="sync-actions">
              <button className="btn btn-primary" onClick={() => resolve('local')} disabled={busy !== null}>
                {metadata.conflict ? '使用本地' : '重新上传本地数据'}
              </button>
              {metadata.conflict && (
                <button className="btn btn-secondary" onClick={() => resolve('remote')} disabled={busy !== null}>使用远端</button>
              )}
              <button className="btn btn-secondary" onClick={() => setNotice({ type: 'success', text: '冲突状态已保留，未执行任何覆盖' })}>暂不处理</button>
            </div>
          </div>
        )}
      </section>

      {notice && <div className={`data-notice data-notice-${notice.type}`} role="status">{notice.text}</div>}

      {confirmingImport && (
        <div className="confirm-layer" role="dialog" aria-modal="true" aria-labelledby="import-confirm-title">
          <div className="confirm-dialog">
            <h3 id="import-confirm-title">确认覆盖本地数据？</h3>
            <p>导入会整体覆盖当前个人资料、简历、AI 配置和通用设置。此操作不能撤销。</p>
            <div className="sync-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmingImport(false)}>取消</button>
              <button className="btn btn-primary" onClick={importBackup} disabled={busy !== null}>
                {busy === 'import' ? '导入中…' : '确认覆盖并导入'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
