import {
  BookmarkCheck,
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  Download,
  FolderOpen,
  HardDriveDownload,
  Library,
  LoaderCircle,
  Maximize2,
  Moon,
  PanelLeft,
  PanelRight,
  Printer,
  ScanText,
  Search,
  Sun,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useState } from 'react';
import { text } from '../../i18n';
import type { OcrLanguage, OcrProgress } from '../../services/ocr/ocrService';
import type { Language, Theme } from '../../types';

interface ReaderToolbarProps {
  title: string;
  page: number;
  pageCount: number;
  scale: number;
  theme: Theme;
  language: Language;
  sidebarOpen: boolean;
  assistantOpen: boolean;
  searchQuery: string;
  searchPages: number[];
  libraryState: 'temporary' | 'saving' | 'saved';
  offlineState: 'unavailable' | 'saving' | 'available';
  ocrProgress?: OcrProgress;
  onPageChange: (page: number) => void;
  onScaleChange: (scale: number) => void;
  onFitWidth: () => void;
  onThemeChange: (theme: Theme) => void;
  onSidebarToggle: () => void;
  onAssistantToggle: () => void;
  onSearchChange: (query: string) => void;
  onOpenFile: () => void;
  onDownload: () => void;
  onPrint: () => void;
  onSaveToLibrary: () => void;
  onSaveOffline: () => void;
  onStartOcr: (fromPage: number, toPage: number, language: OcrLanguage) => void;
  onCancelOcr: () => void;
}

