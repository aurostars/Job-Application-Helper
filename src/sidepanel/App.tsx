import { useEffect, useState } from 'react';
import { MessageService } from '../shared/message';
import type {
  CustomInformation,
  EducationInfo,
  ExperienceInfo,
  FocusedFieldFailureReason,
  FocusedFieldWriteResult,
  ProjectInfo,
  UserProfile,
} from '../shared/types';
import {
  getTargetWindowIdFromSearch,
} from './navigation';

type Status = {
  kind: 'idle' | 'working' | 'success' | 'warning' | 'error';
  text: string;
  manualValue?: string;
};

type FieldSpec<T> = {
  key: keyof T;
  label: string;
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

const educationFields: FieldSpec<EducationInfo>[] = [
  { key: 'school', label: '学校' },
  { key: 'college', label: '学院' },
  { key: 'educationType', label: '学历类型' },
  { key: 'major', label: '专业' },
  { key: 'degree', label: '学历' },
  { key: 'startDate', label: '入学时间' },
  { key: 'endDate', label: '毕业时间' },
  { key: 'gpa', label: 'GPA / 成绩' },
  { key: 'ranking', label: '排名' },
];

const experienceFields: FieldSpec<ExperienceInfo>[] = [
  { key: 'company', label: '公司 / 机构' },
  { key: 'position', label: '岗位' },
  { key: 'startDate', label: '开始时间' },
  { key: 'endDate', label: '结束时间' },
  { key: 'description', label: '工作内容' },
  { key: 'achievements', label: '成果' },
];

const projectFields: FieldSpec<ProjectInfo>[] = [
  { key: 'name', label: '项目名称' },
  { key: 'role', label: '角色' },
  { key: 'startDate', label: '开始时间' },
  { key: 'endDate', label: '结束时间' },
  { key: 'description', label: '项目描述' },
  { key: 'achievements', label: '成果' },
  { key: 'technologies', label: '技术栈' },
];

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

      {profile && (
        <>
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

          <RecordSection
            title="教育经历"
            records={profile.education}
            fields={educationFields}
            workingKey={workingKey}
            onFieldClick={handleFieldClick}
            getTitle={(record, index) => record.school || `教育经历 ${index + 1}`}
          />
          <RecordSection
            title="实习经历"
            records={profile.experience}
            fields={experienceFields}
            workingKey={workingKey}
            onFieldClick={handleFieldClick}
            getTitle={(record, index) => record.company || `实习经历 ${index + 1}`}
          />
          <RecordSection
            title="项目经历"
            records={profile.projects}
            fields={projectFields}
            workingKey={workingKey}
            onFieldClick={handleFieldClick}
            getTitle={(record, index) => record.name || `项目经历 ${index + 1}`}
          />
          <CustomInformationSection
            records={profile.customInformation || []}
            workingKey={workingKey}
            onFieldClick={handleFieldClick}
          />
        </>
      )}

    </main>
  );
}

function CustomInformationSection({
  records,
  workingKey,
  onFieldClick,
}: {
  records: CustomInformation[];
  workingKey: string | null;
  onFieldClick: (key: string, value: string) => void;
}) {
  return (
    <details className="record-section" open>
      <summary>
        <span>自定义信息</span>
        <span className="count">{records.length}</span>
      </summary>
      {records.length === 0 ? (
        <p className="empty-text">暂无自定义信息</p>
      ) : (
        <div className="custom-field-list">
          {records.map((record, index) => {
            const value = record.content.trim();
            const key = `自定义信息-${record.id}`;
            return (
              <button
                className="field-button custom-field-button"
                key={record.id}
                disabled={!value || Boolean(workingKey)}
                onClick={() => onFieldClick(key, value)}
                title={value ? '点击写入网页当前输入框' : '该字段未填写'}
              >
                <span className="field-label">
                  {record.name.trim() || `自定义信息 ${index + 1}`}
                </span>
                <span className={value ? 'field-value' : 'field-value empty-value'}>
                  {value || '未填写'}
                </span>
                {workingKey === key && <span className="field-working">写入中</span>}
              </button>
            );
          })}
        </div>
      )}
    </details>
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

function RecordSection<T extends { id: string }>({
  title,
  records,
  fields,
  workingKey,
  onFieldClick,
  getTitle,
}: {
  title: string;
  records: T[];
  fields: FieldSpec<T>[];
  workingKey: string | null;
  onFieldClick: (key: string, value: string) => void;
  getTitle: (record: T, index: number) => string;
}) {
  return (
    <details className="record-section" open>
      <summary>
        <span>{title}</span>
        <span className="count">{records.length}</span>
      </summary>
      {records.length === 0 ? (
        <p className="empty-text">暂无{title}</p>
      ) : (
        <div className="record-list">
          {records.map((record, recordIndex) => (
            <article className="record-card" key={record.id}>
              <h2>{getTitle(record, recordIndex)}</h2>
              <div className="field-list">
                {fields.map((field) => {
                  const value = String(record[field.key] ?? '');
                  const key = `${title}-${record.id}-${String(field.key)}`;
                  const empty = value.trim() === '';
                  return (
                    <button
                      className="field-button"
                      key={String(field.key)}
                      disabled={empty || Boolean(workingKey)}
                      onClick={() => onFieldClick(key, value)}
                      title={empty ? '该字段未填写' : '点击写入网页当前输入框'}
                    >
                      <span className="field-label">{field.label}</span>
                      <span className={empty ? 'field-value empty-value' : 'field-value'}>
                        {empty ? '未填写' : value}
                      </span>
                      {workingKey === key && <span className="field-working">写入中</span>}
                    </button>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}
    </details>
  );
}
