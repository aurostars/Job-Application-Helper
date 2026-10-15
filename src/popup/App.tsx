import React, { useState, useEffect, useRef } from 'react';
import { MessageService } from '../shared/message';
import type { Message, MessageResponse, ResumeProfileSummary, SyncExecutionResult, UserProfile } from '../shared/types';
import type { LLMConfig } from '../services/llm/types';
import { claimPopupSwitch, createPopupRequestGate, executePopupInitialLoad, executePopupProfileSwitch, isPopupInteractionDisabled, ResumeProfileSelector } from './ResumeProfileSelector';
import { buildSidepanelUrl, openInfoFloatWindow } from '../sidepanel/navigation';
import { runPopupSync } from './syncNow';

const APPLICATION_RECORDS_PAGE = 'src/application-records/index.html';

function getRuntimeUrl(path: string): string {
  return typeof chrome !== 'undefined' ? chrome.runtime.getURL(path) : path;
}

export async function openApplicationRecordCreateWindow(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error('没有可用的当前页面');
  }

  const draftResponse = await MessageService.sendMessage<{ draftId: string }>({
    type: 'CREATE_APPLICATION_RECORD_DRAFT',
    payload: { tabId: tab.id },
  });
  if (!draftResponse.success || !draftResponse.data?.draftId) {
    throw new Error(draftResponse.error || '无法创建投递记录草稿');
  }

  await chrome.windows.create({
    url: getRuntimeUrl(`${APPLICATION_RECORDS_PAGE}?draftId=${encodeURIComponent(draftResponse.data.draftId)}`),
    type: 'popup',
    width: 520,
    height: 760,
    focused: true,
  });
}

export async function openApplicationRecordOptions(): Promise<void> {
  await chrome.tabs.create({
    url: getRuntimeUrl('src/options/index.html?tab=application-records'),
  });
}

