import { ArrowRight } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { text } from '../../i18n';

export function EmptyState({ hasPaper }: { hasPaper: boolean }) {
  const { uiLanguage, setInitialized, setDraft } = useAppStore();
  const actions = uiLanguage === 'zh' ? ['总结这篇论文', '解释研究方法', '讲解关键公式', '这篇论文真正的新意是什么？'] : ['Summarize this paper', 'Explain the method', 'Walk me through the key equations', 'What is actually novel here?'];
  if (!hasPaper) return <section className="empty-state"><div className="empty-glyph"><span /><span /><span /></div><h2>{text(uiLanguage, 'No paper in this tab', '当前标签页没有论文')}</h2><p>{text(uiLanguage, 'Open a PDF, arXiv, or OpenReview page. You can also attach a PDF with the + button below.', '请打开 PDF、arXiv 或 OpenReview 页面，也可以通过下方 + 按钮上传 PDF。')}</p><button className="primary-text-button" onClick={() => setInitialized(false)}>{text(uiLanguage, 'Run setup again', '重新设置')} <ArrowRight size={14} /></button></section>;
  return <section className="empty-state"><div className="empty-glyph"><span /><span /><span /></div>
    <h2>{text(uiLanguage, 'Ask anything about this paper', '向这篇论文提任何问题')}</h2><p>{text(uiLanguage, "Explore the method, inspect an equation, or pressure-test the paper's claims.", '探索方法、检查公式，或审视论文的论证。')}</p>
    <div className="quick-actions">{actions.map((action) => <button key={action} onClick={() => setDraft(action)}>{action}<ArrowRight size={14} /></button>)}</div>
  </section>;
}

export function ReturningState() {
  const setChatState = useAppStore((s) => s.setChatState);
  return <section className="empty-state returning"><p className="eyebrow">WELCOME BACK</p><h2>Continue where you left off</h2>
    <p>Your conversation is stored with this paper.</p>
    <div className="last-discussed"><span>Paper workspace</span><strong>Questions</strong><strong>Attachments</strong><strong>Notes</strong></div>
    <button className="primary-text-button" onClick={() => setChatState('conversation')}>Continue conversation <ArrowRight size={14} /></button>
  </section>;
}
