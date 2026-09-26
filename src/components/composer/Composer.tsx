import { ArrowUp, ChevronDown, FileText, Image, LoaderCircle, Plus, Quote, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { promptPresets } from '../../data/promptPresets';
import { ModelSelector } from './ModelSelector';
import { readAttachment } from '../../services/files';
import { useChatActions } from '../../hooks/useChatActions';
import { text } from '../../i18n';

export function Composer() {
  const [modelsOpen, setModelsOpen] = useState(false); const [attachmentsOpen, setAttachmentsOpen] = useState(false); const [fileError, setFileError] = useState(''); const [readingFile, setReadingFile] = useState(false);
  const zone = useRef<HTMLDivElement>(null); const textarea = useRef<HTMLTextAreaElement>(null); const documentInput = useRef<HTMLInputElement>(null); const imageInput = useRef<HTMLInputElement>(null);
  const { model, providerMode, uiLanguage, promptLanguage, draft, paper, selection, bridgeState, apiState, attachments, sending, setDraft, setSelection, addAttachment, removeAttachment } = useAppStore();
  const { submit } = useChatActions();
  const value = draft;
  useEffect(() => { if (!textarea.current) return; textarea.current.style.height = '0'; textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 128)}px`; }, [value]);
  useEffect(() => {
    const focus = () => textarea.current?.focus();
    window.addEventListener('paperflow:focus-composer', focus);
    return () => window.removeEventListener('paperflow:focus-composer', focus);
  }, []);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!zone.current?.contains(event.target as Node)) {
        setModelsOpen(false);
        setAttachmentsOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setModelsOpen(false);
        setAttachmentsOpen(false);
      }
    };
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('keydown', escape);
    };
  }, []);
  const send = async () => {
    await submit(value);
  };
  const selectFile = async (file?: File) => {
    if (!file) return; setFileError(''); setReadingFile(true);
    try { addAttachment(await readAttachment(file)); setAttachmentsOpen(false); } catch (error) { setFileError(error instanceof Error ? error.message : text(uiLanguage, 'Could not read this file.', '无法读取该文件。')); } finally { setReadingFile(false); }
  };
  const applyPreset = (prompt: string) => {
    setDraft(prompt);
    requestAnimationFrame(() => textarea.current?.focus());
  };
  return <div className="composer-zone" ref={zone}>
    <div className="prompt-presets" aria-label={text(uiLanguage, 'Prompt shortcuts', '快捷提示词')}>
      {promptPresets.map((preset) => <button key={preset.id} onClick={() => applyPreset(preset.prompt[promptLanguage === 'auto' ? uiLanguage : promptLanguage])}>{preset.label[uiLanguage]}</button>)}
    </div>
    {selection && <div className="selection-preview selected-text-preview"><Quote size={15} /><div><span>{text(uiLanguage, `Selected text · Page ${selection.page}`, `选中文字 · 第 ${selection.page} 页`)}</span><p>{selection.text}</p></div><button aria-label={text(uiLanguage, 'Remove selected text', '移除选中文字')} onClick={() => setSelection(null)}><X size={14} /></button></div>}
    {attachments.map((attachment) => <div className="selection-preview" key={attachment.id}>{attachment.kind === 'image' && attachment.dataUrl ? <img src={attachment.dataUrl} alt="" /> : <FileText size={15} />}<div><span>{attachment.kind === 'pdf' ? `PDF${attachment.pageCount ? ` · ${attachment.pageCount} pages` : ''}` : attachment.kind === 'image' ? 'Image' : 'Text file'}</span><p>{attachment.name}</p></div><button aria-label={`Remove ${attachment.name}`} onClick={() => removeAttachment(attachment.id)}><X size={14} /></button></div>)}
    {fileError && <div className="composer-error">{fileError}</div>}
    <div className="composer">
      <textarea ref={textarea} rows={1} value={value} onChange={(e) => setDraft(e.target.value)} placeholder={(providerMode === 'api' ? apiState : bridgeState) === 'connected' ? text(uiLanguage, 'Ask about this paper…', '向这篇论文提问…') : text(uiLanguage, 'Connect an AI provider to send…', '请先连接 AI 服务…')} onKeyDown={(e) => {
        const composing = e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229;
        if (e.key === 'Enter' && !e.shiftKey && !composing) {
          e.preventDefault();
          void send();
        }
      }} aria-label={text(uiLanguage, 'Ask about this paper', '向论文提问')} />
      <input ref={documentInput} hidden type="file" accept="application/pdf,.pdf,text/plain,.txt,.md" onChange={(event) => { void selectFile(event.target.files?.[0]); event.currentTarget.value = ''; }} />
      <input ref={imageInput} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { void selectFile(event.target.files?.[0]); event.currentTarget.value = ''; }} />
      <div className="composer-toolbar"><div className="composer-left"><div className="attachment-anchor"><button className="compact-icon" aria-label={text(uiLanguage, 'Add attachment', '添加附件')} onClick={() => setAttachmentsOpen((open) => !open)} disabled={readingFile}>{readingFile ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}</button>{attachmentsOpen && <div className="popover attachment-popover" role="menu"><button onClick={() => documentInput.current?.click()}><FileText size={16} /><span><strong>{text(uiLanguage, 'Upload document', '上传文档')}</strong><small>PDF, TXT, Markdown</small></span></button><button onClick={() => imageInput.current?.click()}><Image size={16} /><span><strong>{text(uiLanguage, 'Upload image', '上传图片')}</strong><small>PNG, JPEG, WebP, GIF</small></span></button></div>}</div><button className="context-select"><span className="status-dot" />{attachments.length ? text(uiLanguage, `${attachments.length} files`, `${attachments.length} 个附件`) : paper ? text(uiLanguage, 'Paper', '论文') : text(uiLanguage, 'No paper', '无论文')}<ChevronDown size={13} /></button></div>
        <div className="composer-right"><div className="model-anchor"><button className="model-trigger" onClick={() => setModelsOpen((v) => !v)}>{model}<ChevronDown size={13} /></button>{modelsOpen && <ModelSelector close={() => setModelsOpen(false)} />}</div><button className="send" disabled={!value.trim() || sending} onClick={() => void send()} aria-label="Send message">{sending ? <LoaderCircle className="spin" size={16} /> : <ArrowUp size={16} />}</button></div>
      </div>
    </div>
  </div>;
}
