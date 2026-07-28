import React, { useState, useEffect } from 'react';
import { MessageService } from '../shared/message';
import type { UserProfile, PersonalInfo } from '../shared/types';
import { AISettings } from './AISettings';
import { EducationSection } from './EducationSection';
import { ExperienceSection } from './ExperienceSection';

/** MIME 类型到扩展名的兜底映射，用于文件名缺少扩展名的情况 */
const MIME_TO_EXT: Record<string, string> = {
  'application/json': 'json',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'text/markdown': 'md',
  'text/plain': 'txt',
};

/**
 * 解析上传文件的类型。优先取文件名扩展名；
 * 文件名无扩展名（或含多个点导致误判）时回退到 MIME 类型。
 */
function resolveFileType(file: File): string {
  const name = file.name.trim();
  const dotIndex = name.lastIndexOf('.');
  const ext = dotIndex > 0 ? name.slice(dotIndex + 1).toLowerCase() : '';

  const known = ['pdf', 'doc', 'docx', 'md', 'markdown', 'txt', 'json'];
  if (known.includes(ext)) return ext;

  return MIME_TO_EXT[file.type] || ext;
}

function App() {
  const [profile, setProfile] = useState<UserProfile>({
    personal: {} as PersonalInfo,
    education: [],
    experience: [],
    projects: [],
    skills: [],
    certifications: []
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('personal');

  useEffect(() => {
    loadProfile();
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

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await MessageService.sendMessage({
        type: 'SAVE_USER_PROFILE',
        payload: profile
      });

      if (response.success) {
        alert('保存成功！');
      } else {
        alert('保存失败：' + (response.error || '未知错误'));
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('保存时出错');
    } finally {
      setSaving(false);
    }
  };

  const handlePersonalChange = (field: keyof PersonalInfo, value: string) => {
    setProfile({
      ...profile,
      personal: {
        ...profile.personal,
        [field]: value
      }
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Data = event.target?.result as string;
      const fileType = resolveFileType(file);

      try {
        const response = await MessageService.sendMessage({
          type: 'PARSE_RESUME',
          payload: {
            file: base64Data,
            fileType,
            fileName: file.name
          }
        });

        if (response.success && response.data) {
          alert('简历解析成功！请检查并确认提取的信息。');
          loadProfile();
        } else {
          alert('简历解析失败：' + (response.error || '未知错误'));
        }
      } catch (error) {
        console.error('Upload error:', error);
        alert('上传简历时出错');
      }
    };

    reader.readAsDataURL(file);
  };

  if (loading) {
    return <div style={styles.loading}>加载中...</div>;
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>秋招网申助手 - 个人信息设置</h1>
      </header>

      <div style={styles.content}>
        <div style={styles.tabs}>
          <button
            onClick={() => setActiveTab('personal')}
            style={{
              ...styles.tab,
              ...(activeTab === 'personal' && styles.activeTab)
            }}
          >
            基本信息
          </button>
          <button
            onClick={() => setActiveTab('education')}
            style={{
              ...styles.tab,
              ...(activeTab === 'education' && styles.activeTab)
            }}
          >
            教育经历
          </button>
          <button
            onClick={() => setActiveTab('experience')}
            style={{
              ...styles.tab,
              ...(activeTab === 'experience' && styles.activeTab)
            }}
          >
            实习与项目
          </button>
          <button
            onClick={() => setActiveTab('resume')}
            style={{
              ...styles.tab,
              ...(activeTab === 'resume' && styles.activeTab)
            }}
          >
            简历上传
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            style={{
              ...styles.tab,
              ...(activeTab === 'ai' && styles.activeTab)
            }}
          >
            AI设置
          </button>
        </div>

        <div style={styles.formContainer}>
          {activeTab === 'personal' && (
            <div style={styles.form}>
              <h2 style={styles.sectionTitle}>个人基本信息</h2>

              <div style={styles.formGroup}>
                <label style={styles.label}>姓名 *</label>
                <input
                  type="text"
                  value={profile.personal.name || ''}
                  onChange={(e) => handlePersonalChange('name', e.target.value)}
                  style={styles.input}
                  placeholder="请输入姓名"
                />
              </div>

              <div style={styles.formRow}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>性别</label>
                  <select
                    value={profile.personal.gender || ''}
                    onChange={(e) => handlePersonalChange('gender', e.target.value)}
                    style={styles.input}
                  >
                    <option value="">请选择</option>
                    <option value="男">男</option>
                    <option value="女">女</option>
                  </select>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>出生日期</label>
                  <input
                    type="text"
                    value={profile.personal.birthDate || ''}
                    onChange={(e) => handlePersonalChange('birthDate', e.target.value)}
                    style={styles.input}
                    placeholder="如 2002年5月 或 2002-05"
                  />
                </div>
              </div>

              <div style={styles.formRow}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>政治面貌</label>
                  <select
                    value={profile.personal.politicalStatus || ''}
                    onChange={(e) => handlePersonalChange('politicalStatus', e.target.value)}
                    style={styles.input}
                  >
                    <option value="">请选择</option>
                    <option value="中共党员">中共党员</option>
                    <option value="中共预备党员">中共预备党员</option>
                    <option value="共青团员">共青团员</option>
                    <option value="群众">群众</option>
                    <option value="民主党派">民主党派</option>
                  </select>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>民族</label>
                  <input
                    type="text"
                    value={profile.personal.ethnicity || ''}
                    onChange={(e) => handlePersonalChange('ethnicity', e.target.value)}
                    style={styles.input}
                    placeholder="如 汉族"
                  />
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>手机号 *</label>
                <input
                  type="tel"
                  value={profile.personal.phone || ''}
                  onChange={(e) => handlePersonalChange('phone', e.target.value)}
                  style={styles.input}
                  placeholder="请输入手机号"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>邮箱 *</label>
                <input
                  type="email"
                  value={profile.personal.email || ''}
                  onChange={(e) => handlePersonalChange('email', e.target.value)}
                  style={styles.input}
                  placeholder="请输入邮箱"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>微信号</label>
                <input
                  type="text"
                  value={profile.personal.wechat || ''}
                  onChange={(e) => handlePersonalChange('wechat', e.target.value)}
                  style={styles.input}
                  placeholder="请输入微信号"
                />
              </div>

              <div style={styles.formRow}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>籍贯</label>
                  <input
                    type="text"
                    value={profile.personal.hometown || ''}
                    onChange={(e) => handlePersonalChange('hometown', e.target.value)}
                    style={styles.input}
                    placeholder="如 河北省石家庄市"
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>现居地</label>
                  <input
                    type="text"
                    value={profile.personal.currentAddress || ''}
                    onChange={(e) => handlePersonalChange('currentAddress', e.target.value)}
                    style={styles.input}
                    placeholder="如 北京市海淀区"
                  />
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>身份证号</label>
                <input
                  type="text"
                  value={profile.personal.idCard || ''}
                  onChange={(e) => handlePersonalChange('idCard', e.target.value)}
                  style={styles.input}
                  placeholder="部分网申需要，可留空"
                  autoComplete="off"
                />
              </div>

              <div style={styles.hint}>
                💡 提示：带 * 的为必填项。你也可以通过上传简历来快速填充这些信息。
                身份证号仅保存在本地浏览器中，不会上传到任何服务器。
              </div>
            </div>
          )}

          {activeTab === 'education' && (
            <div style={styles.form}>
              <EducationSection
                items={profile.education || []}
                onChange={education => setProfile({ ...profile, education })}
              />
            </div>
          )}

          {activeTab === 'experience' && (
            <div style={styles.form}>
              <ExperienceSection
                experience={profile.experience || []}
                projects={profile.projects || []}
                skills={profile.skills || []}
                onChangeExperience={experience => setProfile({ ...profile, experience })}
                onChangeProjects={projects => setProfile({ ...profile, projects })}
                onChangeSkills={skills => setProfile({ ...profile, skills })}
              />
            </div>
          )}

          {activeTab === 'resume' && (
            <div style={styles.form}>
              <h2 style={styles.sectionTitle}>上传简历</h2>

              <div style={styles.uploadContainer}>
                <div style={styles.uploadArea}>
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#667eea"
                    strokeWidth="2"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  <p style={styles.uploadText}>点击或拖拽文件到此处上传</p>
                  <p style={styles.uploadHint}>支持 PDF、DOCX、MD、TXT、JSON 格式</p>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.md,.txt,.json"
                    onChange={handleFileUpload}
                    style={styles.fileInput}
                  />
                </div>

                {profile.resume && (
                  <div style={styles.resumeInfo}>
                    <h3 style={styles.resumeTitle}>已上传的简历</h3>
                    <div style={styles.resumeItem}>
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#667eea"
                        strokeWidth="2"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                      </svg>
                      <span>{profile.resume.fileName}</span>
                    </div>
                  </div>
                )}

                <div style={styles.hint}>
                  💡 上传简历后，系统会自动解析并提取个人信息、教育经历、工作经验等内容。
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ai' && <AISettings />}
        </div>

        {/* AI 设置页有自己的保存按钮（保存的是 LLM 配置），此处仅保存个人信息 */}
        {activeTab !== 'ai' && (
          <div style={styles.actions}>
            <button onClick={handleSave} disabled={saving} style={styles.saveButton}>
              {saving ? '保存中...' : '保存设置'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f9fafb'
  },
  header: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    padding: '30px 40px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
  },
  title: {
    margin: 0,
    fontSize: '24px',
    fontWeight: '600'
  },
  content: {
    maxWidth: '800px',
    margin: '40px auto',
    padding: '0 20px'
  },
  loading: {
    textAlign: 'center',
    padding: '60px',
    fontSize: '18px',
    color: '#666'
  },
  tabs: {
    display: 'flex',
    gap: '8px',
    marginBottom: '20px'
  },
  tab: {
    padding: '12px 24px',
    border: 'none',
    backgroundColor: '#f9fafb',
    color: '#666',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    borderRadius: '8px 8px 0 0',
    transition: 'all 0.2s',
    fontFamily: 'inherit',
    borderBottom: '3px solid transparent'
  },
  activeTab: {
    backgroundColor: 'white',
    color: '#667eea',
    fontWeight: '600',
    borderBottom: '3px solid #667eea'
  },
  formContainer: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '30px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
  },
  form: {},
  sectionTitle: {
    margin: '0 0 24px 0',
    fontSize: '18px',
    fontWeight: '600',
    color: '#333'
  },
  formGroup: {
    marginBottom: '20px',
    flex: 1
  },
  formRow: {
    display: 'flex',
    gap: '20px'
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#333'
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    outline: 'none',
    transition: 'border-color 0.2s',
    fontFamily: 'inherit'
  },
  uploadContainer: {
    textAlign: 'center'
  },
  uploadArea: {
    position: 'relative',
    border: '2px dashed #d1d5db',
    borderRadius: '8px',
    padding: '40px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginBottom: '20px'
  },
  uploadText: {
    margin: '16px 0 8px',
    fontSize: '16px',
    fontWeight: '500',
    color: '#333'
  },
  uploadHint: {
    margin: 0,
    fontSize: '14px',
    color: '#666'
  },
  fileInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    opacity: 0,
    cursor: 'pointer'
  },
  resumeInfo: {
    backgroundColor: '#f3f4f6',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '20px',
    textAlign: 'left'
  },
  resumeTitle: {
    margin: '0 0 12px 0',
    fontSize: '14px',
    fontWeight: '600',
    color: '#333'
  },
  resumeItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '14px',
    color: '#666'
  },
  hint: {
    marginTop: '20px',
    padding: '12px 16px',
    backgroundColor: '#fef3c7',
    borderRadius: '6px',
    fontSize: '13px',
    color: '#92400e',
    textAlign: 'left'
  },
  actions: {
    marginTop: '24px',
    textAlign: 'center'
  },
  saveButton: {
    padding: '14px 40px',
    border: 'none',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontFamily: 'inherit'
  }
};

export default App;
