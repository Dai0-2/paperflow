import { ChevronDown, ChevronUp, FileText, Star } from 'lucide-react';
import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { PaperInfo, ReadStatus } from '../../types';
import type { LibrarySortKey } from '../../store/useLibraryStore';

interface PaperTableProps {
  papers: PaperInfo[];
  loading: boolean;
  selectedIds: string[];
  activeId: string | null;
  sortKey: LibrarySortKey;
  sortDirection: 'asc' | 'desc';
  onSort: (key: LibrarySortKey) => void;
  onSelect: (paperId: string, additive: boolean) => void;
  onSelectAll: (paperIds: string[]) => void;
  onOpen: (paper: PaperInfo) => void;
  onFavorite: (paper: PaperInfo) => Promise<void>;
  onReadStatus: (paper: PaperInfo, status: ReadStatus) => Promise<void>;
}

interface SortHeaderProps {
  label: string;
  value: LibrarySortKey;
  active: boolean;
  direction: 'asc' | 'desc';
  onSort: (key: LibrarySortKey) => void;
}

function SortHeader({ label, value, active, direction, onSort }: SortHeaderProps) {
  return <button onClick={() => onSort(value)}>
    <span>{label}</span>{active && (direction === 'asc' ? <ChevronUp /> : <ChevronDown />)}
  </button>;
}

export function PaperTable(props: PaperTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: props.papers.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 52,
    overscan: 12,
  });
  const allSelected = props.papers.length > 0 && props.papers.every((paper) => props.selectedIds.includes(paper.id));
  return <section className="paper-table-region" aria-label="Papers">
    <div className="paper-table-header library-paper-grid">
      <label><input type="checkbox" aria-label="Select all visible papers" checked={allSelected} onChange={() => props.onSelectAll(allSelected ? [] : props.papers.map((paper) => paper.id))} /></label>
      <span />
      <SortHeader label="Title" value="title" active={props.sortKey === 'title'} direction={props.sortDirection} onSort={props.onSort} />
      <SortHeader label="Authors" value="authors" active={props.sortKey === 'authors'} direction={props.sortDirection} onSort={props.onSort} />
      <SortHeader label="Year" value="year" active={props.sortKey === 'year'} direction={props.sortDirection} onSort={props.onSort} />
      <SortHeader label="Source" value="source" active={props.sortKey === 'source'} direction={props.sortDirection} onSort={props.onSort} />
      <SortHeader label="Status" value="readStatus" active={props.sortKey === 'readStatus'} direction={props.sortDirection} onSort={props.onSort} />
    </div>
    <div className="paper-table-scroll" ref={scrollRef}>
      {props.loading
        ? <div className="library-table-state">Loading library…</div>
        : !props.papers.length
          ? <div className="library-table-state"><FileText /><strong>No papers in this view</strong><span>Import references or save a paper from the Reader.</span></div>
          : <div className="paper-table-virtual" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((row) => {
                const paper = props.papers[row.index];
                const selected = props.selectedIds.includes(paper.id);
                return <div
                  className="paper-table-row library-paper-grid"
                  data-selected={selected}
                  data-active={props.activeId === paper.id}
                  key={paper.id}
                  style={{ transform: `translateY(${row.start}px)` }}
                  onClick={(event) => props.onSelect(paper.id, event.metaKey || event.ctrlKey || event.shiftKey)}
                  onDoubleClick={() => props.onOpen(paper)}
                >
                  <label onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Select ${paper.title}`} checked={selected} onChange={() => props.onSelect(paper.id, true)} /></label>
                  <button className="paper-star" title={paper.favorite ? 'Remove star' : 'Add star'} aria-label={paper.favorite ? 'Remove star' : 'Add star'} data-active={paper.favorite} onClick={(event) => {
                    event.stopPropagation();
                    void props.onFavorite(paper);
                  }}><Star /></button>
                  <div className="paper-title-cell"><strong title={paper.title}>{paper.title}</strong><small>{paper.doi || paper.arxivId || paper.openReviewId || ''}</small></div>
                  <span title={paper.authors}>{paper.authors || 'Unknown author'}</span>
                  <span>{paper.year || '—'}</span>
                  <span title={paper.journal || paper.source}>{paper.journal || paper.source || '—'}</span>
                  <select aria-label={`Reading status for ${paper.title}`} value={paper.readStatus || 'unread'} onClick={(event) => event.stopPropagation()} onChange={(event) => void props.onReadStatus(paper, event.target.value as ReadStatus)}>
                    <option value="unread">Unread</option>
                    <option value="reading">Reading</option>
                    <option value="read">Read</option>
                  </select>
                </div>;
              })}
            </div>}
    </div>
  </section>;
}
