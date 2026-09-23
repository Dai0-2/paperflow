import {
  Bot,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Plus,
  RefreshCw,
  Save,
  Tag as TagIcon,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { LibrarySnapshot } from '../../hooks/useLibraryQuery';
import { text } from '../../i18n';
import type { CitationFormat } from '../../services/library/citations';
import type { Language, PaperInfo } from '../../types';
import type { LibraryInspectorTab } from '../../store/useLibraryStore';
import { NoteEditor } from './NoteEditor';

interface PaperInspectorProps {
  language: Language;
  paper?: PaperInfo;
  snapshot: LibrarySnapshot;
  tab: LibraryInspectorTab;
  onTabChange: (tab: LibraryInspectorTab) => void;
  onUpdate: (patch: Partial<PaperInfo>) => Promise<void>;
  onAddTag: (name: string) => Promise<void>;
  onRemoveTag: (tagId: string) => Promise<void>;
  onAddCollection: (collectionId: string) => Promise<void>;
  onRemoveCollection: (collectionId: string) => Promise<void>;
  onSaveNote: (input: { id?: string; title: string; content: string }) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  onCopyCitation: (format: CitationFormat) => Promise<void>;
  onAiOrganize: () => void;
  onClose: () => void;
  mobileOpen: boolean;
  onRefreshMetadata: () => Promise<void>;
}

interface MetadataDraft {
  title: string;
  authors: string;
  year: string;
  journal: string;
  doi: string;
  arxivId: string;
  openReviewId: string;
  abstract: string;
}

function draftFor(paper?: PaperInfo): MetadataDraft {
  return {
    title: paper?.title || '',
    authors: paper?.authors || '',
    year: paper?.year || '',
    journal: paper?.journal || '',
    doi: paper?.doi || '',
    arxivId: paper?.arxivId || '',
    openReviewId: paper?.openReviewId || '',
    abstract: paper?.abstract || '',
  };
}

export function PaperInspector(props: PaperInspectorProps) {
  const [draft, setDraft] = useState<MetadataDraft>(() => draftFor(props.paper));
  const [tagName, setTagName] = useState('');
  const [copied, setCopied] = useState<CitationFormat | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setDraft(draftFor(props.paper));
    setSaved(false);
  }, [props.paper]);
  if (!props.paper) return <aside className="paper-inspector inspector-empty" data-mobile-open="false"><FileText /><span>{text(props.language, 'Select a paper to inspect it.', '选择一篇论文以查看详情。')}</span></aside>;

  const paper = props.paper;
  const collectionIds = props.snapshot.paperCollections.get(paper.id) || [];
  const tagIds = props.snapshot.paperTags.get(paper.id) || [];
  const collections = props.snapshot.collections.filter((item) => collectionIds.includes(item.id));
  const tags = props.snapshot.tags.filter((item) => tagIds.includes(item.id));
  const notes = props.snapshot.notes.filter((note) => note.paperId === paper.id);
  const documents = props.snapshot.documents.filter((document) => document.paperId === paper.id);
  const annotations = props.snapshot.annotations.filter((annotation) => annotation.paperId === paper.id);
  const memory = props.snapshot.memories.find((item) => item.paperId === paper.id);
  const metadataFields = [
    draft.title,
    draft.authors,
    draft.year,
    draft.journal,
    draft.abstract,
    draft.doi || draft.arxivId || draft.openReviewId,
  ];
  const metadataCompleteness = Math.round(
    metadataFields.filter((value) => value.trim()).length / metadataFields.length * 100,
  );
  const saveMetadata = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await props.onUpdate(draft);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1600);
    } finally {
      setSaving(false);
    }
  };
  const copy = async (format: CitationFormat) => {
    await props.onCopyCitation(format);
    setCopied(format);
    window.setTimeout(() => setCopied(null), 1200);
  };
  return <aside className="paper-inspector" data-mobile-open={props.mobileOpen}>
    <div className="inspector-tabs" role="tablist">
      <button role="tab" data-active={props.tab === 'details'} onClick={() => props.onTabChange('details')}>{text(props.language, 'Details', '详情')}</button>
      <button role="tab" data-active={props.tab === 'notes'} onClick={() => props.onTabChange('notes')}>{text(props.language, 'Notes', '笔记')} <span>{notes.length}</span></button>
      <button className="inspector-mobile-close" title={text(props.language, 'Close inspector', '关闭详情')} onClick={props.onClose}><X /></button>
    </div>
    {props.tab === 'notes'
      ? <NoteEditor language={props.language} notes={notes} onSave={props.onSaveNote} onDelete={props.onDeleteNote} />
      : <div className="inspector-scroll">
          <section className="inspector-title">
            <h2>{paper.title}</h2>
            {paper.url && <button title={text(props.language, 'Open source', '打开来源')} onClick={() => window.open(paper.url, '_blank', 'noopener')}><ExternalLink /></button>}
          </section>
          <section className="inspector-section metadata-form">
            <div className="inspector-section-title"><span>{text(props.language, 'Metadata', '元数据')}</span><div>
              <button className="icon-text-button" disabled={refreshing} onClick={() => {
                setRefreshing(true);
                void props.onRefreshMetadata().finally(() => setRefreshing(false));
              }}><RefreshCw className={refreshing ? 'spin' : undefined} /> {text(props.language, 'Refresh', '刷新')}</button>
              <button className="icon-text-button" disabled={saving} onClick={() => void saveMetadata()}>{saved ? <Check /> : <Save />} {saved ? text(props.language, 'Saved', '已保存') : text(props.language, 'Save', '保存')}</button>
            </div></div>
            <div className="metadata-health">
              <span>{text(props.language, 'Completeness', '完整度')} {metadataCompleteness}%</span>
              <span>{paper.metadataSource === 'manual'
                ? text(props.language, 'Manually edited', '手动编辑')
                : text(props.language, 'Automatically identified', '自动识别')}</span>
            </div>
            <label><span>{text(props.language, 'Title', '标题')}</span><textarea value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
            <label><span>{text(props.language, 'Authors', '作者')}</span><input value={draft.authors} onChange={(event) => setDraft({ ...draft, authors: event.target.value })} /></label>
            <label><span>{text(props.language, 'Year', '年份')}</span><input value={draft.year} onChange={(event) => setDraft({ ...draft, year: event.target.value })} /></label>
            <label><span>{text(props.language, 'Publication', '出版物')}</span><input value={draft.journal} onChange={(event) => setDraft({ ...draft, journal: event.target.value })} /></label>
            <label><span>DOI</span><input value={draft.doi} onChange={(event) => setDraft({ ...draft, doi: event.target.value })} /></label>
            <label><span>arXiv ID</span><input value={draft.arxivId} onChange={(event) => setDraft({ ...draft, arxivId: event.target.value })} /></label>
            <label><span>OpenReview ID</span><input value={draft.openReviewId} onChange={(event) => setDraft({ ...draft, openReviewId: event.target.value })} /></label>
            <label><span>{text(props.language, 'Abstract', '摘要')}</span><textarea className="abstract-field" value={draft.abstract} onChange={(event) => setDraft({ ...draft, abstract: event.target.value })} /></label>
          </section>
          <section className="inspector-section">
            <div className="inspector-section-title"><span>{text(props.language, 'Collections', '集合')}</span><Plus /></div>
            <div className="relation-chips">{collections.map((collection) => <span key={collection.id}>{collection.name}<button title={text(props.language, 'Remove from collection', '从集合中移除')} onClick={() => void props.onRemoveCollection(collection.id)}><X /></button></span>)}</div>
            <select aria-label={text(props.language, 'Add to collection', '添加到集合')} value="" onChange={(event) => event.target.value && void props.onAddCollection(event.target.value)}>
              <option value="">{text(props.language, 'Add to collection…', '添加到集合…')}</option>
              {props.snapshot.collections.filter((item) => !collectionIds.includes(item.id)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </section>
          <section className="inspector-section">
            <div className="inspector-section-title"><span>{text(props.language, 'Tags', '标签')}</span><TagIcon /></div>
            <div className="relation-chips">{tags.map((tag) => <span key={tag.id}><i style={{ backgroundColor: tag.color || '#8a8f94' }} />{tag.name}<button title={text(props.language, 'Remove tag', '移除标签')} onClick={() => void props.onRemoveTag(tag.id)}><X /></button></span>)}</div>
            <div className="inline-add"><input value={tagName} list="paperflow-tags" placeholder={text(props.language, 'Add tag…', '添加标签…')} onChange={(event) => setTagName(event.target.value)} onKeyDown={(event) => {
              if (event.key === 'Enter' && tagName.trim()) {
                void props.onAddTag(tagName).then(() => setTagName(''));
              }
            }} /><button title={text(props.language, 'Add tag', '添加标签')} disabled={!tagName.trim()} onClick={() => void props.onAddTag(tagName).then(() => setTagName(''))}><Plus /></button></div>
            <datalist id="paperflow-tags">{props.snapshot.tags.map((tag) => <option value={tag.name} key={tag.id} />)}</datalist>
          </section>
          <section className="inspector-section">
            <div className="inspector-section-title"><span>{text(props.language, 'Research data', '研究数据')}</span></div>
            <dl className="research-summary">
              <div><dt>{text(props.language, 'PDF versions', 'PDF 版本')}</dt><dd>{documents.length}</dd></div>
              <div><dt>{text(props.language, 'Annotations', '批注')}</dt><dd>{annotations.length}</dd></div>
              <div><dt>{text(props.language, 'AI memory', 'AI 记忆')}</dt><dd>{memory?.content ? text(props.language, 'Available', '已有内容') : text(props.language, 'Empty', '空')}</dd></div>
            </dl>
          </section>
          <section className="inspector-section">
            <div className="inspector-section-title"><span>{text(props.language, 'Copy citation', '复制引用')}</span><Copy /></div>
            <div className="citation-buttons">{(['apa', 'mla', 'chicago', 'ieee', 'bibtex'] as CitationFormat[]).map((format) => <button key={format} onClick={() => void copy(format)}>{copied === format ? <Check /> : null}{format === 'bibtex' ? 'BibTeX' : format.toUpperCase()}</button>)}</div>
          </section>
          <section className="inspector-section">
            <button className="ai-organize-button" onClick={props.onAiOrganize}><Bot /><span><strong>{text(props.language, 'AI organize', 'AI 整理')}</strong><small>{text(props.language, 'Review collection and tag suggestions before applying.', '应用前检查集合和标签建议。')}</small></span></button>
          </section>
        </div>}
  </aside>;
}
