import {
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
import type { OcrLanguage, OcrProgress } from '../../services/ocr/ocrService';
import type { Theme } from '../../types';

interface ReaderToolbarProps {
  title: string;
  page: number;
  pageCount: number;
  scale: number;
  theme: Theme;
  sidebarOpen: boolean;
  assistantOpen: boolean;
  searchQuery: string;
  searchPages: number[];
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
  return <header className="reader-toolbar">
    <div className="reader-toolbar-group reader-document-tools">
      <button title="Toggle navigation" aria-label="Toggle navigation" data-active={props.sidebarOpen} onClick={props.onSidebarToggle}><PanelLeft /></button>
      <div className="reader-title" title={props.title}>{props.title || 'PaperFlow Reader'}</div>
      <button title="Open local PDF" aria-label="Open local PDF" onClick={props.onOpenFile}><FolderOpen /></button>
    </div>
    <div className="reader-toolbar-group reader-page-tools">
      <button title="Previous page" aria-label="Previous page" disabled={props.page <= 1} onClick={() => setPage(props.page - 1)}><ChevronLeft /></button>
      <label className="page-number-control">
        <input aria-label="Page number" value={props.page} onChange={(event) => setPage(Number(event.target.value) || 1)} />
        <span>/ {props.pageCount || 0}</span>
      </label>
      <button title="Next page" aria-label="Next page" disabled={props.page >= props.pageCount} onClick={() => setPage(props.page + 1)}><ChevronRight /></button>
      <i />
      <button title="Zoom out" aria-label="Zoom out" onClick={() => props.onScaleChange(Math.max(.45, props.scale - .1))}><ZoomOut /></button>
      <button className="zoom-label" title="Reset zoom" onClick={() => props.onScaleChange(1)}>{Math.round(props.scale * 100)}%</button>
      <button title="Zoom in" aria-label="Zoom in" onClick={() => props.onScaleChange(Math.min(2.5, props.scale + .1))}><ZoomIn /></button>
      <button title="Fit to width" aria-label="Fit to width" onClick={props.onFitWidth}><Maximize2 /></button>
    </div>
    <div className="reader-toolbar-group reader-action-tools">
      <div className="reader-search">
        <button title="Search document" aria-label="Search document" data-active={searchOpen} onClick={() => setSearchOpen((open) => !open)}><Search /></button>
        {searchOpen && <div className="reader-search-popover">
          <input autoFocus value={props.searchQuery} onChange={(event) => props.onSearchChange(event.target.value)} placeholder="Search in document" />
          <span>{props.searchQuery ? `${props.searchPages.length} pages` : 'Type to search'}</span>
          {!!props.searchPages.length && <div>{props.searchPages.slice(0, 12).map((page) => <button key={page} onClick={() => setPage(page)}>Page {page}</button>)}</div>}
        </div>}
      </div>
      <button title={themeIsDark ? 'Use light theme' : 'Use dark theme'} aria-label="Toggle theme" onClick={() => props.onThemeChange(themeIsDark ? 'light' : 'dark')}>{themeIsDark ? <Sun /> : <Moon />}</button>
      <button
        title={props.offlineState === 'available' ? 'PDF available offline' : props.offlineState === 'saving' ? 'Saving PDF offline' : 'Save paper and PDF offline'}
        aria-label="Save PDF offline"
        data-active={props.offlineState === 'available'}
        disabled={!props.pageCount || props.offlineState !== 'unavailable'}
        onClick={props.onSaveOffline}
      >{props.offlineState === 'saving' ? <LoaderCircle className="spin" /> : <HardDriveDownload />}</button>
      <div className="reader-ocr">
        <button title="OCR pages" aria-label="OCR pages" data-active={ocrOpen || Boolean(props.ocrProgress)} disabled={!props.pageCount} onClick={() => {
          setOcrFrom(props.page);
          setOcrTo(props.page);
          setOcrOpen((open) => !open);
        }}><ScanText /></button>
        {ocrOpen && <div className="reader-ocr-popover">
          <strong>Recognize scanned pages</strong>
          <div className="ocr-page-range">
            <label><span>From</span><input type="number" min={1} max={props.pageCount} value={ocrFrom} onChange={(event) => setOcrFrom(Number(event.target.value))} /></label>
            <label><span>To</span><input type="number" min={1} max={props.pageCount} value={ocrTo} onChange={(event) => setOcrTo(Number(event.target.value))} /></label>
          </div>
          <label className="ocr-language"><span>Language</span><select value={ocrLanguage} onChange={(event) => setOcrLanguage(event.target.value as OcrLanguage)}><option value="eng">English</option><option value="chi_sim">简体中文</option><option value="eng+chi_sim">English + 简体中文</option></select></label>
          {props.ocrProgress
            ? <><div className="ocr-progress"><span style={{ width: `${Math.max(2, props.ocrProgress.progress * 100)}%` }} /></div><small>Page {props.ocrProgress.page} · {props.ocrProgress.status}</small><button className="ocr-command" onClick={props.onCancelOcr}>Cancel OCR</button></>
            : <button className="ocr-command" onClick={() => props.onStartOcr(
              Math.max(1, Math.min(props.pageCount, Math.min(ocrFrom, ocrTo))),
              Math.max(1, Math.min(props.pageCount, Math.max(ocrFrom, ocrTo))),
              ocrLanguage,
            )}>Start OCR</button>}
        </div>}
      </div>
      <button title="Download PDF" aria-label="Download PDF" onClick={props.onDownload}><Download /></button>
      <button title="Print" aria-label="Print" onClick={props.onPrint}><Printer /></button>
      <button title="Open library" aria-label="Open library" onClick={openLibrary}><Library /></button>
      <button title="Toggle AI panel" aria-label="Toggle AI panel" data-active={props.assistantOpen} onClick={props.onAssistantToggle}><PanelRight /></button>
    </div>
  </header>;
}