export function ReaderToolbar(props: ReaderToolbarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrFrom, setOcrFrom] = useState(props.page);
  const [ocrTo, setOcrTo] = useState(props.page);
  const [ocrLanguage, setOcrLanguage] = useState<OcrLanguage>('eng');
  const themeIsDark = props.theme === 'dark'
    || (props.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const setPage = (page: number) => props.onPageChange(Math.max(1, Math.min(props.pageCount, page)));
  const openLibrary = () => {
    const url = typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('library.html')
      : '/library.html';
    window.open(url, '_blank', 'noopener');
  };
  const libraryTitle = props.libraryState === 'saved'
    ? text(props.language, 'Saved to PaperFlow', '已保存到 PaperFlow')
    : props.libraryState === 'saving'
      ? text(props.language, 'Saving to PaperFlow', '正在保存到 PaperFlow')
      : text(props.language, 'Save to PaperFlow', '保存到 PaperFlow');
  const offlineTitle = props.offlineState === 'available'
    ? text(props.language, 'PDF available offline', 'PDF 可离线使用')
    : props.offlineState === 'saving'
      ? text(props.language, 'Saving PDF offline', '正在保存离线 PDF')
      : text(props.language, 'Save PDF offline', '保存离线 PDF');
  return <header className="reader-toolbar">
    <div className="reader-toolbar-group reader-document-tools">
      <button title={text(props.language, 'Toggle navigation', '切换导航栏')} aria-label={text(props.language, 'Toggle navigation', '切换导航栏')} data-active={props.sidebarOpen} onClick={props.onSidebarToggle}><PanelLeft /></button>
      <div className="reader-title" title={props.title}>{props.title || 'PaperFlow Reader'}</div>
      <button title={text(props.language, 'Open local PDF', '打开本地 PDF')} aria-label={text(props.language, 'Open local PDF', '打开本地 PDF')} onClick={props.onOpenFile}><FolderOpen /></button>
    </div>
    <div className="reader-toolbar-group reader-page-tools">
      <button title={text(props.language, 'Previous page', '上一页')} aria-label={text(props.language, 'Previous page', '上一页')} disabled={props.page <= 1} onClick={() => setPage(props.page - 1)}><ChevronLeft /></button>
      <label className="page-number-control">
        <input aria-label={text(props.language, 'Page number', '页码')} value={props.page} onChange={(event) => setPage(Number(event.target.value) || 1)} />
        <span>/ {props.pageCount || 0}</span>
      </label>
      <button title={text(props.language, 'Next page', '下一页')} aria-label={text(props.language, 'Next page', '下一页')} disabled={props.page >= props.pageCount} onClick={() => setPage(props.page + 1)}><ChevronRight /></button>
      <i />
      <button title={text(props.language, 'Zoom out', '缩小')} aria-label={text(props.language, 'Zoom out', '缩小')} onClick={() => props.onScaleChange(Math.max(.45, props.scale - .1))}><ZoomOut /></button>
      <button className="zoom-label" title={text(props.language, 'Reset zoom', '重置缩放')} onClick={() => props.onScaleChange(1)}>{Math.round(props.scale * 100)}%</button>
      <button title={text(props.language, 'Zoom in', '放大')} aria-label={text(props.language, 'Zoom in', '放大')} onClick={() => props.onScaleChange(Math.min(2.5, props.scale + .1))}><ZoomIn /></button>
      <button title={text(props.language, 'Fit to width', '适合宽度')} aria-label={text(props.language, 'Fit to width', '适合宽度')} onClick={props.onFitWidth}><Maximize2 /></button>
    </div>
    <div className="reader-toolbar-group reader-action-tools">
      <div className="reader-search">
        <button title={text(props.language, 'Search document', '搜索文档')} aria-label={text(props.language, 'Search document', '搜索文档')} data-active={searchOpen} onClick={() => setSearchOpen((open) => !open)}><Search /></button>
        {searchOpen && <div className="reader-search-popover">
          <input autoFocus value={props.searchQuery} onChange={(event) => props.onSearchChange(event.target.value)} placeholder={text(props.language, 'Search in document', '在文档中搜索')} />
          <span>{props.searchQuery ? text(props.language, `${props.searchPages.length} pages`, `${props.searchPages.length} 页`) : text(props.language, 'Type to search', '输入关键词搜索')}</span>
          {!!props.searchPages.length && <div>{props.searchPages.slice(0, 12).map((page) => <button key={page} onClick={() => setPage(page)}>{text(props.language, `Page ${page}`, `第 ${page} 页`)}</button>)}</div>}
        </div>}
      </div>
      <button title={themeIsDark ? text(props.language, 'Use light theme', '使用浅色主题') : text(props.language, 'Use dark theme', '使用深色主题')} aria-label={text(props.language, 'Toggle theme', '切换主题')} onClick={() => props.onThemeChange(themeIsDark ? 'light' : 'dark')}>{themeIsDark ? <Sun /> : <Moon />}</button>
      <button
        title={libraryTitle}
        aria-label={text(props.language, 'Save to PaperFlow', '保存到 PaperFlow')}
        data-active={props.libraryState === 'saved'}
        disabled={!props.pageCount || props.libraryState !== 'temporary'}
        onClick={props.onSaveToLibrary}
      >{props.libraryState === 'saving'
          ? <LoaderCircle className="spin" />
          : props.libraryState === 'saved' ? <BookmarkCheck /> : <BookmarkPlus />}</button>
      <button
        title={offlineTitle}
        aria-label={text(props.language, 'Save PDF offline', '保存离线 PDF')}
        data-active={props.offlineState === 'available'}
        disabled={!props.pageCount || props.offlineState !== 'unavailable'}
        onClick={props.onSaveOffline}
      >{props.offlineState === 'saving' ? <LoaderCircle className="spin" /> : <HardDriveDownload />}</button>
      <div className="reader-ocr">
        <button title={text(props.language, 'OCR pages', '识别扫描页面')} aria-label={text(props.language, 'OCR pages', '识别扫描页面')} data-active={ocrOpen || Boolean(props.ocrProgress)} disabled={!props.pageCount} onClick={() => {
          setOcrFrom(props.page);
          setOcrTo(props.page);
          setOcrOpen((open) => !open);
        }}><ScanText /></button>
        {ocrOpen && <div className="reader-ocr-popover">
          <strong>{text(props.language, 'Recognize scanned pages', '识别扫描页面')}</strong>
          <div className="ocr-page-range">
            <label><span>{text(props.language, 'From', '从')}</span><input type="number" min={1} max={props.pageCount} value={ocrFrom} onChange={(event) => setOcrFrom(Number(event.target.value))} /></label>
            <label><span>{text(props.language, 'To', '到')}</span><input type="number" min={1} max={props.pageCount} value={ocrTo} onChange={(event) => setOcrTo(Number(event.target.value))} /></label>
          </div>
          <label className="ocr-language"><span>{text(props.language, 'Language', '语言')}</span><select value={ocrLanguage} onChange={(event) => setOcrLanguage(event.target.value as OcrLanguage)}><option value="eng">English</option><option value="chi_sim">简体中文</option><option value="eng+chi_sim">English + 简体中文</option></select></label>
          {props.ocrProgress
            ? <><div className="ocr-progress"><span style={{ width: `${Math.max(2, props.ocrProgress.progress * 100)}%` }} /></div><small>{text(props.language, `Page ${props.ocrProgress.page}`, `第 ${props.ocrProgress.page} 页`)} · {props.ocrProgress.status}</small><button className="ocr-command" onClick={props.onCancelOcr}>{text(props.language, 'Cancel OCR', '取消 OCR')}</button></>
            : <button className="ocr-command" onClick={() => props.onStartOcr(
              Math.max(1, Math.min(props.pageCount, Math.min(ocrFrom, ocrTo))),
              Math.max(1, Math.min(props.pageCount, Math.max(ocrFrom, ocrTo))),
              ocrLanguage,
            )}>{text(props.language, 'Start OCR', '开始 OCR')}</button>}
        </div>}
      </div>
      <button title={text(props.language, 'Download PDF', '下载 PDF')} aria-label={text(props.language, 'Download PDF', '下载 PDF')} onClick={props.onDownload}><Download /></button>
      <button title={text(props.language, 'Print', '打印')} aria-label={text(props.language, 'Print', '打印')} onClick={props.onPrint}><Printer /></button>
      <button title={text(props.language, 'Open library', '打开资料库')} aria-label={text(props.language, 'Open library', '打开资料库')} onClick={openLibrary}><Library /></button>
      <button title={text(props.language, 'Toggle AI panel', '切换 AI 面板')} aria-label={text(props.language, 'Toggle AI panel', '切换 AI 面板')} data-active={props.assistantOpen} onClick={props.onAssistantToggle}><PanelRight /></button>
    </div>
  </header>;
}
