import React, { useState, useEffect, useRef } from 'react';
import { MessageService } from '../shared/message';
import { shouldReloadProfile } from '../shared/profileStorageChange';
import type {
  UserProfile,
  PersonalInfo,
  CustomInformation,
  ParsedResumeData,
  ResumeProfileSummary,
  ActiveResumeContext,
} from '../shared/types';
import { AISettings } from './AISettings';
import { EducationSection } from './EducationSection';
import { ExperienceSection } from './ExperienceSection';
import { SkillsAwardsSection } from './SkillsAwardsSection';
import { DataSyncSettings } from './DataSyncSettings';
import { ApplicationRecordsSection } from './ApplicationRecordsSection';
import { ResumeProfileManager } from './ResumeProfileManager';
import { applyLoadedProfile, getExternalProfileChangeAction, isProfileDirty, profileSnapshot } from './profileState';
import { parsePDF } from '../parsers/pdfParser';
import { parseDOCX } from '../parsers/docxParser';

const OPTION_TABS = [
  'personal',
  'education',
  'experience',
  'skills-awards',
  'custom',
  'resume',
  'ai',
  'data-sync',
  'application-records',
] as const;

type OptionTab = typeof OPTION_TABS[number];

function getInitialActiveTab(search: string): OptionTab {
  const tab = new URLSearchParams(search).get('tab');
  return OPTION_TABS.includes(tab as OptionTab) ? tab as OptionTab : 'personal';
}

function hasChromeApis(): boolean {
  return typeof chrome !== 'undefined'
    && typeof chrome.storage !== 'undefined'
    && typeof chrome.runtime !== 'undefined';
}

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

/**
 * 汇总本次实际提取到的内容，用于上传后的提示。
 * 解析请求成功不代表提取到了字段，提示需要如实反映结果。
 */
function summarizeParsed(data: ParsedResumeData | undefined): string {
  if (!data) return '';

  const personalCount = Object.values(data.personal || {})
    .filter(value => typeof value === 'string' && value.trim()).length;

  const parts: string[] = [];
  if (personalCount > 0) parts.push(`个人信息 ${personalCount} 项`);
  if (data.education?.length) parts.push(`教育经历 ${data.education.length} 条`);
  if (data.experience?.length) parts.push(`工作/实习经历 ${data.experience.length} 条`);
  if (data.projects?.length) parts.push(`项目经历 ${data.projects.length} 条`);
  if (data.skills?.length) parts.push(`技能 ${data.skills.length} 项`);

  return parts.join('、');
}

/**
 * 在设置页（有 DOM）先把需要 DOM 的格式解析成文本。
 * PDF.js 需要 DOM；mammoth 的依赖 bluebird 在 service worker 中挑选调度器时
 * 可能触碰 document 而报 ReferenceError，故一并在此处理。
 * 其余纯文本格式返回 undefined，交由后台解析。
 */
async function preParseInPage(
  fileType: string,
  base64Data: string
): Promise<string | undefined> {
  switch (fileType) {
    case 'pdf':
      return await parsePDF(base64Data);
    case 'doc':
    case 'docx':
      return await parseDOCX(base64Data);
    default:
      return undefined;
  }
}

function resizeAutoGrowTextarea(element: HTMLTextAreaElement): void {
  const singleLineHeight = 39;
  element.style.height = 'auto';
  element.style.height = `${Math.max(singleLineHeight, element.scrollHeight)}px`;
}

