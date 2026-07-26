import React, { useState, useEffect } from 'react';
import { MessageService } from '../shared/message';
import type { UserProfile } from '../shared/types';

function App() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [filling, setFilling] = useState(false);
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

      const response = await MessageService.sendMessageToTab(tab.id, {
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

      const response = await MessageService.sendMessageToTab(tab.id, {
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

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>加载中...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>秋招网申助手</h1>
      </header>

      <div style={styles.content}>
        {profile ? (
          <div style={styles.profileSection}>
            <div style={styles.profileInfo}>
              <div style={styles.infoRow}>
                <span style={styles.label}>姓名：</span>
                <span style={styles.value}>{profile.personal.name || '未设置'}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.label}>邮箱：</span>
                <span style={styles.value}>{profile.personal.email || '未设置'}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.label}>手机：</span>
                <span style={styles.value}>{profile.personal.phone || '未设置'}</span>
              </div>
            </div>

            <div style={styles.statsSection}>
              <div style={styles.stat}>
                <div style={styles.statValue}>{detectedFields}</div>
                <div style={styles.statLabel}>检测到的字段</div>
              </div>
              <div style={styles.stat}>
                <div style={styles.statValue}>{profile.education.length}</div>
                <div style={styles.statLabel}>教育经历</div>
              </div>
              <div style={styles.stat}>
                <div style={styles.statValue}>{profile.experience.length}</div>
                <div style={styles.statLabel}>工作经历</div>
              </div>
            </div>
          </div>
        ) : (
          <div style={styles.emptyState}>
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ccc"
              strokeWidth="2"
              style={{ marginBottom: '16px' }}
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <p style={styles.emptyText}>尚未设置个人信息</p>
            <p style={styles.emptySubtext}>请先完成个人信息设置</p>
          </div>
        )}

        <div style={styles.actions}>
          <button
            onClick={handleFillForm}
            disabled={!profile || filling || detectedFields === 0}
            style={{
              ...styles.button,
              ...styles.primaryButton,
              ...((!profile || filling || detectedFields === 0) && styles.disabledButton)
            }}
          >
            {filling ? '填充中...' : '一键填充表单'}
          </button>

          <button onClick={openOptions} style={{ ...styles.button, ...styles.secondaryButton }}>
            设置个人信息
          </button>
        </div>

        {detectedFields === 0 && profile && (
          <div style={styles.hint}>
            💡 当前页面未检测到可填充的表单字段
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '350px',
    minHeight: '400px',
    backgroundColor: '#f9fafb'
  },
  header: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    padding: '20px',
    textAlign: 'center'
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '600'
  },
  content: {
    padding: '20px'
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: '#666'
  },
  profileSection: {
    marginBottom: '20px'
  },
  profileInfo: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
    fontSize: '14px'
  },
  label: {
    color: '#666',
    fontWeight: '500'
  },
  value: {
    color: '#333',
    fontWeight: '600'
  },
  statsSection: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px'
  },
  stat: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '12px',
    textAlign: 'center',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  statValue: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#667eea',
    marginBottom: '4px'
  },
  statLabel: {
    fontSize: '12px',
    color: '#666'
  },
  emptyState: {
    textAlign: 'center',
    padding: '40px 20px',
    backgroundColor: 'white',
    borderRadius: '8px',
    marginBottom: '20px'
  },
  emptyText: {
    margin: '0 0 8px 0',
    fontSize: '16px',
    fontWeight: '600',
    color: '#333'
  },
  emptySubtext: {
    margin: 0,
    fontSize: '14px',
    color: '#666'
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  button: {
    padding: '12px 20px',
    borderRadius: '8px',
    border: 'none',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontFamily: 'inherit'
  },
  primaryButton: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white'
  },
  secondaryButton: {
    backgroundColor: 'white',
    color: '#667eea',
    border: '2px solid #667eea'
  },
  disabledButton: {
    opacity: 0.5,
    cursor: 'not-allowed'
  },
  hint: {
    marginTop: '16px',
    padding: '12px',
    backgroundColor: '#fef3c7',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#92400e',
    textAlign: 'center'
  }
};

export default App;
