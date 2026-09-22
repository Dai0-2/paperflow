import { ArrowLeft, BookOpen, Check, Database, Globe2, KeyRound, Laptop, Languages, LogIn, Moon, Server, Sun, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { Theme } from '../../types';
import { deleteApiKey, loginWithChatGPT, saveApiKey } from '../../services/bridge';
import { text } from '../../i18n';
import { VaultSetup } from '../sync/VaultSetup';

const themes: { id: Theme; label: string; icon: typeof Sun }[] = [{ id: 'light', label: 'Light', icon: Sun }, { id: 'dark', label: 'Dark', icon: Moon }, { id: 'system', label: 'System', icon: Laptop }];

export function SettingsView() {
  const [apiKey, setApiKey] = useState('');
  const { theme, model, providerMode, bridgeState, bridgeDetail, apiState, apiDetail, uiLanguage, promptLanguage, apiBaseUrl, apiProtocol, defaultOpenReader, setTheme, setModel, setView, setBridge, setApiState, setProviderMode, setUiLanguage, setPromptLanguage, setApiBaseUrl, setApiProtocol, setDefaultOpenReader } = useAppStore();
  const connect = async () => {
    setBridge('checking', 'Checking Codex sign-in…');
    const result = await loginWithChatGPT();
    setBridge(result.ok && result.authenticated ? 'connected' : result.ok ? 'signed-out' : 'unavailable', result.detail || result.error || '');
  };
  const saveKey = async () => {
    setApiState('checking', 'Saving to the operating-system credential store…');
    const result = await saveApiKey(apiKey.trim());
    setApiState(result.ok && result.authenticated ? 'connected' : 'unavailable', result.detail || result.error || '');
    if (result.ok) { setApiKey(''); setProviderMode('api'); }
  };
  const removeKey = async () => {
    setApiState('checking', 'Removing…');
    const result = await deleteApiKey();
    setApiState(result.ok ? 'signed-out' : 'unavailable', result.detail || result.error || '');
  };
  return <main className="view"><div className="view-header"><button className="back" onClick={() => setView('chat')}><ArrowLeft size={16} />{text(uiLanguage, 'Settings', '设置')}</button></div>
    <div className="view-content settings"><section><h3>{text(uiLanguage, 'AI provider', 'AI 服务')}</h3><div className="provider-list">
      <button data-active={providerMode === 'chatgpt'} onClick={() => setProviderMode('chatgpt')}><LogIn size={17} /><span><strong>{text(uiLanguage, 'ChatGPT subscription', 'ChatGPT 订阅')}</strong><small className={bridgeState === 'connected' ? 'connected' : ''}>{bridgeState === 'connected' ? text(uiLanguage, 'Connected through official Codex', '已通过官方 Codex 连接') : bridgeState === 'checking' ? text(uiLanguage, 'Checking…', '正在检查…') : bridgeDetail || text(uiLanguage, 'Not connected', '未连接')}</small></span>{providerMode === 'chatgpt' && <Check size={15} />}</button>
      {bridgeState !== 'connected' && <button className="provider-action" onClick={() => void connect()}>{text(uiLanguage, 'Check Codex sign-in', '检查 Codex 登录')}</button>}
      <button data-active={providerMode === 'api'} onClick={() => setProviderMode('api')}><KeyRound size={17} /><span><strong>{text(uiLanguage, 'API key', 'API 密钥')}</strong><small className={apiState === 'connected' ? 'connected' : ''}>{apiState === 'connected' ? text(uiLanguage, 'Stored in system credential store', '已存入系统凭据存储') : apiState === 'checking' ? text(uiLanguage, 'Checking…', '正在检查…') : apiDetail || text(uiLanguage, 'OpenAI or compatible relay', 'OpenAI 或兼容中转站')}</small></span>{providerMode === 'api' && <Check size={15} />}</button>
      {apiState === 'connected' ? <button className="provider-action danger" onClick={() => void removeKey()}><Trash2 size={14} />{text(uiLanguage, 'Remove API key', '删除 API 密钥')}</button> : <div className="api-key-row"><input type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="API key" /><button disabled={!apiKey.trim()} onClick={() => void saveKey()}>{text(uiLanguage, 'Save key', '保存')}</button></div>}
      {providerMode === 'api' && <div className="endpoint-settings"><label><span><Server size={14} />Base URL</span><input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} placeholder="https://api.openai.com/v1" /></label><label><span>{text(uiLanguage, 'Model ID', '模型 ID')}</span><input value={model === 'ChatGPT via Codex' ? '' : model} onChange={(event) => setModel(event.target.value)} placeholder="gpt-5.6-luna" /></label><label><span>{text(uiLanguage, 'API format', '接口格式')}</span><select value={apiProtocol} onChange={(event) => setApiProtocol(event.target.value as typeof apiProtocol)}><option value="responses">Responses API</option><option value="chat-completions">Chat Completions</option></select></label><small>{text(uiLanguage, 'You can enter a domain, /v1 base, or a complete endpoint URL.', '可填写域名、/v1 地址或完整接口地址。')}</small></div>}
    </div></section>
      <section><h3>{text(uiLanguage, 'Language', '语言')}</h3><div className="language-settings"><div><span><Globe2 size={15} /><strong>{text(uiLanguage, 'Interface language', '界面语言')}</strong></span><div className="segmented"><button data-active={uiLanguage === 'en'} onClick={() => setUiLanguage('en')}>English</button><button data-active={uiLanguage === 'zh'} onClick={() => setUiLanguage('zh')}>中文</button></div></div><div><span><Languages size={15} /><strong>{text(uiLanguage, 'Answer & prompt language', '回答与提示词语言')}</strong></span><div className="segmented three"><button data-active={promptLanguage === 'auto'} onClick={() => setPromptLanguage('auto')}>{text(uiLanguage, 'Follow UI', '跟随界面')}</button><button data-active={promptLanguage === 'en'} onClick={() => setPromptLanguage('en')}>English</button><button data-active={promptLanguage === 'zh'} onClick={() => setPromptLanguage('zh')}>中文</button></div></div></div></section>
      <section><h3>{text(uiLanguage, 'Appearance', '外观')}</h3><div className="theme-picker">{themes.map(({ id, label, icon: Icon }) => <button key={id} data-active={theme === id} onClick={() => setTheme(id)}><Icon size={15} />{id === 'light' ? text(uiLanguage, label, '浅色') : id === 'dark' ? text(uiLanguage, label, '深色') : text(uiLanguage, label, '跟随系统')}</button>)}</div></section>
      <section><h3>{text(uiLanguage, 'Reading', '阅读')}</h3><div className="setting-list"><label><span><strong>{text(uiLanguage, 'Paper memory', '论文记忆')}</strong><small>{text(uiLanguage, 'Remember insights per paper', '按论文保存重要洞察')}</small></span><input type="checkbox" defaultChecked /><i /></label><label><span><strong><BookOpen size={14} />{text(uiLanguage, 'Open direct PDFs in PaperFlow', '默认用 PaperFlow 打开直接 PDF')}</strong><small>{text(uiLanguage, 'Opt-in for HTTP/HTTPS links ending in .pdf', '仅对以 .pdf 结尾的 HTTP/HTTPS 链接生效')}</small></span><input type="checkbox" checked={defaultOpenReader} onChange={(event) => setDefaultOpenReader(event.target.checked)} /><i /></label></div>{defaultOpenReader && <p className="setting-note">{text(uiLanguage, 'If another extension also redirects PDFs, disable one default handler and keep PaperFlow Side Panel available.', '如果其他扩展也会接管 PDF，请关闭其中一个默认接管选项；PaperFlow Side Panel 仍可继续使用。')}</p>}</section>
      <section><h3>{text(uiLanguage, 'Sync', '同步')}</h3><VaultSetup language={uiLanguage} /></section>
      <section><h3>{text(uiLanguage, 'Data', '数据')}</h3><button className="data-button"><Database size={15} />{text(uiLanguage, 'Export PaperFlow data', '导出 PaperFlow 数据')}</button></section>
    </div></main>;
}
