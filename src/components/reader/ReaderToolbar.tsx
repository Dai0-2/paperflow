import {
  ChevronLeft,
  ChevronRight,
  Download,
  FolderOpen,
  Maximize2,
  Moon,
  PanelLeft,
  PanelRight,
  Printer,
  Search,
  Sun,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useState } from 'react';
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
}

export function ReaderToolbar(props: ReaderToolbarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const themeIsDark = props.theme === 'dark'
    || (props.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const setPage = (page: number) => props.onPageChange(Math.max(1, Math.min(props.pageCount, page)));
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
      <button title="Download PDF" aria-label="Download PDF" onClick={props.onDownload}><Download /></button>
      <button title="Print" aria-label="Print" onClick={props.onPrint}><Printer /></button>
      <button title="Toggle AI panel" aria-label="Toggle AI panel" data-active={props.assistantOpen} onClick={props.onAssistantToggle}><PanelRight /></button>
    </div>
  </header>;
}