function App() {
  const [profile, setProfile] = useState<UserProfile>({
    personal: {} as PersonalInfo,
    education: [],
    experience: [],
    projects: [],
    awards: [],
    customInformation: [],
    skills: [],
    certifications: []
  });
  const [loading, setLoading] = useState(hasChromeApis());
  const [profileSummary, setProfileSummary] = useState<ResumeProfileSummary | null>(null);
  const [savedProfileSnapshot, setSavedProfileSnapshot] = useState('');
  const [saving, setSaving] = useState(false);
  const [externalConflict, setExternalConflict] = useState<{ draftProfileId: string | null; externalProfileId: string | null; keptLocal: boolean; error?: string } | null>(null);
  const profileDirtyRef = useRef(false);
  const draftProfileIdRef = useRef<string | null>(null);
  const [activeTab, setActiveTab] = useState<OptionTab>(() => {
    if (typeof window === 'undefined') {
      return 'personal';
    }

    return getInitialActiveTab(window.location.search);
  });
  const [dataRevision, setDataRevision] = useState(0);
  const [parsingResume, setParsingResume] = useState(false);
  const [resumeNotice, setResumeNotice] = useState<{
    type: 'info' | 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);
  const [saveNotice, setSaveNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  profileDirtyRef.current = isProfileDirty(profile, savedProfileSnapshot);

  useEffect(() => {
    if (!saveNotice) return;
    const timer = window.setTimeout(() => setSaveNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [saveNotice]);

  useEffect(() => {
    if (!hasChromeApis()) {
      setLoading(false);
      return;
    }

    void (async () => {
      await loadProfile();
    })();
    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (!shouldReloadProfile(changes, areaName)) return;
      void (async () => {
        const context = await loadActiveContext();
        const externalProfileId = context?.activeProfileId ?? null;
        if (getExternalProfileChangeAction(profileDirtyRef.current) === 'prompt') {
          setExternalConflict({
            draftProfileId: draftProfileIdRef.current,
            externalProfileId,
            keptLocal: false,
          });
          return;
        }
        const result = await loadProfile(externalProfileId);
        if (result.success) setDataRevision(revision => revision + 1);
      })();
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const loadProfile = async (profileId: string | null = profileSummary?.activeProfileId ?? null): Promise<{ success: boolean; error?: string }> => {
    if (!hasChromeApis()) {
      setLoading(false);
      return { success: false, error: 'Chrome API 不可用' };
    }

    try {
      const response = await MessageService.sendMessage<ActiveResumeContext>({ type: 'GET_ACTIVE_RESUME_CONTEXT' });
      if (!response.success) return { success: false, error: response.error || '读取当前简历失败' };
      const context = response.data;
      if (context) setProfileSummary({ activeProfileId: context.activeProfileId, profiles: context.profiles });
      const loadedProfile: UserProfile = context?.profile || {
        personal: {} as PersonalInfo,
        education: [],
        experience: [],
        projects: [],
        awards: [],
        customInformation: [],
        skills: [],
        certifications: [],
      };
      applyLoadedProfile(loadedProfile, setProfile, setSavedProfileSnapshot);
      draftProfileIdRef.current = context?.activeProfileId ?? profileId;
      return { success: true };
    } catch (error) {
      console.error('Failed to load profile:', error);
      return { success: false, error: error instanceof Error ? error.message : '读取当前简历失败' };
    } finally {
      setLoading(false);
    }
  };

  const loadActiveContext = async (): Promise<ActiveResumeContext | null> => {
    const response = await MessageService.sendMessage<ActiveResumeContext>({ type: 'GET_ACTIVE_RESUME_CONTEXT' });
    if (!response.success || !response.data) return null;
    setProfileSummary({ activeProfileId: response.data.activeProfileId, profiles: response.data.profiles });
    return response.data;
  };

  const loadProfileSummary = async (): Promise<ResumeProfileSummary | null> => {
    try {
      const response = await MessageService.sendMessage<ResumeProfileSummary>({
        type: 'GET_RESUME_PROFILES',
      });
      if (response.success && response.data) {
        setProfileSummary(response.data);
        return response.data;
      }
    } catch (error) {
      console.error('Failed to load resume profiles:', error);
    }
    return null;
  };

  const reloadExternalProfile = async () => {
    if (!externalConflict) return;
    const result = await loadProfile(externalConflict.externalProfileId);
    if (result.success) {
      setDataRevision(revision => revision + 1);
      setExternalConflict(null);
      return;
    }
    setExternalConflict(conflict => conflict ? { ...conflict, error: result.error || '读取当前简历失败' } : conflict);
  };

  const handleExternalDataChange = () => {
    void loadProfile();
    setDataRevision(revision => revision + 1);
  };

  const handleSave = async () => {
    if ((profile.awards || []).some(award => !award.name.trim())) {
      setSaveNotice({ type: 'error', text: '请填写奖项名称后再保存' });
      return false;
    }
    if (externalConflict?.keptLocal) {
      setSaveNotice({ type: 'error', text: '当前草稿属于另一份简历，请先重新加载或切回原简历后再保存' });
      return false;
    }
    setSaving(true);
    try {
      const response = await MessageService.sendMessage({
        type: 'SAVE_USER_PROFILE',
        payload: { profile, expectedProfileId: draftProfileIdRef.current || profileSummary?.activeProfileId || '' }
      });

      if (response.success) {
        setSavedProfileSnapshot(profileSnapshot(profile));
        setSaveNotice({ type: 'success', text: '保存成功' });
        return true;
      } else {
        setSaveNotice({
          type: 'error',
          text: `保存失败：${response.error || '未知错误'}`,
        });
        return false;
      }
    } catch (error) {
      console.error('Save error:', error);
      setSaveNotice({ type: 'error', text: '保存时出错，请稍后重试' });
      return false;
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

  const addCustomInformation = () => {
    const item: CustomInformation = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: '',
      content: '',
    };
    setProfile({
      ...profile,
      customInformation: [...(profile.customInformation || []), item],
    });
  };

  const updateCustomInformation = (
    id: string,
    field: 'name' | 'content',
    value: string
  ) => {
    setProfile({
      ...profile,
      customInformation: (profile.customInformation || []).map(item =>
        item.id === id ? { ...item, [field]: value } : item
      ),
    });
  };

  const removeCustomInformation = (id: string) => {
    setProfile({
      ...profile,
      customInformation: (profile.customInformation || []).filter(item => item.id !== id),
    });
  };

  const moveCustomInformation = (index: number, delta: number) => {
    const current = profile.customInformation || [];
    const target = index + delta;
    if (target < 0 || target >= current.length) return;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    setProfile({ ...profile, customInformation: next });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsingResume(true);
    setResumeNotice({ type: 'info', text: `正在解析「${file.name}」，请稍候...` });

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Data = event.target?.result as string;
      const fileType = resolveFileType(file);

      try {
        // PDF 与 DOCX 依赖的库需要 DOM，在设置页（有 DOM）先解析出文本，
        // 后台就无需再触碰这些库
        const rawText = await preParseInPage(fileType, base64Data);

        const response = await MessageService.sendMessage({
          type: 'PARSE_RESUME',
          payload: {
            file: base64Data,
            fileType,
            fileName: file.name,
            rawText,
          }
        });

        if (response.success && response.data) {
          const result = response.data as {
            parsedData?: ParsedResumeData;
            parseMethod?: 'structured' | 'llm' | 'regex';
            llmError?: string;
          };
          const summary = summarizeParsed(result.parsedData);
          setSaveNotice({ type: 'success', text: '简历解析成功，请检查并确认提取的信息' });

          if (result.llmError) {
            // AI 解析失败会静默回退到正则，必须让用户知道，否则会误以为 AI 生效了
            setResumeNotice({
              type: 'warning',
              text: `「${file.name}」AI 解析失败，已改用本地规则解析${summary ? `，提取 ${summary}` : '，未提取到字段'}。`
                + `失败原因：${result.llmError}`,
            });
          } else if (summary) {
            const prefix = result.parseMethod === 'llm' ? 'AI 解析完成' : '解析完成';
            setResumeNotice({
              type: 'success',
              text: `「${file.name}」${prefix}，已提取 ${summary}，请核对。`,
            });
          } else {
            setResumeNotice({
              type: 'warning',
              text: `「${file.name}」已读取，但没能提取到可用字段。`
                + '若为扫描版 PDF（图片型）需改用文字版；也可在设置中配置 AI 服务提升提取效果。',
            });
          }

          loadProfile();
        } else {
          const message = response.error || '未知错误';
          setSaveNotice({ type: 'error', text: '简历解析失败，请重试' });
          setResumeNotice({ type: 'error', text: `简历解析失败：${message}` });
        }
      } catch (error) {
        console.error('Upload error:', error);
        setSaveNotice({ type: 'error', text: '上传简历时出错，请稍后重试' });
        setResumeNotice({ type: 'error', text: '上传简历时出错，请稍后重试。' });
      } finally {
        setParsingResume(false);
        e.target.value = '';
      }
    };

    reader.readAsDataURL(file);
  };

  if (loading) {
    return <div className="options-loading">加载中...</div>;
  }

  return (
    <div className="options-shell">
      {saveNotice && (
        <div
          className={`save-toast ${saveNotice.type}`}
          role="status"
          aria-live="polite"
        >
          {saveNotice.text}
        </div>
      )}
      {externalConflict && (
        <div className="resume-notice warning" role="alert">
          <span>{externalConflict.keptLocal ? '已保留本地修改；当前草稿属于另一份简历，重新加载或切回原简历前不能保存。' : '其他页面更新了当前简历。你有未保存的修改，请选择如何处理。'}</span>
          {externalConflict.error && <span role="alert">{externalConflict.error}</span>}
          <button type="button" className="btn btn-primary" onClick={() => void reloadExternalProfile()}>重新加载</button>
          <button type="button" className="btn btn-secondary" onClick={() => setExternalConflict(conflict => conflict ? { ...conflict, keptLocal: true, error: undefined } : conflict)}>保留本地修改</button>
        </div>
      )}
      <header className="options-header">
        <div className="options-header-inner">
          <h1>个人信息设置</h1>
          {profileSummary && (
          <ResumeProfileManager
            summary={profileSummary}
            dirty={isProfileDirty(profile, savedProfileSnapshot)}
            onSave={handleSave}
            onSummaryChange={setProfileSummary}
            onActiveProfileChange={async () => {
              const summary = await loadProfileSummary();
              const result = await loadProfile(summary?.activeProfileId ?? null);
              if (result.success) {
                setExternalConflict(null);
                setDataRevision(revision => revision + 1);
              }
            }}
          />
        )}
        </div>
      </header>

      <div className="options-content">
        <nav className="options-tabs" aria-label="设置分类">
          <button
            onClick={() => setActiveTab('personal')}
            className={activeTab === 'personal' ? 'options-tab active' : 'options-tab'}
          >
            基本信息
          </button>
          <button
            onClick={() => setActiveTab('education')}
            className={activeTab === 'education' ? 'options-tab active' : 'options-tab'}
          >
            教育经历
          </button>
          <button
            onClick={() => setActiveTab('experience')}
            className={activeTab === 'experience' ? 'options-tab active' : 'options-tab'}
          >
            实习项目
          </button>
          <button
            onClick={() => setActiveTab('skills-awards')}
            className={activeTab === 'skills-awards' ? 'options-tab active' : 'options-tab'}
          >
            技能荣誉
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={activeTab === 'custom' ? 'options-tab active' : 'options-tab'}
          >
            自定义信息
          </button>
          <button
            onClick={() => setActiveTab('resume')}
            className={activeTab === 'resume' ? 'options-tab active' : 'options-tab'}
          >
            简历上传
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className={activeTab === 'ai' ? 'options-tab active' : 'options-tab'}
          >
            AI设置
          </button>
          <button
            onClick={() => setActiveTab('data-sync')}
            className={activeTab === 'data-sync' ? 'options-tab active' : 'options-tab'}
          >
            数据与同步
          </button>
          <button
            onClick={() => setActiveTab('application-records')}
            className={activeTab === 'application-records' ? 'options-tab active' : 'options-tab'}
          >
            投递记录
          </button>
        </nav>

        <div className="options-panel">
          {activeTab === 'personal' && (
            <div className="options-form">
              <h2 className="section-title">个人基本信息</h2>

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

              <div style={styles.formGroup}>
                <label style={styles.label}>兴趣爱好</label>
                <textarea
                  value={profile.personal.hobbies || ''}
                  onChange={event => handlePersonalChange('hobbies', event.target.value)}
                  style={{ ...styles.input, ...styles.autoGrowTextarea }}
                  placeholder="请输入兴趣爱好"
                  rows={1}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>自我评价</label>
                <textarea
                  value={profile.personal.selfEvaluation || ''}
                  onChange={(e) => {
                    resizeAutoGrowTextarea(e.currentTarget);
                    handlePersonalChange('selfEvaluation', e.target.value);
                  }}
                  ref={(element) => {
                    if (element) resizeAutoGrowTextarea(element);
                  }}
                  style={{ ...styles.input, ...styles.autoGrowTextarea }}
                  placeholder="简要描述个人优势、能力特点和职业倾向，可用于网申自我评价字段"
                  rows={1}
                />
              </div>

              <div className="info-note">
                提示：带 * 的为必填项。你也可以通过上传简历来快速填充这些信息。
                身份证号仅保存在本地浏览器中，不会上传到任何服务器。
              </div>
            </div>
          )}

          {activeTab === 'education' && (
            <div className="options-form">
              <EducationSection
                items={profile.education || []}
                onChange={education => setProfile({ ...profile, education })}
              />
            </div>
          )}

          {activeTab === 'experience' && (
            <div className="options-form">
              <ExperienceSection
                experience={profile.experience || []}
                projects={profile.projects || []}
                onChangeExperience={experience => setProfile({ ...profile, experience })}
                onChangeProjects={projects => setProfile({ ...profile, projects })}
              />
            </div>
          )}

          {activeTab === 'skills-awards' && (
            <div className="options-form">
              <SkillsAwardsSection
                skills={profile.skills || []}
                awards={profile.awards || []}
                onChangeSkills={skills => setProfile({ ...profile, skills })}
                onChangeAwards={awards => setProfile({ ...profile, awards })}
              />
            </div>
          )}

          {activeTab === 'custom' && (
            <div className="options-form">
              <div className="custom-information-header">
                <div>
                  <h2 className="section-title">自定义信息</h2>
                  <p className="custom-information-description">
                    添加网申中经常使用、但不属于现有分类的信息。
                  </p>
                </div>
              </div>

              {(profile.customInformation || []).length === 0 ? (
                <div className="custom-information-empty">
                  <p>暂无自定义信息</p>
                  <span>点击“添加”创建信息名称和信息内容。</span>
                </div>
              ) : (
                <div className="custom-information-list">
                  {(profile.customInformation || []).map((item, index) => (
                    <section className="custom-information-item" key={item.id}>
                      <div className="custom-information-item-header">
                        <h3>自定义信息 {index + 1}</h3>
                        <div>
                          <button
                            type="button"
                            className="custom-information-remove"
                            onClick={() => moveCustomInformation(index, -1)}
                            disabled={index === 0}
                          >
                            上移
                          </button>
                          <button
                            type="button"
                            className="custom-information-remove"
                            onClick={() => moveCustomInformation(index, 1)}
                            disabled={index === (profile.customInformation || []).length - 1}
                          >
                            下移
                          </button>
                          <button
                            type="button"
                            className="custom-information-remove"
                            onClick={() => removeCustomInformation(item.id)}
                            aria-label={`删除自定义信息 ${index + 1}`}
                          >
                            删除
                          </button>
                        </div>
                      </div>
                      <div className="custom-information-fields">
                        <label>
                          <span>信息名称</span>
                          <input
                            type="text"
                            value={item.name}
                            onChange={event =>
                              updateCustomInformation(item.id, 'name', event.target.value)
                            }
                            placeholder="例如：期望薪资"
                          />
                        </label>
                        <label>
                          <span>信息内容</span>
                          <textarea
                            value={item.content}
                            onChange={event =>
                              updateCustomInformation(item.id, 'content', event.target.value)
                            }
                            placeholder="请输入需要快速填写或复制的内容"
                            rows={3}
                          />
                        </label>
                      </div>
                    </section>
                  ))}
                </div>
              )}
              <button type="button" className="btn btn-secondary" onClick={addCustomInformation}>
                添加
              </button>
            </div>
          )}

          {activeTab === 'resume' && (
            <div className="options-form">
              <h2 className="section-title">上传简历</h2>

              <div className="upload-container">
                <div className={parsingResume ? 'upload-area parsing' : 'upload-area'}>
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  <p className="upload-title">{parsingResume ? '正在解析简历...' : '点击或拖拽文件到此处上传'}</p>
                  <p className="upload-hint">
                    {parsingResume ? '请保持当前页面打开，解析完成后会自动提示。' : '支持 PDF、DOCX、MD、TXT、JSON 格式'}
                  </p>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.md,.txt,.json"
                    onChange={handleFileUpload}
                    className="file-input"
                    disabled={parsingResume}
                  />
                </div>

                {resumeNotice && (
                  <div className={`resume-notice ${resumeNotice.type}`} role="status" aria-live="polite">
                    {resumeNotice.text}
                  </div>
                )}

                {profile.resume && (
                  <div className="resume-info">
                    <h3>已上传的简历</h3>
                    <div className="resume-item">
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                      </svg>
                      <span>{profile.resume.fileName}</span>
                    </div>
                  </div>
                )}

                <div className="info-note">
                  上传简历后，系统会自动解析并提取个人信息、教育经历、工作经验等内容。
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ai' && <AISettings dataRevision={dataRevision} />}

          {activeTab === 'data-sync' && (
            <DataSyncSettings onDataChanged={handleExternalDataChange} />
          )}

          {activeTab === 'application-records' && <ApplicationRecordsSection />}

          {activeTab !== 'ai' && activeTab !== 'data-sync' && activeTab !== 'application-records' && (
            <div className="options-actions">
            <button onClick={handleSave} disabled={saving || externalConflict?.keptLocal === true} className="btn btn-primary">
              {saving ? '保存中...' : '保存设置'}
            </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
    border: '1px solid var(--color-border)',
    borderRadius: '9px',
    outline: 'none',
    transition: 'border-color 0.2s',
    fontFamily: 'inherit'
  },
  autoGrowTextarea: {
    minHeight: '39px',
    height: '39px',
    lineHeight: '18px',
    overflowY: 'hidden',
    resize: 'none'
  }
};

export default App;
