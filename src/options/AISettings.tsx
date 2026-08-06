import { useState, useEffect } from 'react';
import { MessageService } from '../shared/message';
import { LLMProvider, PROVIDER_PRESETS, PROVIDER_ORDER } from '../services/llm/types';
import type { LLMConfig } from '../services/llm/types';

interface AISettingsProps {
  dataRevision?: number;
}

const DEFAULT_CONFIG: LLMConfig = {
  provider: LLMProvider.DEEPSEEK,
  apiKey: '',
  baseUrl: PROVIDER_PRESETS[LLMProvider.DEEPSEEK].baseUrl,
  model: PROVIDER_PRESETS[LLMProvider.DEEPSEEK].defaultModel,
};

export function AISettings({ dataRevision = 0 }: AISettingsProps) {
  const [config, setConfig] = useState<LLMConfig>(DEFAULT_CONFIG);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [saved, setSaved] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);
  /** 用户是否手动编辑过 API 地址；为 true 时切换服务商不覆盖地址 */
  const [urlEdited, setUrlEdited] = useState(false);
  /** 用户是否手动编辑过模型名称；为 true 时切换服务商不覆盖模型 */
  const [modelEdited, setModelEdited] = useState(false);

  useEffect(() => {
    const loadConfig = () => MessageService.sendMessage({ type: 'GET_LLM_CONFIG' }).then(res => {
      if (res.success && res.data) {
        const stored = res.data as LLMConfig;
        setConfig(stored);
        // 已保存的值若不是该服务商的官方默认值，视为自定义并予以保留
        const storedPreset = PROVIDER_PRESETS[stored.provider];
        setUrlEdited(stored.baseUrl.trim() !== (storedPreset?.baseUrl ?? '').trim());
        setModelEdited(stored.model.trim() !== (storedPreset?.defaultModel ?? '').trim());
      } else if (res.success) {
        setConfig(DEFAULT_CONFIG);
        setUrlEdited(false);
        setModelEdited(false);
      }
    });
    void loadConfig();
    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName === 'local' && changes.llmConfig) void loadConfig();
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, [dataRevision]);

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
    const response = await MessageService.sendMessage<{ localSaved: boolean; sync: string }>({
      type: 'SAVE_LLM_CONFIG',
      payload: config,
    });
    setSaved(response.success);
    setSaveFailed(!response.success);
    setSaveMessage(
      response.success
        ? response.data?.sync === 'queued'
          ? '已保存到本地，同步已排队'
          : '已保存到本地'
        : response.error || '保存失败',
    );
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
    <div className="settings-section">
      <h2 className="settings-section-title">AI 模型设置</h2>
      <p className="settings-description">
        配置 AI 服务后，插件可以自动生成开放性问题的回答、智能解析简历、以及语义匹配表单字段。
      </p>

      <div className="settings-field">
        <label>服务商</label>
        <select
          value={config.provider}
          onChange={e => handleProviderChange(e.target.value as LLMProvider)}
          className="settings-input"
        >
          {PROVIDER_ORDER.map(p => (
            <option key={p} value={p}>{PROVIDER_PRESETS[p].label}</option>
          ))}
        </select>
      </div>

      <div className="settings-field">
        <label>API Key</label>
        <input
          type="password"
          value={config.apiKey}
          onChange={e => setConfig({ ...config, apiKey: e.target.value })}
          className="settings-input"
          placeholder="sk-..."
        />
        {preset.consoleUrl && (
          <a
            href={preset.consoleUrl}
            target="_blank"
            rel="noreferrer"
            className="settings-hint-link"
          >
            前往 {preset.label} 控制台获取 API Key
          </a>
        )}
      </div>

      <div className="settings-field">
        <label>API 地址（可自定义代理）</label>
        <input
          type="url"
          value={config.baseUrl}
          onChange={e => handleBaseUrlChange(e.target.value)}
          className="settings-input"
          placeholder="https://api.example.com/v1"
        />
        {urlEdited && preset.baseUrl && config.baseUrl.trim() !== preset.baseUrl && (
          <p className="settings-hint">
            已使用自定义地址，切换服务商时不会被覆盖。
            <button onClick={handleResetBaseUrl} className="settings-link-button">
              恢复 {preset.label} 默认地址
            </button>
          </p>
        )}
      </div>

      <div className="settings-field">
        <label>模型名称</label>
        <input
          type="text"
          value={config.model}
          onChange={e => handleModelChange(e.target.value)}
          className="settings-input"
          list="model-suggestions"
          placeholder={preset.defaultModel || '例如：gpt-4o-mini'}
        />
        <datalist id="model-suggestions">
          {preset.models.map(m => <option key={m} value={m} />)}
        </datalist>

        <p className="settings-hint">
          推荐使用非推理模型。推理模型的思考内容会占用输出额度，
          容易在思考阶段耗尽额度而返回空内容，届时会自动改用本地规则解析。
        </p>

        {modelEdited && preset.defaultModel && config.model.trim() !== preset.defaultModel ? (
          <p className="settings-hint">
            已使用自定义模型，切换服务商时不会被覆盖。
            <button onClick={handleResetModel} className="settings-link-button">
              恢复 {preset.defaultModel}
            </button>
          </p>
        ) : preset.models.length > 0 && (
          <p className="settings-hint">
            非推理模型：{preset.models.join('、')}。模型更新较快，如提示模型不存在请到官方文档核对名称。
          </p>
        )}

        {preset.reasoningOnly && (
          <p className="settings-hint">
            {preset.label} 目前在售的
            {(preset.reasoningModels ?? []).join('、')} 均为推理模型，
            建议改用 DeepSeek（deepseek-chat）、GLM（glm-4-flash）
            或 Qwen（qwen-plus）等非推理模型。
          </p>
        )}
      </div>

      {config.provider === LLMProvider.CUSTOM && (
        <div className="settings-field">
          <label className="settings-checkbox-label">
            <input
              type="checkbox"
              checked={Boolean(config.visionEnabled)}
              onChange={e => setConfig({ ...config, visionEnabled: e.target.checked })}
            />
            启用视觉输入能力
          </label>
          <p className="settings-hint">
            仅当你的自定义 OpenAI 兼容服务实际支持图片输入时再开启。
            未开启时，视觉优先框选补填会主动阻断，避免把图片请求发到不兼容模型。
          </p>
        </div>
      )}

      <div className="settings-button-row">
        <button
          onClick={handleTest}
          disabled={testing || !config.apiKey}
          className="btn btn-secondary"
        >
          {testing ? '测试中...' : '测试连接'}
        </button>
        {testResult === 'success' && <span className="settings-success">连接成功</span>}
      </div>

      {testResult === 'fail' && (
        <div className="settings-error">
          <strong>连接失败</strong>
          <p>{errorMsg}</p>
        </div>
      )}

      <div className="options-actions">
        {saveMessage && (
          <span className={saveFailed ? 'settings-save-error' : 'settings-success'}>{saveMessage}</span>
        )}
        <button onClick={handleSave} className="btn btn-primary">
          {saved ? '已保存' : '保存设置'}
        </button>
      </div>
    </div>
  );
}
