import { ArrowLeft, BookOpen, Check, CloudUpload, Database, Globe2, KeyRound, Laptop, Languages, LogIn, Moon, Palette, RefreshCw, RotateCcw, Server, Sun, Trash2, Type } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { Theme, UiFontFamily } from '../../types';
import { deleteApiKey, discoverApiModels, loginWithChatGPT, saveApiKey, testApiConnection } from '../../services/bridge';
import { text } from '../../i18n';
import {
  isPdfCloudSyncEnabled,
  setPdfCloudSyncEnabled,
} from '../../services/storage/documentStore';
import { VaultSetup } from '../sync/VaultSetup';
import { DeviceSetupGuide } from '../setup/DeviceSetupGuide';
import { ApiModelField } from '../setup/ApiModelField';

const themes: { id: Theme; label: string; icon: typeof Sun }[] = [{ id: 'zotero', label: 'White', icon: Palette }, { id: 'light', label: 'Light', icon: Sun }, { id: 'dark', label: 'Dark', icon: Moon }, { id: 'system', label: 'System', icon: Laptop }];
const fontFamilies: { id: UiFontFamily; en: string; zh: string }[] = [
  { id: 'system', en: 'System', zh: '系统' },
  { id: 'sans', en: 'Sans', zh: '无衬线' },
  { id: 'serif', en: 'Serif', zh: '衬线' },
];

