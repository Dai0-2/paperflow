import { Bookmark, Check, Copy, Pencil, RefreshCw, Tag, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Citation } from './Citation';
import { useAppStore } from '../../store/useAppStore';
import { useChatActions } from '../../hooks/useChatActions';
import { text } from '../../i18n';
import { loadPaperMemory, savePaperMemory } from '../../services/database';

const tagOptions = { en: ['Key finding', 'Method', 'Limitation', 'Question'], zh: ['关键发现', '研究方法', '局限性', '待确认'] };
const feedbackOptions = { en: ['Incorrect', 'Unclear', 'Missing context', 'Too verbose'], zh: ['内容不正确', '表述不清', '缺少上下文', '过于冗长'] };

export function Conversation() {
  const { messages, paper, uiLanguage, sending, updateMessage, setDraft, setMessages } = useAppStore();
  const { submit } = useChatActions();
  const [tagging, setTagging] = useState<string | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);
  const regenerate = (index: number, id: string) => {
    const question = [...messages.slice(0, index)].reverse().find((item) => item.role === 'user')?.content;
    if (question) void submit(question, id);
  };
  const copy = async (id: string, content: string) => {
    await navigator.clipboard.writeText(content); updateMessage(id, { copied: true });
    window.setTimeout(() => updateMessage(id, { copied: false }), 1400);
  };
  const edit = (index: number, content: string) => {
    setDraft(content);
    setMessages(messages.slice(0, index));
    requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('paperflow:focus-composer')));
  };
  const toggleTag = (id: string, tag: string, current: string[] = []) => updateMessage(id, { tags: current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag] });
  const save = async (id: string, content: string) => {
    if (!paper) return;
    const existing = await loadPaperMemory(paper.id);
    if (!existing?.content.includes(content)) {
      await savePaperMemory(paper.id, `${existing?.content || ''}${existing?.content ? '\n\n' : ''}${content}`);
    }
    updateMessage(id, { saved: true });
  };
  return <div className="conversation" aria-live="polite" aria-busy={messages.some((message) => message.pending)}>
    {messages.map((message, index) => <article className={`message ${message.role}${message.pending ? ' pending' : ''}${message.error ? ' error' : ''}`} key={message.id}>
      <div className="message-label">{message.role === 'assistant' ? <><span className="assistant-mark"><Check size={10} /></span>PaperFlow</> : text(uiLanguage, 'You', '你')}</div>
      {message.progress && <div className="message-progress"><span />{message.progress}</div>}
      <div className="message-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown></div>
      {(message.citations?.length || message.citation) && <div className="citations">{(message.citations || (message.citation ? [message.citation] : [])).map((citation) => <Citation key={`${message.id}-${citation.page}-${citation.label}`} citation={citation} />)}</div>}
      {!!message.tags?.length && <div className="message-tags">{message.tags.map((tag) => <button key={tag} onClick={() => toggleTag(message.id, tag, message.tags)}>{tag}<X size={10} /></button>)}</div>}
      <div className="message-actions" aria-label={text(uiLanguage, 'Message actions', '消息操作')}>
        <button title={text(uiLanguage, 'Copy', '复制')} onClick={() => void copy(message.id, message.content)}>{message.copied ? <Check size={14} /> : <Copy size={14} />}</button>
        {message.role === 'user' && <button disabled={sending} title={text(uiLanguage, 'Edit and resend', '编辑并重新发送')} onClick={() => edit(index, message.content)}><Pencil size={14} /></button>}
        {message.role === 'assistant' && <><button title={text(uiLanguage, 'Regenerate', '重新生成')} onClick={() => regenerate(index, message.id)}><RefreshCw size={14} /></button><button data-active={message.saved} title={text(uiLanguage, 'Save to memory', '保存到记忆')} onClick={() => void save(message.id, message.content)}><Bookmark size={14} /></button><button data-active={tagging === message.id} title={text(uiLanguage, 'Add tag', '添加标签')} onClick={() => setTagging(tagging === message.id ? null : message.id)}><Tag size={14} /></button><button data-active={message.feedback === 'up'} title={text(uiLanguage, 'Helpful', '有帮助')} onClick={() => updateMessage(message.id, { feedback: message.feedback === 'up' ? undefined : 'up', feedbackDetail: undefined })}><ThumbsUp size={14} /></button><button data-active={message.feedback === 'down'} title={text(uiLanguage, 'Not helpful', '没有帮助')} onClick={() => { updateMessage(message.id, { feedback: 'down' }); setFeedbackFor(message.id); }}><ThumbsDown size={14} /></button></>}
      </div>
      {tagging === message.id && <div className="message-panel"><strong>{text(uiLanguage, 'Tags', '标签')}</strong><div>{tagOptions[uiLanguage].map((tag) => <button data-active={message.tags?.includes(tag)} key={tag} onClick={() => toggleTag(message.id, tag, message.tags)}>{tag}</button>)}</div></div>}
      {feedbackFor === message.id && <div className="message-panel feedback-panel"><strong>{text(uiLanguage, 'What could be improved?', '哪里需要改进？')}</strong><div>{feedbackOptions[uiLanguage].map((reason) => <button data-active={message.feedbackDetail === reason} key={reason} onClick={() => { updateMessage(message.id, { feedback: 'down', feedbackDetail: reason }); setFeedbackFor(null); }}>{reason}</button>)}</div><button className="dismiss-feedback" onClick={() => setFeedbackFor(null)}>{text(uiLanguage, 'Dismiss', '关闭')}</button></div>}
    </article>)}
  </div>;
}
