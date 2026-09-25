import { ArrowRight, Check, FileSearch, KeyRound, LoaderCircle, LogIn, RefreshCw, Server, Settings, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { BrandMark } from '../common/BrandMark';
import { useAppStore } from '../../store/useAppStore';
import { detectActivePaper } from '../../services/paper';
import { discoverApiModels, loginWithChatGPT, saveApiKey, testApiConnection } from '../../services/bridge';
import { text } from '../../i18n';
import { DeviceSetupGuide } from '../setup/DeviceSetupGuide';
import { ApiModelField } from '../setup/ApiModelField';

export function OnboardingView() {
  const [apiKey, setApiKey] = useState('');
  const extensionRuntimeAvailable =
    typeof chrome !== 'undefined'
    && Boolean(chrome.runtime?.id && chrome.runtime?.sendNativeMessage);
  const { paper, detecting, model, providerMode, bridgeState, bridgeDetail, apiState, apiDetail, apiBaseUrl, apiProtocol, uiLanguage, setPaper, setDetecting, setModel, setBridge, setApiState, setApiModels, setProviderMode, setApiBaseUrl, setApiProtocol, setInitialized, setView } = useAppStore();

  const detect = async () => {
    setDetecting(true);
    try { setPaper(await detectActivePaper()); } finally { setDetecting(false); }
  };
  const connectApi = async () => {
    const normalizedKey = apiKey.trim();
    const normalizedBaseUrl = apiBaseUrl.trim();
    setProviderMode('api');
    setApiState('checking', extensionRuntimeAvailable
      ? text(uiLanguage, 'Requesting provider access and saving on this device…', '正在请求服务商访问权限并保存到此设备…')
      : text(uiLanguage, 'Testing the API from this preview…', '正在从当前预览测试 API…'));
    const saved = await saveApiKey(normalizedKey, normalizedBaseUrl);
    if (!saved.ok) {
      setApiState('unavailable', saved.detail || saved.error || '');
      return;
    }
    setApiState('checking', text(uiLanguage, 'Loading available models…', '正在读取可用模型…'));
    const discovered = await discoverApiModels(normalizedKey, normalizedBaseUrl);
    let selectedModel = model.trim();
    if (discovered.ok && discovered.models?.length) {
      setApiModels(discovered.models);
      if (!discovered.models.includes(selectedModel)) {
        selectedModel = discovered.models.includes('gpt-5.5')
          ? 'gpt-5.5'
          : discovered.models[0];
        setModel(selectedModel);
      }
    }
    setApiKey('');
    setApiState('checking', text(uiLanguage, 'Testing the configured endpoint…', '正在测试配置的接口…'));
    const tested = await testApiConnection(selectedModel, normalizedBaseUrl, apiProtocol);
    setApiState(tested.ok && tested.authenticated ? 'connected' : 'unavailable', tested.detail || tested.error || '');
  };
  const ready = providerMode === 'api' ? apiState === 'connected' : bridgeState === 'connected';

  const connect = async () => {
    setBridge('checking', text(uiLanguage, 'Opening Codex sign-in…', '正在打开 Codex 登录…'));
    const result = await loginWithChatGPT();
    setBridge(result.ok && result.authenticated ? 'connected' : result.ok ? 'signed-out' : 'unavailable', result.detail || result.error || '');
  };

  return <main className="onboarding">
    <div className="onboarding-brand"><BrandMark /><span>PaperFlow</span></div>
    <button className="onboarding-settings" aria-label={text(uiLanguage, 'Open settings', '打开设置')} title={text(uiLanguage, 'Settings', '设置')} onClick={() => setView('settings')}><Settings size={17} /></button>
    <div className="onboarding-copy"><p className="eyebrow">{text(uiLanguage, 'GET STARTED', '开始使用')}</p><h1>{text(uiLanguage, 'Your paper, understood.', '读懂你的每一篇论文。')}</h1><p>{text(uiLanguage, 'Connect an AI provider and let PaperFlow identify the paper beside this panel.', '连接 AI 服务，让 PaperFlow 识别此面板旁的论文。')}</p></div>
    <div className="setup-steps">
      <section className="setup-card">
        <span className="setup-icon">{detecting ? <LoaderCircle className="spin" size={18} /> : paper ? <Check size={18} /> : <FileSearch size={18} />}</span>
        <div><strong>{paper ? text(uiLanguage, 'Paper detected', '已识别论文') : text(uiLanguage, 'Open a research paper', '打开研究论文')}</strong><p>{paper ? paper.title : text(uiLanguage, 'Open an arXiv, OpenReview, or direct PDF tab, then detect it.', '打开 arXiv、OpenReview 或直接 PDF 标签页，然后开始识别。')}</p></div>
        <button onClick={detect} aria-label={text(uiLanguage, 'Detect paper', '识别论文')}><RefreshCw size={15} /></button>
      </section>
      <div className="provider-choice" role="group" aria-label={text(uiLanguage, 'Choose an AI provider', '选择 AI 服务')}>
        <button data-active={providerMode === 'chatgpt'} onClick={() => setProviderMode('chatgpt')}><LogIn size={16} /><span><strong>{text(uiLanguage, 'ChatGPT subscription', 'ChatGPT 订阅')}</strong><small>{text(uiLanguage, 'Use your existing plan through Codex', '通过 Codex 使用现有订阅')}</small></span>{providerMode === 'chatgpt' && <Check size={14} />}</button>
        <button data-active={providerMode === 'api'} onClick={() => setProviderMode('api')}><KeyRound size={16} /><span><strong>{text(uiLanguage, 'OpenAI-compatible API', 'OpenAI 兼容 API')}</strong><small>{text(uiLanguage, 'Direct from Chrome; no host install', 'Chrome 直连，无需安装 Host')}</small></span>{providerMode === 'api' && <Check size={14} />}</button>
      </div>
      {providerMode === 'chatgpt' ? <section className="setup-card">
          <span className="setup-icon">{bridgeState === 'checking' ? <LoaderCircle className="spin" size={18} /> : bridgeState === 'connected' ? <Check size={18} /> : <LogIn size={18} />}</span>
          <div><strong>{bridgeState === 'connected' ? text(uiLanguage, 'ChatGPT connected', 'ChatGPT 已连接') : text(uiLanguage, 'Sign in with ChatGPT', '登录 ChatGPT')}</strong><p>{bridgeState === 'connected' ? text(uiLanguage, 'Using your official Codex sign-in.', '正在使用官方 Codex 登录。') : bridgeDetail || text(uiLanguage, 'PaperFlow opens the official Codex browser sign-in and never reads ChatGPT cookies.', 'PaperFlow 会打开官方 Codex 浏览器登录，且不会读取 ChatGPT Cookie。')}</p></div>
          {bridgeState !== 'connected' && <button className="setup-action" disabled={bridgeState === 'checking' || !extensionRuntimeAvailable} onClick={connect}>{!extensionRuntimeAvailable ? text(uiLanguage, 'Use Chrome extension', '请在 Chrome 扩展中使用') : bridgeState === 'checking' ? text(uiLanguage, 'Opening…', '打开中…') : text(uiLanguage, 'Sign in', '登录')}</button>}
        </section> : <section className="api-setup-card">
          <div><strong>{apiState === 'connected' ? text(uiLanguage, 'API connected', 'API 已连接') : text(uiLanguage, 'Configure API provider', '配置 API 服务')}</strong><p>{apiState === 'connected' ? apiDetail : apiDetail || (extensionRuntimeAvailable
            ? text(uiLanguage, 'The extension connects directly. The key stays only in this browser profile and is not synced.', '扩展会直接连接服务商；密钥仅保存在当前浏览器配置中，不会同步。')
            : text(uiLanguage, 'Preview mode keeps the key in memory only and clears it on reload.', '预览模式只在内存中保留密钥，刷新页面即清除。'))}</p></div>
          <div className="endpoint-settings">
            <label><span><Server size={14} />Base URL</span><input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} placeholder="https://api.openai.com/v1" /></label>
            <ApiModelField />
            <label><span>{text(uiLanguage, 'API format', '接口格式')}</span><select value={apiProtocol} onChange={(event) => setApiProtocol(event.target.value as typeof apiProtocol)}><option value="responses">Responses API</option><option value="chat-completions">Chat Completions</option></select></label>
            <small>{text(uiLanguage, 'Enter a domain, /v1 base, or complete endpoint. HTTPS is required except for localhost.', '可填写域名、/v1 地址或完整接口地址；除 localhost 外必须使用 HTTPS。')}</small>
          </div>
          {apiState !== 'connected' && <div className="api-key-row"><input type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="API key" /><button disabled={apiState === 'checking' || !apiKey.trim() || !apiBaseUrl.trim() || !model.trim()} onClick={() => void connectApi()}>{apiState === 'checking' ? text(uiLanguage, 'Testing…', '测试中…') : text(uiLanguage, extensionRuntimeAvailable ? 'Save & test' : 'Test for this session', extensionRuntimeAvailable ? '保存并测试' : '仅本次测试')}</button></div>}
        </section>}
    </div>
    {providerMode === 'chatgpt' && bridgeState === 'unavailable' && <DeviceSetupGuide
      language={uiLanguage}
      defaultOpen
      onOpenSettings={() => setView('settings')}
    />}
    <div className="privacy-note"><ShieldCheck size={15} /><span>{providerMode === 'api'
      ? text(uiLanguage, 'Your API key stays on this device and requests go directly to your chosen provider.', 'API 密钥仅保存在此设备，请求会直接发送到你选择的服务商。')
      : text(uiLanguage, 'PaperFlow never reads ChatGPT cookies or exposes your access token.', 'PaperFlow 不会读取 ChatGPT Cookie，也不会暴露访问令牌。')}</span></div>
    <button className="continue-button" disabled={!ready} onClick={() => setInitialized(true)}>{text(uiLanguage, 'Open workspace', '打开工作区')} <ArrowRight size={16} /></button>
  </main>;
}
