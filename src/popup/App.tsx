import { useState, useEffect } from 'react';
import { MessageService } from '../shared/message';
import type { Message, MessageResponse, UserProfile } from '../shared/types';
import { buildSidepanelUrl, type SidepanelView } from '../sidepanel/navigation';

function App() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [filling, setFilling] = useState(false);
  const [startingAIRegion, setStartingAIRegion] = useState(false);
  const [openingView, setOpeningView] = useState<SidepanelView | null>(null);
  const [detectedFields, setDetectedFields] = useState(0);

  useEffect(() => {
    loadProfile();
    detectFields();
  }, []);

  const loadProfile = async () => {
    try {
      const response = await MessageService.sendMessage<UserProfile>({
        type: 'GET_USER_PROFILE'
      });

      if (response.success && response.data) {
        setProfile(response.data);
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setLoading(false);
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

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  const handleStartAIRegionFill = async () => {
    if (!profile) {
      alert('请先设置个人信息！');
      openOptions();
      return;
    }

    setStartingAIRegion(true);
    try {
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

  const handleOpenSidePanel = async (view: SidepanelView) => {
    setOpeningView(view);
    try {
      await openSidePanelFallbackWindow(view);
      window.close();
    } catch (error) {
      alert(error instanceof Error ? error.message : '打开资料窗口失败');
      setOpeningView(null);
    }
  };

  const openSidePanelFallbackWindow = async (view: SidepanelView) => {
    const currentWindow = await chrome.windows.getCurrent();
    const width = 420;
    const height = Math.max(640, Math.min(900, currentWindow.height || 800));
    const left = currentWindow.left !== undefined && currentWindow.width !== undefined
      ? currentWindow.left + Math.max(0, currentWindow.width - width)
      : undefined;
    const top = currentWindow.top;

    await chrome.windows.create({
      url: chrome.runtime.getURL(buildSidepanelUrl({
        targetWindowId: currentWindow.id,
        view,
      })),
      type: 'popup',
      width,
      height,
      left,
      top,
      focused: true,
    });
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
        <img
          className="popup-brand-mark"
          src={chrome.runtime.getURL('icons/icon128.png')}
          alt=""
          aria-hidden="true"
        />
        <div>
          <h1>秋招网申助手</h1>
          <p>让每一次投递更高效</p>
        </div>
      </header>

      <div className="popup-content">
        {profile ? (
          <div className="profile-section">
            <div className="profile-card">
              <div className="profile-card-heading">当前信息</div>
              <div className="profile-row">
                <span className="profile-label">姓名</span>
                <span className="profile-value">{profile.personal.name || '未设置'}</span>
              </div>
              <div className="profile-row">
                <span className="profile-label">邮箱</span>
                <span className="profile-value">{profile.personal.email || '未设置'}</span>
              </div>
              <div className="profile-row">
                <span className="profile-label">手机</span>
                <span className="profile-value">{profile.personal.phone || '未设置'}</span>
              </div>
            </div>

            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{detectedFields}</div>
                <div className="stat-label">可填字段</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{profile.education.length}</div>
                <div className="stat-label">教育经历</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{profile.experience.length}</div>
                <div className="stat-label">工作经历</div>
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
            onClick={() => void handleOpenSidePanel('profile')}
            disabled={openingView !== null}
            className="button button-secondary"
          >
            {openingView === 'profile' ? '正在打开浮窗...' : '打开信息浮窗'}
          </button>

          <button
            onClick={() => void handleOpenSidePanel('applications')}
            disabled={openingView !== null}
            className="button button-secondary"
          >
            {openingView === 'applications' ? '正在打开记录...' : '打开投递记录'}
          </button>

          <button
            onClick={handleFillForm}
            disabled={!profile || filling || startingAIRegion}
            className="button button-primary"
          >
            {filling ? '填充中...' : '一键填充表单'}
          </button>

          <button
            onClick={handleStartAIRegionFill}
            disabled={!profile || filling || startingAIRegion}
            className="button button-tonal"
          >
            {startingAIRegion ? '正在启动框选...' : 'AI 框选补填'}
          </button>

          <button onClick={openOptions} className="button button-quiet">
            设置个人信息
          </button>
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
