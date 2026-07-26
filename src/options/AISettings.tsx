import React, { useState, useEffect } from 'react';
import { MessageService } from '../shared/message';
import { LLMProvider, PROVIDER_PRESETS } from '../services/llm/types';
import type { LLMConfig } from '../services/llm/types';

export function AISettings() {
  const [config, setConfig] = useState<LLMConfig>({
    provider: LLMProvider.OPENAI,
    apiKey: '',
    baseUrl: PROVIDER_PRESETS[LLMProvider.OPENAI].baseUrl,
    model: '',
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    MessageService.sendMessage({ type: 'GET_LLM_CONFIG' }).then(res => {
      if (res.success && res.data) setConfig(res.data as LLMConfig);
    });
  }, []);

  const handleProviderChange = (provider: LLMProvider) => {
    const preset = PROVIDER_PRESETS[provider];
    setConfig({
      ...config,
      provider,
      baseUrl: preset.baseUrl,
      model: '',
    });
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
    const res = await MessageService.sendMessage({ type: 'TEST_LLM_CONNECTION' });
    setTestResult(res.success ? 'success' : 'fail');
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
          <option value="openai">OpenAI</option>
          <option value="claude">Claude (Anthropic)</option>
          <option value="deepseek">DeepSeek</option>
          <option value="qwen">通义千问 (Qwen)</option>
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
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>API 地址（可自定义代理）</label>
        <input
          type="url"
          value={config.baseUrl}
          onChange={e => setConfig({ ...config, baseUrl: e.target.value })}
          style={styles.input}
        />
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>模型名称</label>
        <input
          type="text"
          value={config.model}
          onChange={e => setConfig({ ...config, model: e.target.value })}
          style={styles.input}
          placeholder="例如：gpt-4o-mini, deepseek-chat, claude-sonnet-4-20250514"
        />
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
        {testResult === 'fail' && <span style={styles.fail}>连接失败，请检查配置</span>}
      </div>

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
