import {
  AlertCircle,
  BookOpen,
  Files,
  Highlighter,
  Languages,
  ListTree,
  LoaderCircle,
  MessageSquare,
  NotebookPen,
  Quote,
  ScanText,
} from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { FormEvent } from 'react';
import { text } from '../../i18n';
import type { Annotation, Language, ReaderSidebar } from '../../types';
import { PdfThumbnail } from './PdfThumbnail';

export interface FlatOutlineItem {
  title: string;
  dest: string | unknown[] | null;
  depth: number;
}

export function annotationsWithComments(annotations: Annotation[]): Annotation[] {
  return annotations.filter((annotation) => Boolean(annotation.comment?.trim()));
}

export function ReaderSidebarPanel({
  document,
  language,
  pageCount,
  page,
  view,
  outline,
  annotations,
  selectedAnnotationId,
  onViewChange,
  onPageChange,
  onOutlineClick,
  onAnnotationClick,
}: {
  document: PDFDocumentProxy;
  language: Language;
  pageCount: number;
  page: number;
  view: ReaderSidebar;
  outline: FlatOutlineItem[];
  annotations: Annotation[];
  selectedAnnotationId?: string;
  onViewChange: (view: ReaderSidebar) => void;
  onPageChange: (page: number) => void;
  onOutlineClick: (item: FlatOutlineItem) => void;
  onAnnotationClick: (annotation: Annotation) => void;
}) {
  const commentedAnnotations = annotationsWithComments(annotations);
  return <aside className="reader-sidebar">
    <div className="reader-sidebar-tabs" role="tablist">
      <button title={text(language, 'Page thumbnails', '页面缩略图')} aria-label={text(language, 'Page thumbnails', '页面缩略图')} data-active={view === 'thumbnails'} onClick={() => onViewChange('thumbnails')}><Files /></button>
      <button title={text(language, 'My annotations', '我的批注')} aria-label={text(language, 'My annotations', '我的批注')} data-active={view === 'annotations'} onClick={() => onViewChange('annotations')}><NotebookPen /></button>
      <button title={text(language, 'Document outline', '文档目录')} aria-label={text(language, 'Document outline', '文档目录')} data-active={view === 'outline'} onClick={() => onViewChange('outline')}><ListTree /></button>
    </div>
    <div className="reader-sidebar-content">
      {view === 'thumbnails' && Array.from(
        { length: pageCount },
        (_, index) => <PdfThumbnail key={index + 1} document={document} pageNumber={index + 1} active={page === index + 1} onClick={() => onPageChange(index + 1)} />,
      )}
      {view === 'annotations' && (commentedAnnotations.length
        ? <nav className="reader-annotations">{commentedAnnotations.map((annotation) => <button
          key={annotation.id}
          data-active={selectedAnnotationId === annotation.id}
          onClick={() => onAnnotationClick(annotation)}
        >
          <i style={{ background: annotation.color || '#f4cf4f' }} />
          <span>
            <small>{text(language, `Page ${annotation.page}`, `第 ${annotation.page} 页`)}</small>
            <strong>{annotation.comment}</strong>
            {annotation.text && <em>{annotation.text}</em>}
          </span>
        </button>)}</nav>
        : <div className="reader-sidebar-empty">{text(language, 'Comments added to highlights and annotations will appear here.', '为高亮或批注添加文字评论后，会显示在这里。')}</div>)}
      {view === 'outline' && (outline.length
        ? <nav className="reader-outline">{outline.map((item, index) => <button key={`${item.title}-${index}`} style={{ paddingLeft: 10 + item.depth * 12 }} onClick={() => onOutlineClick(item)}>{item.title}</button>)}</nav>
        : <div className="reader-sidebar-empty">{text(language, 'This PDF has no document outline.', '此 PDF 没有文档目录。')}</div>)}
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
  onAction: (action: 'ask' | 'explain' | 'translate' | 'summarize' | 'highlight') => void;
}) {
  return <div className="selection-toolbar" style={{ left: x, top: y }}>
    <button title={text(language, 'Ask', '提问')} aria-label={text(language, 'Ask', '提问')} onClick={() => onAction('ask')}><MessageSquare /><span>{text(language, 'Ask', '提问')}</span></button>
    <button title={text(language, 'Explain', '解释')} aria-label={text(language, 'Explain', '解释')} onClick={() => onAction('explain')}><ScanText /><span>{text(language, 'Explain', '解释')}</span></button>
    <button title={text(language, 'Translate', '翻译')} aria-label={text(language, 'Translate', '翻译')} onClick={() => onAction('translate')}><Languages /><span>{text(language, 'Translate', '翻译')}</span></button>
    <button title={text(language, 'Summarize', '总结')} aria-label={text(language, 'Summarize', '总结')} onClick={() => onAction('summarize')}><Quote /><span>{text(language, 'Summarize', '总结')}</span></button>
    <button title={text(language, 'Highlight', '高亮')} aria-label={text(language, 'Highlight', '高亮')} onClick={() => onAction('highlight')}><Highlighter /><span>{text(language, 'Highlight', '高亮')}</span></button>
  </div>;
}