function App() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [resumeProfiles, setResumeProfiles] = useState<ResumeProfileSummary | null>(null);
  const [switching, setSwitching] = useState(false);
  const [profileSwitchError, setProfileSwitchError] = useState('');
  const [popupLoadError, setPopupLoadError] = useState('');
  const switchPendingRef = useRef(false);
  const requestGateRef = useRef(createPopupRequestGate());
  const [loading, setLoading] = useState(typeof window !== 'undefined');
  const [filling, setFilling] = useState(false);
  const [aiScanning, setAiScanning] = useState(false);
  const [startingAIRegion, setStartingAIRegion] = useState(false);
  const [openingView, setOpeningView] = useState(false);
  const [openingApplicationCreate, setOpeningApplicationCreate] = useState(false);
  const [openingApplicationRecords, setOpeningApplicationRecords] = useState(false);
  const [detectedFields, setDetectedFields] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<'success' | 'error' | null>(null);
  const syncPendingRef = useRef(false);
  const syncNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchProfile = async (): Promise<UserProfile> => {
    const response = await MessageService.sendMessage<UserProfile>({ type: 'GET_USER_PROFILE' });
    if (!response.success || !response.data) throw new Error(response.error || '加载个人信息失败');
    return response.data;
  };

  const fetchResumeProfiles = async (): Promise<ResumeProfileSummary> => {
    const response = await MessageService.sendMessage<ResumeProfileSummary>({ type: 'GET_RESUME_PROFILES' });
    if (!response.success || !response.data) throw new Error(response.error || '加载简历列表失败');
    return response.data;
  };

  useEffect(() => {
    const gate = createPopupRequestGate();
    requestGateRef.current = gate;
    const token = gate.begin();
    setPopupLoadError('');
    void executePopupInitialLoad({
      loadSummary: fetchResumeProfiles,
      loadProfile: fetchProfile,
      commitSummary: setResumeProfiles,
      commitProfile: setProfile,
      showError: setPopupLoadError,
      isCurrent: () => gate.isCurrent(token),
    }).finally(() => { if (gate.isCurrent(token)) setLoading(false); });
    void detectFields();
    return () => {
      gate.unmount();
      switchPendingRef.current = false;
      syncPendingRef.current = false;
      if (syncNoticeTimerRef.current) clearTimeout(syncNoticeTimerRef.current);
    };
  }, []);

  const handleProfileSwitch = async (nextId: string) => {
    if (!resumeProfiles || nextId === resumeProfiles.activeProfileId || !claimPopupSwitch(switchPendingRef)) return;
    const previousId = resumeProfiles.activeProfileId;
    const gate = requestGateRef.current;
    const token = gate.begin();
    const isCurrent = () => gate.isCurrent(token);
    setSwitching(true);
    setProfileSwitchError('');
    setResumeProfiles(current => current ? { ...current, activeProfileId: nextId } : current);

    await executePopupProfileSwitch(nextId, previousId, {
      switchProfile: targetId => MessageService.sendMessage<ResumeProfileSummary>({
        type: 'SWITCH_RESUME_PROFILE',
        payload: { id: targetId },
      }),
      loadSummary: fetchResumeProfiles,
      loadProfile: fetchProfile,
      commitSummary: setResumeProfiles,
      commitProfile: setProfile,
      rollback: id => setResumeProfiles(current => current ? { ...current, activeProfileId: id } : current),
      showError: setProfileSwitchError,
      isCurrent,
    });

    if (isCurrent()) {
      switchPendingRef.current = false;
      setSwitching(false);
    }
  };

  const handleSyncNow = async () => {
    if (syncPendingRef.current) return;
    syncPendingRef.current = true;
    setSyncing(true);
    setSyncNotice(null);
    if (syncNoticeTimerRef.current) clearTimeout(syncNoticeTimerRef.current);

    try {
      const result = await runPopupSync({
        sync: () => MessageService.sendMessage<SyncExecutionResult>({ type: 'SYNC_NOW' }),
        openSyncSettings: () => chrome.tabs.create({
          url: getRuntimeUrl('src/options/index.html?tab=data-sync'),
        }).then(() => undefined),
      });
      if (result === 'synced') {
        setSyncNotice('success');
        syncNoticeTimerRef.current = setTimeout(() => setSyncNotice(null), 1800);
      } else if (result === 'error') {
        setSyncNotice('error');
      }
    } catch {
      setSyncNotice('error');
    } finally {
      syncPendingRef.current = false;
      setSyncing(false);
    }
  };

  const detectFields = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) return;

      const response = await sendMessageToActiveTab<{ count: number }>(tab.id, {
        type: 'DETECT_FIELDS'
      });

      if (response.success && response.data) {
        setDetectedFields(response.data.count);
      }
    } catch (error) {
      console.error('Failed to detect fields:', error);
    }
  };

  const handleFillForm = async () => {
    if (!profile) {
      alert('请先设置个人信息！');
      openOptions();
      return;
    }

    setFilling(true);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) {
        throw new Error('No active tab');
      }

      const response = await sendMessageToActiveTab(tab.id, {
        type: 'FILL_FORM'
      });

      if (response.success) {
        alert('表单填充成功！');
      } else {
        alert('填充失败：' + (response.error || '未知错误'));
      }
    } catch (error) {
      console.error('Fill form error:', error);
      alert('填充表单时出错');
    } finally {
      setFilling(false);
    }
  };

  const handleAIScanFill = async () => {
    if (!profile) {
      alert('请先设置个人信息！');
      openOptions();
      return;
    }

    setAiScanning(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) {
        throw new Error('No active tab');
      }

      const response = await sendMessageToActiveTab(tab.id, {
        type: 'START_AI_PAGE_FILL',
      });

      if (!response.success) {
        alert('AI 扫描填充失败：' + (response.error || '未知错误'));
        return;
      }

      window.close();
    } catch (error) {
      console.error('AI scan fill error:', error);
      alert('启动 AI 扫描填充时出错');
    } finally {
      setAiScanning(false);
    }
  };

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  const handleOpenApplicationRecordCreate = async () => {
    setOpeningApplicationCreate(true);
    try {
      await openApplicationRecordCreateWindow();
      window.close();
    } catch (error) {
      alert(error instanceof Error ? error.message : '打开新建投递记录失败');
      setOpeningApplicationCreate(false);
    }
  };

  const handleOpenApplicationRecords = async () => {
    setOpeningApplicationRecords(true);
    try {
      await openApplicationRecordOptions();
      window.close();
    } catch (error) {
      alert(error instanceof Error ? error.message : '打开投递记录失败');
      setOpeningApplicationRecords(false);
    }
  };

  const handleStartAIRegionFill = async () => {
    if (!profile) {
      alert('请先设置个人信息！');
      openOptions();
      return;
    }

    setStartingAIRegion(true);
    try {
      const llmConfigResponse = await MessageService.sendMessage<LLMConfig>({
        type: 'GET_LLM_CONFIG',
      });
      if (!llmConfigResponse.success || !llmConfigResponse.data?.apiKey?.trim()) {
        throw new Error('请先在设置中配置 AI 服务');
      }
      if (!llmConfigResponse.data.model.trim()) {
        throw new Error('请先在设置中填写模型名称');
      }

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) throw new Error('没有可用的当前页面');

      const response = await sendMessageToActiveTab(tab.id, {
        type: 'START_AI_REGION_FILL',
      });
      if (!response.success) {
        throw new Error(response.error || '无法启动 AI 框选补填');
      }

      window.close();
    } catch (error) {
      alert(error instanceof Error ? error.message : '启动 AI 框选补填失败');
      setStartingAIRegion(false);
    }
  };

  const handleOpenSidePanel = async () => {
    setOpeningView(true);
    try {
      const opened = await openNativeSidePanel();
      if (!opened) {
        // 原生侧边栏不可用（旧版浏览器 / API 缺失 / 手势失效）时回退到浮动小窗
        await openInfoFloatWindow();
      }
      window.close();
    } catch {
      // 原生侧边栏调用抛错时同样回退，避免用户点击后毫无反应
      try {
        await openInfoFloatWindow();
        window.close();
      } catch (fallbackError) {
        alert(fallbackError instanceof Error ? fallbackError.message : '打开信息窗口失败');
        setOpeningView(false);
      }
    }
  };

  // 尝试打开 Chrome 原生侧边栏；成功返回 true，不支持或未开启时返回 false。
  const openNativeSidePanel = async (): Promise<boolean> => {
    const sidePanel = (chrome as typeof chrome & { sidePanel?: chrome.sidePanel.SidePanel }).sidePanel;
    if (!sidePanel?.open || !sidePanel.setOptions) {
      return false;
    }

    const currentWindow = await chrome.windows.getCurrent();
    const windowId = currentWindow.id;
    if (typeof windowId !== 'number') {
      return false;
    }

    // 把目标窗口写进 path，侧边栏页面据此把字段写回正确的网页窗口
    await sidePanel.setOptions({
      path: buildSidepanelUrl({ targetWindowId: windowId }),
      enabled: true,
    });
    // open() 必须紧贴用户手势调用栈，前面的 await 已尽量精简
    await sidePanel.open({ windowId });
    return true;
  };

  const sendMessageToActiveTab = async <T,>(
    tabId: number,
    message: Message
  ): Promise<MessageResponse<T>> => {
    let response = await MessageService.sendMessageToTab<T>(tabId, message);

    if (!response.success && /Receiving end does not exist|Could not establish connection/i.test(response.error || '')) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js'],
      });

      await new Promise(resolve => setTimeout(resolve, 300));
      response = await MessageService.sendMessageToTab<T>(tabId, message);
    }

    return response;
  };

  const interactionDisabled = syncing || isPopupInteractionDisabled({ switching, filling, aiScanning, startingAIRegion });
  const syncDisabled = interactionDisabled;

  if (loading) {
    return (
      <div className="popup-shell">
        <div className="popup-loading">加载中...</div>
      </div>
    );
  }

  return (
    <div className="popup-shell">
      <header className="popup-header">
        <div className="popup-brand-row">
          <img
            className="popup-brand-mark"
            src={getRuntimeUrl('icons/icon128.png')}
            alt=""
            aria-hidden="true"
          />
          <div>
            <h1>秋招网申助手</h1>
            <p>让每一次投递更高效</p>
          </div>
          <div className="popup-sync-control">
            <button
              type="button"
              className="popup-sync-button"
              aria-label="立即同步"
              onClick={() => void handleSyncNow()}
              disabled={syncDisabled}
            >
              {syncing ? '同步中…' : syncNotice === 'success' ? '✓' : '同步'}
              {syncNotice === 'success' && <span className="popup-sr-only">同步成功</span>}
            </button>
            {syncNotice === 'error' && <span className="popup-sync-error" role="alert">同步失败，请重试</span>}
          </div>
        </div>
        <div className="popup-record-actions">
          <button
            type="button"
            className="header-action-button"
            onClick={() => void handleOpenApplicationRecordCreate()}
            disabled={openingApplicationCreate || openingApplicationRecords}
          >
            {openingApplicationCreate ? '打开中...' : '新建投递记录'}
          </button>
          <button
            type="button"
            className="header-action-button header-action-button-secondary"
            onClick={() => void handleOpenApplicationRecords()}
            disabled={openingApplicationCreate || openingApplicationRecords}
          >
            {openingApplicationRecords ? '打开中...' : '打开投递记录'}
          </button>
        </div>
      </header>

      <div className="popup-content">
        {popupLoadError && <p className="resume-profile-selector-error" role="alert">{popupLoadError}</p>}
        {resumeProfiles && (
          <>
            <ResumeProfileSelector
              profiles={resumeProfiles.profiles}
              activeProfileId={resumeProfiles.activeProfileId}
              disabled={interactionDisabled}
              onSwitch={id => void handleProfileSwitch(id)}
            />
            {profileSwitchError && <p className="resume-profile-selector-error" role="alert">{profileSwitchError}</p>}
          </>
        )}
        {profile ? (
          <div className="profile-section">
            <div className="popup-metrics-strip">
              <div className="popup-metric">
                <div className="popup-metric-value">{detectedFields}</div>
                <div className="popup-metric-label">可填字段</div>
              </div>
              <div className="popup-metric">
                <div className="popup-metric-value">{profile.education.length}</div>
                <div className="popup-metric-label">教育经历</div>
              </div>
              <div className="popup-metric">
                <div className="popup-metric-value">{profile.experience.length}</div>
                <div className="popup-metric-label">工作经历</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="popup-empty-state">
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <p className="empty-title">尚未设置个人信息</p>
            <p className="empty-subtitle">完成资料设置后即可开始自动填充</p>
          </div>
        )}

        <div className="popup-actions">
          <button
            onClick={handleFillForm}
            disabled={!profile || interactionDisabled}
            className="button button-primary popup-primary-action"
          >
            {filling ? '填充中...' : '快速填充'}
          </button>

          <div className="popup-ai-actions">
            <button
              onClick={handleAIScanFill}
              disabled={!profile || interactionDisabled}
              className="button button-ai"
            >
              {aiScanning ? '扫描中...' : 'AI 扫描填充'}
            </button>

            <button
              onClick={handleStartAIRegionFill}
              disabled={!profile || interactionDisabled}
              className="button button-tonal"
            >
              {startingAIRegion ? '正在启动框选...' : 'AI 框选补填'}
            </button>
          </div>

          <div className="popup-support-actions">
            <button
              onClick={() => void handleOpenSidePanel()}
              disabled={openingView}
              className="button button-secondary"
            >
              {openingView ? '正在打开...' : '打开信息窗口'}
            </button>

            <button onClick={openOptions} className="button button-quiet popup-settings-action">
              设置个人信息
            </button>
          </div>
        </div>

        {detectedFields === 0 && profile && (
          <div className="popup-hint">
            当前页面未检测到可填充的表单字段
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