export function SettingsView() {
  const [apiKey, setApiKey] = useState('');
  const [syncPdfDocuments, setSyncPdfDocumentsState] = useState(false);
  const extensionRuntimeAvailable =
    typeof chrome !== 'undefined'
    && Boolean(chrome.runtime?.id && chrome.runtime?.sendNativeMessage);
  const { theme, fontFamily, fontScale, model, providerMode, bridgeState, bridgeDetail, apiState, apiDetail, uiLanguage, promptLanguage, apiBaseUrl, apiProtocol, defaultOpenReader, setTheme, setFontFamily, setFontScale, setModel, setView, setBridge, setApiState, setApiModels, setProviderMode, setUiLanguage, setPromptLanguage, setApiBaseUrl, setApiProtocol, setDefaultOpenReader } = useAppStore();
  useEffect(() => {
    void isPdfCloudSyncEnabled().then(setSyncPdfDocumentsState);
  }, []);
  const connect = async () => {
    setBridge('checking', text(uiLanguage, 'Opening Codex sign-in…', '正在打开 Codex 登录…'));
    const result = await loginWithChatGPT();
    setBridge(result.ok && result.authenticated ? 'connected' : result.ok ? 'signed-out' : 'unavailable', result.detail || result.error || '');
  };
  const saveKey = async () => {
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
  const testEndpoint = async () => {
    setApiState('checking', text(uiLanguage, 'Testing the configured endpoint…', '正在测试配置的接口…'));
    const tested = await testApiConnection(model.trim(), apiBaseUrl.trim(), apiProtocol);
    setApiState(tested.ok && tested.authenticated ? 'connected' : 'unavailable', tested.detail || tested.error || '');
  };
  const removeKey = async () => {
    setApiState('checking', 'Removing…');
    const result = await deleteApiKey();
    setApiState(result.ok ? 'signed-out' : 'unavailable', result.detail || result.error || '');
  };
  return <main className="view"><div className="view-header"><button className="back" onClick={() => setView('chat')}><ArrowLeft size={16} />{text(uiLanguage, 'Settings', '设置')}</button></div>
    <div className="view-content settings"><section><h3>{text(uiLanguage, 'AI provider', 'AI 服务')}</h3><div className="provider-list">
      <button data-active={providerMode === 'chatgpt'} onClick={() => setProviderMode('chatgpt')}><LogIn size={17} /><span><strong>{text(uiLanguage, 'ChatGPT subscription', 'ChatGPT 订阅')}</strong><small className={bridgeState === 'connected' ? 'connected' : ''}>{bridgeState === 'connected' ? text(uiLanguage, 'Connected through official Codex', '已通过官方 Codex 连接') : bridgeState === 'checking' ? text(uiLanguage, 'Checking…', '正在检查…') : bridgeDetail || text(uiLanguage, 'Not connected', '未连接')}</small></span>{providerMode === 'chatgpt' && <Check size={15} />}</button>
      {bridgeState !== 'connected' && <button className="provider-action" disabled={bridgeState === 'checking' || !extensionRuntimeAvailable} onClick={() => void connect()}>{!extensionRuntimeAvailable ? text(uiLanguage, 'Open the Chrome extension to sign in', '请在 Chrome 扩展中登录') : bridgeState === 'checking' ? text(uiLanguage, 'Opening sign-in…', '正在打开登录…') : text(uiLanguage, 'Sign in with ChatGPT', '登录 ChatGPT')}</button>}
      <button data-active={providerMode === 'api'} onClick={() => setProviderMode('api')}><KeyRound size={17} /><span><strong>{text(uiLanguage, 'OpenAI-compatible API', 'OpenAI 兼容 API')}</strong><small className={apiState === 'connected' ? 'connected' : ''}>{apiState === 'connected' ? text(uiLanguage, 'Endpoint tested; key saved on this device', '接口已测试；密钥已保存到此设备') : apiState === 'checking' ? text(uiLanguage, 'Checking…', '正在检查…') : apiDetail || text(uiLanguage, 'Direct connection; no Native Host required', '浏览器直连，无需 Native Host')}</small></span>{providerMode === 'api' && <Check size={15} />}</button>
      {apiState === 'connected' ? <button className="provider-action danger" onClick={() => void removeKey()}><Trash2 size={14} />{text(uiLanguage, 'Remove API key', '删除 API 密钥')}</button> : <div className="api-key-row"><input type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="API key" /><button disabled={apiState === 'checking' || !apiKey.trim() || !apiBaseUrl.trim() || !model.trim()} onClick={() => void saveKey()}>{text(uiLanguage, extensionRuntimeAvailable ? 'Save & test' : 'Test for this session', extensionRuntimeAvailable ? '保存并测试' : '仅本次测试')}</button></div>}
      {providerMode === 'api' && <div className="endpoint-settings"><label><span><Server size={14} />Base URL</span><input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} placeholder="https://api.openai.com/v1" /></label><ApiModelField /><label><span>{text(uiLanguage, 'API format', '接口格式')}</span><select value={apiProtocol} onChange={(event) => setApiProtocol(event.target.value as typeof apiProtocol)}><option value="responses">Responses API</option><option value="chat-completions">Chat Completions</option></select></label><small>{text(uiLanguage, 'Enter a domain, /v1 base, or complete endpoint. HTTPS is required except for localhost.', '可填写域名、/v1 地址或完整接口地址；除 localhost 外必须使用 HTTPS。')}</small><button className="endpoint-test" disabled={apiState === 'checking' || !apiBaseUrl.trim() || !model.trim()} onClick={() => void testEndpoint()}><RefreshCw size={13} />{text(uiLanguage, 'Test connection', '测试连接')}</button></div>}
    </div>{providerMode === 'chatgpt' && <DeviceSetupGuide language={uiLanguage} />}</section>
      <section><h3>{text(uiLanguage, 'Language', '语言')}</h3><div className="language-settings"><div><span><Globe2 size={15} /><strong>{text(uiLanguage, 'Interface language', '界面语言')}</strong></span><div className="segmented"><button data-active={uiLanguage === 'en'} onClick={() => setUiLanguage('en')}>English</button><button data-active={uiLanguage === 'zh'} onClick={() => setUiLanguage('zh')}>中文</button></div></div><div><span><Languages size={15} /><strong>{text(uiLanguage, 'Answer & prompt language', '回答与提示词语言')}</strong></span><div className="segmented three"><button data-active={promptLanguage === 'auto'} onClick={() => setPromptLanguage('auto')}>{text(uiLanguage, 'Follow UI', '跟随界面')}</button><button data-active={promptLanguage === 'en'} onClick={() => setPromptLanguage('en')}>English</button><button data-active={promptLanguage === 'zh'} onClick={() => setPromptLanguage('zh')}>中文</button></div></div></div></section>
      <section><h3>{text(uiLanguage, 'Appearance', '外观')}</h3><div className="theme-picker">{themes.map(({ id, label, icon: Icon }) => <button key={id} data-active={theme === id} onClick={() => setTheme(id)}><Icon size={15} />{id === 'zotero' ? text(uiLanguage, label, '白色') : id === 'light' ? text(uiLanguage, label, '浅色') : id === 'dark' ? text(uiLanguage, label, '深色') : text(uiLanguage, label, '跟随系统')}</button>)}</div><div className="font-settings"><span><Type size={15} /><strong>{text(uiLanguage, 'Interface font', '界面字体')}</strong></span><div className="segmented three">{fontFamilies.map((option) => <button key={option.id} data-active={fontFamily === option.id} onClick={() => setFontFamily(option.id)}>{text(uiLanguage, option.en, option.zh)}</button>)}</div><label><span>{text(uiLanguage, 'Text size', '文字大小')}</span><input type="range" min="75" max="160" step="1" value={fontScale} onChange={(event) => setFontScale(Number(event.target.value))} /><output>{fontScale}%</output><button className="font-reset" type="button" title={text(uiLanguage, 'Reset text size', '恢复默认文字大小')} disabled={fontScale === 100} onClick={() => setFontScale(100)}><RotateCcw size={13} />{text(uiLanguage, 'Reset', '重置')}</button></label><small>{text(uiLanguage, '75–160%. Applies to PaperFlow controls and AI text, not the original PDF typography.', '可调范围 75%–160%，应用于 PaperFlow 控件和 AI 文字，不改变 PDF 原始字体。')}</small></div></section>
      <section><h3>{text(uiLanguage, 'Reading', '阅读')}</h3><div className="setting-list"><label><span><strong>{text(uiLanguage, 'Paper memory', '论文记忆')}</strong><small>{text(uiLanguage, 'Remember insights per paper', '按论文保存重要洞察')}</small></span><input type="checkbox" defaultChecked /><i /></label><label><span><strong><BookOpen size={14} />{text(uiLanguage, 'Open direct PDFs in PaperFlow', '默认用 PaperFlow 打开直接 PDF')}</strong><small>{text(uiLanguage, 'arXiv keeps its original URL and site icon', 'arXiv 会保留原网址和站点图标')}</small></span><input type="checkbox" checked={defaultOpenReader} onChange={(event) => setDefaultOpenReader(event.target.checked)} /><i /></label></div>{defaultOpenReader && <p className="setting-note">{text(uiLanguage, 'Reload an already open PDF once. If another extension also redirects PDFs, disable one default handler.', '已打开的 PDF 需要刷新一次；如果其他扩展也会接管 PDF，请关闭其中一个默认接管选项。')}</p>}</section>
      <section><h3>{text(uiLanguage, 'Sync', '同步')}</h3><div className="setting-list"><label><span><strong><CloudUpload size={14} />{text(uiLanguage, 'Back up offline PDFs', '备份离线 PDF')}</strong><small>{text(uiLanguage, 'Off by default. Notes, annotations, and library data still sync.', '默认关闭；笔记、批注和资料库数据仍会同步。')}</small></span><input type="checkbox" checked={syncPdfDocuments} onChange={(event) => {
        const enabled = event.target.checked;
        setSyncPdfDocumentsState(enabled);
        void setPdfCloudSyncEnabled(enabled);
      }} /><i /></label></div><VaultSetup language={uiLanguage} /></section>
      <section><h3>{text(uiLanguage, 'Data', '数据')}</h3><button className="data-button"><Database size={15} />{text(uiLanguage, 'Export PaperFlow data', '导出 PaperFlow 数据')}</button></section>
    </div></main>;
}
