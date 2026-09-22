import {
  AlertCircle,
  BookOpen,
  Languages,
  LoaderCircle,
  MessageSquare,
  Quote,
  Save,
  ScanText,
} from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { FormEvent } from 'react';
import { text } from '../../i18n';
import type { Language, ReaderSidebar } from '../../types';
import { PdfThumbnail } from './PdfThumbnail';

export interface FlatOutlineItem {
  title: string;
  dest: string | unknown[] | null;
  depth: number;
}

export function ReaderSidebarPanel({
  document,
  language,
  pageCount,
  page,
  view,
  outline,
  onViewChange,
  onPageChange,
  onOutlineClick,
}: {
  document: PDFDocumentProxy;
  language: Language;
  pageCount: number;
  page: number;
  view: ReaderSidebar;
  outline: FlatOutlineItem[];
  onViewChange: (view: ReaderSidebar) => void;
  onPageChange: (page: number) => void;
  onOutlineClick: (item: FlatOutlineItem) => void;
}) {
  return <aside className="reader-sidebar">
    <div className="reader-sidebar-tabs">
      <button data-active={view === 'thumbnails'} onClick={() => onViewChange('thumbnails')}>{text(language, 'Pages', '页面')}</button>
      <button data-active={view === 'outline'} onClick={() => onViewChange('outline')}>{text(language, 'Outline', '目录')}</button>
    </div>
    <div className="reader-sidebar-content">
      {view === 'thumbnails'
        ? Array.from({ length: pageCount }, (_, index) => <PdfThumbnail key={index + 1} document={document} pageNumber={index + 1} active={page === index + 1} onClick={() => onPageChange(index + 1)} />)
        : outline.length
          ? <nav className="reader-outline">{outline.map((item, index) => <button key={`${item.title}-${index}`} style={{ paddingLeft: 10 + item.depth * 12 }} onClick={() => onOutlineClick(item)}>{item.title}</button>)}</nav>
          : <div className="reader-sidebar-empty">{text(language, 'This PDF has no document outline.', '此 PDF 没有文档目录。')}</div>}
    </div>
  </aside>;
}

export function ReaderOpenState({
  url,
  language,
  loading,
  progress,
  error,
  accessRequired,
  onUrlChange,
  onSubmit,
  onOpenFile,
  onGrantAccess,
}: {
  url: string;
  language: Language;
  loading: boolean;
  progress: number;
  error: string;
  accessRequired: boolean;
  onUrlChange: (url: string) => void;
  onSubmit: () => void;
  onOpenFile: () => void;
  onGrantAccess: () => void;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return <div className="reader-open-state">
    <BookOpen size={28} strokeWidth={1.4} />
    <h1>{text(language, 'Open a research paper', '打开研究论文')}</h1>
    <p>{text(language, 'Paste an HTTPS PDF URL or choose a local PDF. The document stays on this device unless you explicitly send selected context to your AI provider.', '粘贴 HTTPS PDF 链接或选择本地 PDF。除非你主动发送选中上下文，否则文档会保留在此设备上。')}</p>
    <form onSubmit={submit}>
      <input value={url} onChange={(event) => onUrlChange(event.target.value)} placeholder="https://example.org/paper.pdf" />
      <button disabled={!url.trim()}>{text(language, 'Open', '打开')}</button>
    </form>
    <button className="reader-local-file" onClick={onOpenFile}>{text(language, 'Choose local PDF', '选择本地 PDF')}</button>
    {loading && <div className="reader-loading"><LoaderCircle className="spin" />{text(language, 'Loading PDF', '正在加载 PDF')}{progress ? ` · ${Math.round(progress * 100)}%` : '…'}</div>}
    {error && <div className="reader-error"><AlertCircle /><span>{error}</span>{accessRequired && <button onClick={onGrantAccess}>{text(language, 'Allow this host', '允许此来源')}</button>}</div>}
  </div>;
}

export function SelectionToolbar({
  x,
  y,
  language,
  onAction,
}: {
  x: number;
  y: number;
  language: 'en' | 'zh';
  onAction: (action: 'ask' | 'explain' | 'translate' | 'summarize' | 'save') => void;
}) {
  return <div className="selection-toolbar" style={{ left: x, top: y }}>
    <button title={text(language, 'Ask', '提问')} onClick={() => onAction('ask')}><MessageSquare /><span>{text(language, 'Ask', '提问')}</span></button>
    <button title={text(language, 'Explain', '解释')} onClick={() => onAction('explain')}><ScanText /><span>{text(language, 'Explain', '解释')}</span></button>
    <button title={text(language, 'Translate', '翻译')} onClick={() => onAction('translate')}><Languages /><span>{text(language, 'Translate', '翻译')}</span></button>
    <button title={text(language, 'Summarize', '总结')} onClick={() => onAction('summarize')}><Quote /><span>{text(language, 'Summarize', '总结')}</span></button>
    <button title={text(language, 'Save', '保存')} onClick={() => onAction('save')}><Save /><span>{text(language, 'Save', '保存')}</span></button>
  </div>;
}
