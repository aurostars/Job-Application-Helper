import { useEffect, useState } from 'react';
import { MessageService } from '../shared/message';
import type {
  FocusedFieldFailureReason,
  FocusedFieldWriteResult,
  UserProfile,
} from '../shared/types';
import {
  getTargetWindowIdFromSearch,
} from './navigation';
import { ProfileSections } from './ProfileSections.tsx';

type Status = {
  kind: 'idle' | 'working' | 'success' | 'warning' | 'error';
  text: string;
  manualValue?: string;
};

type DocumentPictureInPictureApi = {
  window: Window | null;
  requestWindow(options?: {
    width?: number;
    height?: number;
    disallowReturnToOpener?: boolean;
    preferInitialWindowPlacement?: boolean;
  }): Promise<Window>;
};

const reasonText: Record<FocusedFieldFailureReason, string> = {
  NO_ACTIVE_TAB: '当前没有可写入的网页',
  NO_CONTENT_SCRIPT: '当前页面不支持扩展写入',
  NO_FOCUSED_FIELD: '请先点击网页中的目标输入框',
  FIELD_DETACHED: '目标输入框已被页面刷新，请重新点击',
  FIELD_NOT_WRITABLE: '目标控件不可写',
  VALUE_REJECTED: '页面拒绝了该值',
  RESTRICTED_PAGE: '浏览器限制页面不允许写入',
};

const targetWindowId = getTargetWindowIdFromSearch(window.location.search);
const defaultStatusText = '先点击网页输入框，再点击下方信息字段';
const hasTargetWindowId = typeof targetWindowId === 'number';

export default function App() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [workingKey, setWorkingKey] = useState<string | null>(null);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [status, setStatus] = useState<Status>({
    kind: 'idle',
    text: defaultStatusText,
  });

  useEffect(() => {
    void loadInitialData();
    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName === 'local' && changes.userProfile) {
        void loadInitialData();
      }
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    const profileResponse = await MessageService.sendMessage<UserProfile>({
      type: 'GET_USER_PROFILE',
    });

    setProfile(profileResponse.success && profileResponse.data ? profileResponse.data : null);
    setLoading(false);
  };

  const copyValue = async (value: string, prefix: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus({ kind: 'warning', text: `${prefix}，已复制到剪贴板` });
    } catch {
      setStatus({
        kind: 'error',
        text: `${prefix}，复制也失败，请手动复制下方内容`,
        manualValue: value,
      });
    }
  };

  const handleFieldClick = async (key: string, value: string) => {
    if (!value.trim() || workingKey) return;
    setWorkingKey(key);
    setStatus({ kind: 'working', text: '正在写入网页输入框...' });

    try {
      const query = hasTargetWindowId
        ? { active: true, windowId: targetWindowId }
        : { active: true, currentWindow: true };
      const [tab] = await chrome.tabs.query(query);
      if (!tab?.id) {
        await copyValue(value, '当前没有活动网页');
        return;
      }

      const response = await MessageService.sendMessage<FocusedFieldWriteResult>({
        type: 'WRITE_FOCUSED_FIELD',
        payload: { tabId: tab.id, value },
      });

      if (response.success && response.data?.written) {
        setStatus({ kind: 'idle', text: defaultStatusText });
        return;
      }

      const reason = response.data?.reason;
      const message = reason ? reasonText[reason] : (response.error || '网页写入失败');
      await copyValue(value, message);
    } catch (error) {
      await copyValue(
        value,
        error instanceof Error ? error.message : '网页写入失败'
      );
    } finally {
      setWorkingKey(null);
    }
  };

  const handlePictureInPicture = async () => {
    if (pipWindow && !pipWindow.closed) {
      pipWindow.close();
      return;
    }

    const api = (
      window as Window & { documentPictureInPicture?: DocumentPictureInPictureApi }
    ).documentPictureInPicture;
    if (!api?.requestWindow) {
      setStatus({
        kind: 'warning',
        text: '当前浏览器未开放文档画中画，无法使用置顶小窗',
      });
      return;
    }

    try {
      const root = document.getElementById('root');
      if (!root) throw new Error('信息面板尚未加载完成');

      const openerDocument = document;
      const pictureWindow = await api.requestWindow({
        width: 420,
        height: 760,
        disallowReturnToOpener: true,
        preferInitialWindowPlacement: true,
      });

      copyStylesToPictureWindow(openerDocument, pictureWindow.document);
      pictureWindow.document.title = '网申信息置顶小窗';
      pictureWindow.document.body.appendChild(root);
      setPipWindow(pictureWindow);

      pictureWindow.addEventListener('pagehide', () => {
        if (root.ownerDocument !== openerDocument) {
          openerDocument.body.appendChild(root);
        }
        setPipWindow(null);
        setStatus({ kind: 'idle', text: '已退出置顶小窗' });
      }, { once: true });

      if (hasTargetWindowId) {
        await chrome.windows.update(targetWindowId, { focused: true }).catch(() => undefined);
      }
    } catch {
      setStatus({
        kind: 'warning',
        text: '当前浏览器未开放文档画中画，无法使用置顶小窗',
      });
    }
  };

  if (loading) {
    return <main className="panel-state">正在加载信息...</main>;
  }

  if (!profile) {
    return (
      <main className="panel-state">
        <h1>网申信息浮窗</h1>
        <p>尚未保存个人信息。</p>
        <button className="primary-action" onClick={() => chrome.runtime.openOptionsPage()}>
          设置个人信息
        </button>
      </main>
    );
  }

  return (
    <main className="panel">
      <header className="panel-header">
        <div>
            <h1>网申信息浮窗</h1>
            <p>点击网页输入框，再点击信息字段</p>
        </div>
        <div className="header-actions">
          <button className="pip-button" onClick={handlePictureInPicture}>
            {pipWindow && !pipWindow.closed ? '退出置顶' : '置顶小窗'}
          </button>
          <button className="settings-button" onClick={() => chrome.runtime.openOptionsPage()}>
            设置
          </button>
        </div>
      </header>

      <div className={`status status-${status.kind}`}>
        <span>{status.text}</span>
        {status.manualValue && (
          <textarea
            className="manual-copy"
            readOnly
            value={status.manualValue}
            onFocus={(event) => event.currentTarget.select()}
          />
        )}
      </div>
      <ProfileSections
        profile={profile}
        workingKey={workingKey}
        onFieldClick={handleFieldClick}
      />
    </main>
  );
}

function copyStylesToPictureWindow(source: Document, target: Document): void {
  for (const styleSheet of Array.from(source.styleSheets)) {
    try {
      const style = target.createElement('style');
      style.textContent = Array.from(styleSheet.cssRules)
        .map(rule => rule.cssText)
        .join('\n');
      target.head.appendChild(style);
    } catch {
      if (!styleSheet.href) continue;
      const link = target.createElement('link');
      link.rel = 'stylesheet';
      link.href = styleSheet.href;
      target.head.appendChild(link);
    }
  }
}
