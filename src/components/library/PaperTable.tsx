import { ChevronDown, ChevronUp, FileText, Star } from 'lucide-react';
import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { text } from '../../i18n';
import type { Language, PaperInfo, ReadStatus } from '../../types';
import type { LibrarySortKey } from '../../store/useLibraryStore';

interface PaperTableProps {
  language: Language;
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
  return <section className="paper-table-region" aria-label={text(props.language, 'Papers', '论文')}>
    <div className="paper-table-header library-paper-grid">
      <label><input type="checkbox" aria-label={text(props.language, 'Select all visible papers', '选择当前全部论文')} checked={allSelected} onChange={() => props.onSelectAll(allSelected ? [] : props.papers.map((paper) => paper.id))} /></label>
      <span />
      <SortHeader label={text(props.language, 'Title', '标题')} value="title" active={props.sortKey === 'title'} direction={props.sortDirection} onSort={props.onSort} />
      <SortHeader label={text(props.language, 'Authors', '作者')} value="authors" active={props.sortKey === 'authors'} direction={props.sortDirection} onSort={props.onSort} />
      <SortHeader label={text(props.language, 'Year', '年份')} value="year" active={props.sortKey === 'year'} direction={props.sortDirection} onSort={props.onSort} />
      <SortHeader label={text(props.language, 'Source', '来源')} value="source" active={props.sortKey === 'source'} direction={props.sortDirection} onSort={props.onSort} />
      <SortHeader label={text(props.language, 'Status', '状态')} value="readStatus" active={props.sortKey === 'readStatus'} direction={props.sortDirection} onSort={props.onSort} />
    </div>
    <div className="paper-table-scroll" ref={scrollRef}>
      {props.loading
        ? <div className="library-table-state">{text(props.language, 'Loading library…', '正在加载资料库…')}</div>
        : !props.papers.length
          ? <div className="library-table-state"><FileText /><strong>{text(props.language, 'No papers in this view', '此视图中没有论文')}</strong><span>{text(props.language, 'Import references or save a paper from the Reader.', '请导入文献，或从 Reader 保存论文。')}</span></div>
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
                  <label onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={text(props.language, `Select ${paper.title}`, `选择 ${paper.title}`)} checked={selected} onChange={() => props.onSelect(paper.id, true)} /></label>
                  <button className="paper-star" title={paper.favorite ? text(props.language, 'Remove star', '取消星标') : text(props.language, 'Add star', '添加星标')} aria-label={paper.favorite ? text(props.language, 'Remove star', '取消星标') : text(props.language, 'Add star', '添加星标')} data-active={paper.favorite} onClick={(event) => {
                    event.stopPropagation();
                    void props.onFavorite(paper);
                  }}><Star /></button>
                  <div className="paper-title-cell"><strong title={paper.title}>{paper.title}</strong><small>{paper.doi || paper.arxivId || paper.openReviewId || ''}</small></div>
                  <span title={paper.authors}>{paper.authors || text(props.language, 'Unknown author', '未知作者')}</span>
                  <span>{paper.year || '—'}</span>
                  <span title={paper.journal || paper.source}>{paper.journal || paper.source || '—'}</span>
                  <select aria-label={text(props.language, `Reading status for ${paper.title}`, `${paper.title} 的阅读状态`)} value={paper.readStatus || 'unread'} onClick={(event) => event.stopPropagation()} onChange={(event) => void props.onReadStatus(paper, event.target.value as ReadStatus)}>
                    <option value="unread">{text(props.language, 'Unread', '未读')}</option>
                    <option value="reading">{text(props.language, 'Reading', '阅读中')}</option>
                    <option value="read">{text(props.language, 'Read', '已读')}</option>
                  </select>
                </div>;
              })}
            </div>}
    </div>
  </section>;
}
