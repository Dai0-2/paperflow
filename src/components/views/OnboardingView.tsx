import { ArrowRight, Check, FileSearch, KeyRound, LoaderCircle, LogIn, RefreshCw, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { BrandMark } from '../common/BrandMark';
import { useAppStore } from '../../store/useAppStore';
import { detectActivePaper } from '../../services/paper';
import { loginWithChatGPT, saveApiKey } from '../../services/bridge';

export function OnboardingView() {
  const [apiKey, setApiKey] = useState('');
  const { paper, detecting, providerMode, bridgeState, bridgeDetail, apiState, apiDetail, setPaper, setDetecting, setBridge, setApiState, setProviderMode, setInitialized } = useAppStore();

  const detect = async () => {
    setDetecting(true);
    try { setPaper(await detectActivePaper()); } finally { setDetecting(false); }
  };
  const connectApi = async () => {
    setApiState('checking', 'Saving to macOS Keychain…');
    const result = await saveApiKey(apiKey.trim());
    setApiState(result.ok && result.authenticated ? 'connected' : 'unavailable', result.detail || result.error || '');
    if (result.ok) { setApiKey(''); setProviderMode('api'); }
  };
  const ready = providerMode === 'api' ? apiState === 'connected' : bridgeState === 'connected';

  const connect = async () => {
    setBridge('checking', 'Opening secure ChatGPT sign-in…');
    const result = await loginWithChatGPT();
    setBridge(result.ok && result.authenticated ? 'connected' : result.ok ? 'signed-out' : 'unavailable', result.detail || result.error || '');
  };

  return <main className="onboarding">
    <div className="onboarding-brand"><BrandMark /><span>PaperFlow AI</span></div>
    <div className="onboarding-copy"><p className="eyebrow">GET STARTED</p><h1>Your paper, understood.</h1><p>Connect ChatGPT and let PaperFlow identify the PDF beside this panel.</p></div>
    <div className="setup-steps">
      <section className="setup-card">
        <span className="setup-icon">{detecting ? <LoaderCircle className="spin" size={18} /> : paper ? <Check size={18} /> : <FileSearch size={18} />}</span>
        <div><strong>{paper ? 'Paper detected' : 'Open a research paper'}</strong><p>{paper ? paper.title : 'Open an arXiv, OpenReview, or direct PDF tab, then detect it.'}</p></div>
        <button onClick={detect} aria-label="Detect paper"><RefreshCw size={15} /></button>
      </section>
      <div className="provider-choice" role="group" aria-label="Choose an AI provider">
        <button data-active={providerMode === 'chatgpt'} onClick={() => setProviderMode('chatgpt')}><LogIn size={16} /><span><strong>ChatGPT subscription</strong><small>Use your existing plan through Codex</small></span>{providerMode === 'chatgpt' && <Check size={14} />}</button>
        <button data-active={providerMode === 'api'} onClick={() => setProviderMode('api')}><KeyRound size={16} /><span><strong>OpenAI API key</strong><small>Pay only for API usage</small></span>{providerMode === 'api' && <Check size={14} />}</button>
      </div>
      {providerMode === 'chatgpt' ? <section className="setup-card">
          <span className="setup-icon">{bridgeState === 'checking' ? <LoaderCircle className="spin" size={18} /> : bridgeState === 'connected' ? <Check size={18} /> : <LogIn size={18} />}</span>
          <div><strong>{bridgeState === 'connected' ? 'ChatGPT connected' : 'Connect ChatGPT'}</strong><p>{bridgeState === 'connected' ? 'Using your official Codex sign-in.' : bridgeDetail || 'Secure browser sign-in through the official Codex CLI.'}</p></div>
          {bridgeState !== 'connected' && <button className="setup-action" onClick={connect}>Connect</button>}
        </section> : <section className="api-setup-card"><div><strong>{apiState === 'connected' ? 'API key connected' : 'Add OpenAI API key'}</strong><p>{apiState === 'connected' ? apiDetail : apiDetail || 'Saved locally in macOS Keychain, never in extension storage.'}</p></div>{apiState !== 'connected' && <div className="api-key-row"><input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-…" /><button disabled={!apiKey.trim()} onClick={() => void connectApi()}>Save</button></div>}</section>}
    </div>
    <div className="privacy-note"><ShieldCheck size={15} /><span>PaperFlow never reads ChatGPT cookies or exposes your access token.</span></div>
    <button className="continue-button" disabled={!ready} onClick={() => setInitialized(true)}>Open workspace <ArrowRight size={16} /></button>
  </main>;
}
