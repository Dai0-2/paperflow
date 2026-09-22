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
import type { ReaderSidebar } from '../../types';
import { PdfThumbnail } from './PdfThumbnail';

export interface FlatOutlineItem {
  title: string;
  dest: string | unknown[] | null;
  depth: number;
}

export function ReaderSidebarPanel({
  document,
  pageCount,
  page,
  view,
  outline,
  onViewChange,
  onPageChange,
  onOutlineClick,
}: {
  document: PDFDocumentProxy;
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
      <button data-active={view === 'thumbnails'} onClick={() => onViewChange('thumbnails')}>Pages</button>
      <button data-active={view === 'outline'} onClick={() => onViewChange('outline')}>Outline</button>
    </div>
    <div className="reader-sidebar-content">
      {view === 'thumbnails'
        ? Array.from({ length: pageCount }, (_, index) => <PdfThumbnail key={index + 1} document={document} pageNumber={index + 1} active={page === index + 1} onClick={() => onPageChange(index + 1)} />)
        : outline.length
          ? <nav className="reader-outline">{outline.map((item, index) => <button key={`${item.title}-${index}`} style={{ paddingLeft: 10 + item.depth * 12 }} onClick={() => onOutlineClick(item)}>{item.title}</button>)}</nav>
          : <div className="reader-sidebar-empty">This PDF has no document outline.</div>}
    </div>
  </aside>;
}

export function ReaderOpenState({
  url,
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
    <h1>Open a research paper</h1>
    <p>Paste an HTTPS PDF URL or choose a local PDF. The document stays on this device unless you explicitly send selected context to your AI provider.</p>
    <form onSubmit={submit}>
      <input value={url} onChange={(event) => onUrlChange(event.target.value)} placeholder="https://example.org/paper.pdf" />
      <button disabled={!url.trim()}>Open</button>
    </form>
    <button className="reader-local-file" onClick={onOpenFile}>Choose local PDF</button>
    {loading && <div className="reader-loading"><LoaderCircle className="spin" />Loading PDF{progress ? ` · ${Math.round(progress * 100)}%` : '…'}</div>}
    {error && <div className="reader-error"><AlertCircle /><span>{error}</span>{accessRequired && <button onClick={onGrantAccess}>Allow this host</button>}</div>}
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
    <button title="Ask" onClick={() => onAction('ask')}><MessageSquare /><span>{language === 'zh' ? '提问' : 'Ask'}</span></button>
    <button title="Explain" onClick={() => onAction('explain')}><ScanText /><span>{language === 'zh' ? '解释' : 'Explain'}</span></button>
    <button title="Translate" onClick={() => onAction('translate')}><Languages /><span>{language === 'zh' ? '翻译' : 'Translate'}</span></button>
    <button title="Summarize" onClick={() => onAction('summarize')}><Quote /><span>{language === 'zh' ? '总结' : 'Summarize'}</span></button>
    <button title="Save" onClick={() => onAction('save')}><Save /><span>{language === 'zh' ? '保存' : 'Save'}</span></button>
  </div>;
}
