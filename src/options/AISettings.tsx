import React, { useState, useEffect } from 'react';
import { MessageService } from '../shared/message';
import { LLMProvider, PROVIDER_PRESETS, PROVIDER_ORDER } from '../services/llm/types';
import type { LLMConfig } from '../services/llm/types';

export function AISettings() {
  const [config, setConfig] = useState<LLMConfig>({
    provider: LLMProvider.DEEPSEEK,
    apiKey: '',
    baseUrl: PROVIDER_PRESETS[LLMProvider.DEEPSEEK].baseUrl,
    model: PROVIDER_PRESETS[LLMProvider.DEEPSEEK].defaultModel,
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [saved, setSaved] = useState(false);
  /** 用户是否手动编辑过 API 地址；为 true 时切换服务商不覆盖地址 */
  const [urlEdited, setUrlEdited] = useState(false);
  /** 用户是否手动编辑过模型名称；为 true 时切换服务商不覆盖模型 */
  const [modelEdited, setModelEdited] = useState(false);

  useEffect(() => {
    MessageService.sendMessage({ type: 'GET_LLM_CONFIG' }).then(res => {
      if (res.success && res.data) {
        const stored = res.data as LLMConfig;
        setConfig(stored);
        // 已保存的值若不是该服务商的官方默认值，视为自定义并予以保留
        const storedPreset = PROVIDER_PRESETS[stored.provider];
        setUrlEdited(stored.baseUrl.trim() !== (storedPreset?.baseUrl ?? '').trim());
        setModelEdited(stored.model.trim() !== (storedPreset?.defaultModel ?? '').trim());
      }
    });
  }, []);

  const preset = PROVIDER_PRESETS[config.provider] ?? PROVIDER_PRESETS[LLMProvider.CUSTOM];

  const handleProviderChange = (provider: LLMProvider) => {
    const next = PROVIDER_PRESETS[provider];
    setConfig({
      ...config,
      provider,
      // 用户手动改过的地址/模型不再覆盖，避免自定义代理与模型被重置
      baseUrl: urlEdited ? config.baseUrl : next.baseUrl,
      model: modelEdited ? config.model : next.defaultModel,
    });
    setTestResult(null);
    setErrorMsg('');
  };

  const handleBaseUrlChange = (baseUrl: string) => {
    setUrlEdited(true);
    setConfig({ ...config, baseUrl });
  };

  const handleModelChange = (model: string) => {
    setModelEdited(true);
    setConfig({ ...config, model });
  };

  /** 把地址恢复为当前服务商的官方默认值 */
  const handleResetBaseUrl = () => {
    setUrlEdited(false);
    setConfig({ ...config, baseUrl: preset.baseUrl });
  };

  /** 把模型恢复为当前服务商的默认模型 */
  const handleResetModel = () => {
    setModelEdited(false);
    setConfig({ ...config, model: preset.defaultModel });
  };

  const handleSave = async () => {
    await MessageService.sendMessage({
      type: 'SAVE_LLM_CONFIG',
      payload: config,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setErrorMsg('');
    // 传入当前界面填写的配置，无需先保存即可测试
    const res = await MessageService.sendMessage({
      type: 'TEST_LLM_CONNECTION',
      payload: config,
    });
    setTestResult(res.success ? 'success' : 'fail');
    if (!res.success) setErrorMsg(res.error || '连接失败，请检查配置');
    setTesting(false);
  };

  return (
    <div>
      <h2 style={styles.sectionTitle}>AI 模型设置</h2>
      <p style={styles.description}>
        配置 AI 服务后，插件可以自动生成开放性问题的回答、智能解析简历、以及语义匹配表单字段。
      </p>

      <div style={styles.formGroup}>
        <label style={styles.label}>服务商</label>
        <select
          value={config.provider}
          onChange={e => handleProviderChange(e.target.value as LLMProvider)}
          style={styles.input}
        >
          {PROVIDER_ORDER.map(p => (
            <option key={p} value={p}>{PROVIDER_PRESETS[p].label}</option>
          ))}
        </select>
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>API Key</label>
        <input
          type="password"
          value={config.apiKey}
          onChange={e => setConfig({ ...config, apiKey: e.target.value })}
          style={styles.input}
          placeholder="sk-..."
        />
        {preset.consoleUrl && (
          <a
            href={preset.consoleUrl}
            target="_blank"
            rel="noreferrer"
            style={styles.hintLink}
          >
            前往 {preset.label} 控制台获取 API Key →
          </a>
        )}
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>API 地址（可自定义代理）</label>
        <input
          type="url"
          value={config.baseUrl}
          onChange={e => handleBaseUrlChange(e.target.value)}
          style={styles.input}
          placeholder="https://api.example.com/v1"
        />
        {urlEdited && preset.baseUrl && config.baseUrl.trim() !== preset.baseUrl && (
          <p style={styles.hint}>
            已使用自定义地址，切换服务商时不会被覆盖。
            <button onClick={handleResetBaseUrl} style={styles.linkButton}>
              恢复 {preset.label} 默认地址
            </button>
          </p>
        )}
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>模型名称</label>
        <input
          type="text"
          value={config.model}
          onChange={e => handleModelChange(e.target.value)}
          style={styles.input}
          list="model-suggestions"
          placeholder={preset.defaultModel || '例如：gpt-4o-mini'}
        />
        <datalist id="model-suggestions">
          {preset.models.map(m => <option key={m} value={m} />)}
        </datalist>
        {modelEdited && preset.defaultModel && config.model.trim() !== preset.defaultModel ? (
          <p style={styles.hint}>
            已使用自定义模型，切换服务商时不会被覆盖。
            <button onClick={handleResetModel} style={styles.linkButton}>
              恢复 {preset.defaultModel}
            </button>
          </p>
        ) : preset.models.length > 0 && (
          <p style={styles.hint}>
            常用模型：{preset.models.join('、')}。模型更新较快，如提示模型不存在请到官方文档核对名称。
          </p>
        )}
      </div>

      <div style={styles.buttonRow}>
        <button
          onClick={handleTest}
          disabled={testing || !config.apiKey}
          style={{
            ...styles.testButton,
            opacity: (testing || !config.apiKey) ? 0.6 : 1,
          }}
        >
          {testing ? '测试中...' : '测试连接'}
        </button>
        {testResult === 'success' && <span style={styles.success}>连接成功</span>}
      </div>

      {testResult === 'fail' && (
        <div style={styles.errorBox}>
          <strong>连接失败</strong>
          <p style={styles.errorText}>{errorMsg}</p>
        </div>
      )}

      <div style={styles.buttonRow}>
        <button onClick={handleSave} style={styles.saveButton}>
          {saved ? '已保存 ✓' : '保存设置'}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sectionTitle: {
    margin: '0 0 8px 0',
    fontSize: '18px',
    fontWeight: '600',
    color: '#333',
  },
  description: {
    margin: '0 0 24px 0',
    fontSize: '14px',
    color: '#666',
  },
  formGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#333',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    outline: 'none',
    transition: 'border-color 0.2s',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  buttonRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  hint: {
    margin: '6px 0 0 0',
    fontSize: '12px',
    color: '#888',
    lineHeight: 1.5,
  },
  errorBox: {
    padding: '12px 14px',
    marginBottom: '16px',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    fontSize: '13px',
  },
  errorText: {
    margin: '6px 0 0 0',
    fontSize: '12px',
    lineHeight: 1.6,
    wordBreak: 'break-all',
    fontFamily: 'ui-monospace, monospace',
  },
  hintLink: {
    display: 'inline-block',
    marginTop: '6px',
    fontSize: '12px',
    color: '#667eea',
    textDecoration: 'none',
  },
  linkButton: {
    marginLeft: '6px',
    padding: 0,
    border: 'none',
    background: 'none',
    color: '#667eea',
    fontSize: '12px',
    cursor: 'pointer',
    textDecoration: 'underline',
    fontFamily: 'inherit',
  },
  testButton: {
    padding: '10px 20px',
    border: '1px solid #667eea',
    borderRadius: '6px',
    backgroundColor: 'white',
    color: '#667eea',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  saveButton: {
    padding: '12px 32px',
    border: 'none',
    borderRadius: '6px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  success: {
    fontSize: '14px',
    color: '#10b981',
    fontWeight: '500',
  },
  fail: {
    fontSize: '14px',
    color: '#ef4444',
    fontWeight: '500',
  },
};
