import { useEffect, useState } from 'react';
import { MessageService } from '../shared/message';
import type {
  ApplicationSyncConfig,
} from '../shared/types.ts';
import type { DestinationSyncResult } from '../services/application-tracking/syncCoordinator.ts';
import {
  buildApplicationSyncConfigPayload,
  buildInitialApplicationSyncFormState,
  type ApplicationSyncFormState,
  isApplicationSyncFeishuEnabled,
  isApplicationSyncWebDAVEnabled,
} from './applicationSyncSettingsState.ts';

interface ApplicationSyncSettingsProps {
  onDataChanged: () => void;
}

function summarizeDestinationResult(
  label: string,
  result: DestinationSyncResult | undefined,
): string | null {
  if (!result) return null;
  if (result.status === 'synced') return `${label}同步成功`;
  if (result.status === 'error') return `${label}同步失败：${result.error || '未知错误'}`;
  return `${label}未执行同步`;
}

export function ApplicationSyncSettings({ onDataChanged }: ApplicationSyncSettingsProps) {
  const [config, setConfig] = useState<ApplicationSyncFormState>(
    buildInitialApplicationSyncFormState(null),
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'save' | 'sync' | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const loadConfig = async () => {
      setLoading(true);
      const response = await MessageService.sendMessage<ApplicationSyncConfig>({
        type: 'GET_APPLICATION_SYNC_CONFIG',
      });
      if (response.success) {
        setConfig(buildInitialApplicationSyncFormState(response.data || null));
      } else {
        setNotice({ type: 'error', text: response.error || '投递记录同步配置加载失败' });
      }
      setLoading(false);
    };

    void loadConfig();

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName === 'local' && changes.applicationSyncConfig) {
        setConfig(
          buildInitialApplicationSyncFormState(
            (changes.applicationSyncConfig.newValue as ApplicationSyncConfig | null | undefined) || null,
          ),
        );
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const destination = config.destination;
  const webdavEnabled = isApplicationSyncWebDAVEnabled(destination);
  const feishuEnabled = isApplicationSyncFeishuEnabled(destination);

  const updateFeishu = (
    field: keyof ApplicationSyncFormState['feishu'],
    value: string,
  ) => {
    setConfig({
      ...config,
      feishu: {
        ...config.feishu,
        [field]: value,
      },
    });
  };

  const handleSave = async () => {
    setBusy('save');
    setNotice(null);
    try {
      const payload = buildApplicationSyncConfigPayload(config);
      const response = await MessageService.sendMessage<ApplicationSyncConfig>({
        type: 'SAVE_APPLICATION_SYNC_CONFIG',
        payload,
      });

      if (!response.success) {
        setNotice({ type: 'error', text: response.error || '投递记录同步配置保存失败' });
        return;
      }

      setConfig(buildInitialApplicationSyncFormState(response.data || payload));
      onDataChanged();
      setNotice({
        type: 'success',
        text: payload.destination === 'none'
          ? '已保存为不同步模式'
          : payload.autoSync
            ? '同步配置已保存，后续保存投递记录时会自动同步'
            : '同步配置已保存，可随时手动执行立即同步',
      });
    } finally {
      setBusy(null);
    }
  };

  const handleSyncNow = async () => {
    setBusy('sync');
    setNotice(null);
    try {
      const response = await MessageService.sendMessage<{
        triggered: boolean;
        error?: string;
        result?: {
          webdav?: DestinationSyncResult;
          feishu?: DestinationSyncResult;
        };
      }>({
        type: 'SYNC_APPLICATIONS_NOW',
      });

      if (!response.success || !response.data) {
        setNotice({ type: 'error', text: response.error || '立即同步失败' });
        return;
      }

      if (!response.data.triggered) {
        setNotice({ type: 'error', text: '当前同步目标为“不同步”，请先保存有效的同步配置' });
        return;
      }

      const messages = [
        summarizeDestinationResult('WebDAV', response.data.result?.webdav),
        summarizeDestinationResult('飞书', response.data.result?.feishu),
      ].filter(Boolean);

      setNotice(
        response.data.error
          ? {
              type: 'error',
              text: messages.length > 0
                ? `${messages.join('；')}。${response.data.error}`
                : response.data.error,
            }
          : {
              type: 'success',
              text: messages.join('；') || '投递记录同步完成',
            },
      );
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div className="options-loading">加载投递记录同步配置中...</div>;
  }

  return (
    <div className="settings-section application-sync-settings">
      <h2 className="settings-section-title">投递记录同步</h2>
      <p className="settings-description">
        为投递记录选择独立的远端镜像目标。插件本地始终是主数据源，远端同步失败不会影响本地保存。
      </p>

      <div className="settings-field">
        <label htmlFor="application-sync-destination">同步目标</label>
        <select
          id="application-sync-destination"
          className="settings-input"
          value={destination}
          onChange={event =>
            setConfig({ ...config, destination: event.target.value as ApplicationSyncFormState['destination'] })
          }
        >
          <option value="none">不同步</option>
          <option value="webdav">仅同步到 WebDAV CSV</option>
          <option value="feishu">仅同步到飞书多维表格</option>
          <option value="both">同时同步到 WebDAV 与飞书</option>
        </select>
      </div>

      <label className="sync-toggle">
        <input
          type="checkbox"
          checked={config.autoSync}
          onChange={event => setConfig({ ...config, autoSync: event.target.checked })}
        />
        <span>保存投递记录后自动同步</span>
      </label>

      {webdavEnabled && (
        <section className="application-sync-card">
          <h3>WebDAV CSV 镜像</h3>
          <div className="settings-field">
            <label htmlFor="application-sync-webdav-file">CSV 文件名</label>
            <input
              id="application-sync-webdav-file"
              className="settings-input"
              value={config.webdavCsvFileName}
              onChange={event => setConfig({ ...config, webdavCsvFileName: event.target.value })}
              placeholder="application-records.csv"
            />
            <p className="settings-hint">
              将与现有 JSON 备份一起存放到同一 WebDAV 目录中。账号密码请在“数据与同步”页签中维护。
            </p>
          </div>
        </section>
      )}

      {feishuEnabled && (
        <section className="application-sync-card">
          <h3>飞书多维表格</h3>
          <div className="settings-field">
            <label htmlFor="application-sync-feishu-app-token">App Token</label>
            <input
              id="application-sync-feishu-app-token"
              className="settings-input"
              value={config.feishu.appToken}
              onChange={event => updateFeishu('appToken', event.target.value)}
              placeholder="bascn..."
            />
          </div>
          <div className="settings-field">
            <label htmlFor="application-sync-feishu-table-id">Table ID</label>
            <input
              id="application-sync-feishu-table-id"
              className="settings-input"
              value={config.feishu.tableId}
              onChange={event => updateFeishu('tableId', event.target.value)}
              placeholder="tbl..."
            />
          </div>
          <div className="settings-field">
            <label htmlFor="application-sync-feishu-view-name">视图名称（可选）</label>
            <input
              id="application-sync-feishu-view-name"
              className="settings-input"
              value={config.feishu.viewName}
              onChange={event => updateFeishu('viewName', event.target.value)}
              placeholder="默认视图"
            />
            <p className="settings-hint">
              当前仅保存最小接入配置。若飞书目标未接入完成，手动同步会返回明确错误，但不会阻塞本地保存。
            </p>
          </div>
        </section>
      )}

      <div className="info-note">
        提示：投递记录同步配置与“数据与同步”页签解耦。这里仅负责投递记录镜像目标；通用 JSON 备份、恢复和 WebDAV 凭据仍在原设置页维护。
      </div>

      {notice && (
        <div className={`data-notice data-notice-${notice.type}`} role="status">
          {notice.text}
        </div>
      )}

      <div className="options-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleSyncNow}
          disabled={busy !== null}
        >
          {busy === 'sync' ? '同步中…' : '立即同步'}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSave}
          disabled={busy !== null}
        >
          {busy === 'save' ? '保存中…' : '保存设置'}
        </button>
      </div>
    </div>
  );
}
