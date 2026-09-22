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
import type { CitationFormat } from '../../services/library/citations';
import type { PaperInfo, PaperNote, ReadStatus } from '../../types';
import type { LibraryInspectorTab } from '../../store/useLibraryStore';
import { NoteEditor } from './NoteEditor';

interface PaperInspectorProps {
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
  abstract: string;
  readStatus: ReadStatus;
}

function draftFor(paper?: PaperInfo): MetadataDraft {
  return {
    title: paper?.title || '',
    authors: paper?.authors || '',
    year: paper?.year || '',
    journal: paper?.journal || '',
    doi: paper?.doi || '',
    abstract: paper?.abstract || '',
    readStatus: paper?.readStatus || 'unread',
  };
}

export function PaperInspector(props: PaperInspectorProps) {
  const [draft, setDraft] = useState<MetadataDraft>(() => draftFor(props.paper));
  const [tagName, setTagName] = useState('');
  const [copied, setCopied] = useState<CitationFormat | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => setDraft(draftFor(props.paper)), [props.paper]);
  if (!props.paper) return <aside className="paper-inspector inspector-empty" data-mobile-open="false"><FileText /><span>Select a paper to inspect it.</span></aside>;

  const paper = props.paper;
  const collectionIds = props.snapshot.paperCollections.get(paper.id) || [];
  const tagIds = props.snapshot.paperTags.get(paper.id) || [];
  const collections = props.snapshot.collections.filter((item) => collectionIds.includes(item.id));
  const tags = props.snapshot.tags.filter((item) => tagIds.includes(item.id));
  const notes = props.snapshot.notes.filter((note) => note.paperId === paper.id);
  const documents = props.snapshot.documents.filter((document) => document.paperId === paper.id);
  const annotations = props.snapshot.annotations.filter((annotation) => annotation.paperId === paper.id);
  const memory = props.snapshot.memories.find((item) => item.paperId === paper.id);
  const copy = async (format: CitationFormat) => {
    await props.onCopyCitation(format);
    setCopied(format);
    window.setTimeout(() => setCopied(null), 1200);
  };
  return <aside className="paper-inspector" data-mobile-open={props.mobileOpen}>
    <div className="inspector-tabs" role="tablist">
      <button role="tab" data-active={props.tab === 'details'} onClick={() => props.onTabChange('details')}>Details</button>
      <button role="tab" data-active={props.tab === 'notes'} onClick={() => props.onTabChange('notes')}>Notes <span>{notes.length}</span></button>
      <button className="inspector-mobile-close" title="Close inspector" onClick={props.onClose}><X /></button>
    </div>
    {props.tab === 'notes'
      ? <NoteEditor notes={notes} onSave={props.onSaveNote} onDelete={props.onDeleteNote} />
      : <div className="inspector-scroll">
          <section className="inspector-title">
            <h2>{paper.title}</h2>
            {paper.url && <button title="Open source" onClick={() => window.open(paper.url, '_blank', 'noopener')}><ExternalLink /></button>}
          </section>
          <section className="inspector-section metadata-form">
            <div className="inspector-section-title"><span>Metadata</span><div>
              <button className="icon-text-button" disabled={refreshing} onClick={() => {
                setRefreshing(true);
                void props.onRefreshMetadata().finally(() => setRefreshing(false));
              }}><RefreshCw className={refreshing ? 'spin' : undefined} /> Refresh</button>
              <button className="icon-text-button" onClick={() => void props.onUpdate(draft)}><Save /> Save</button>
            </div></div>
            <label><span>Title</span><textarea value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
            <label><span>Authors</span><input value={draft.authors} onChange={(event) => setDraft({ ...draft, authors: event.target.value })} /></label>
            <div className="metadata-pair">
              <label><span>Year</span><input value={draft.year} onChange={(event) => setDraft({ ...draft, year: event.target.value })} /></label>
              <label><span>Status</span><select value={draft.readStatus} onChange={(event) => setDraft({ ...draft, readStatus: event.target.value as ReadStatus })}><option value="unread">Unread</option><option value="reading">Reading</option><option value="read">Read</option></select></label>
            </div>
            <label><span>Publication</span><input value={draft.journal} onChange={(event) => setDraft({ ...draft, journal: event.target.value })} /></label>
            <label><span>DOI</span><input value={draft.doi} onChange={(event) => setDraft({ ...draft, doi: event.target.value })} /></label>
            <label><span>Abstract</span><textarea className="abstract-field" value={draft.abstract} onChange={(event) => setDraft({ ...draft, abstract: event.target.value })} /></label>
          </section>
          <section className="inspector-section">
            <div className="inspector-section-title"><span>Collections</span><Plus /></div>
            <div className="relation-chips">{collections.map((collection) => <span key={collection.id}>{collection.name}<button title="Remove from collection" onClick={() => void props.onRemoveCollection(collection.id)}><X /></button></span>)}</div>
            <select aria-label="Add to collection" value="" onChange={(event) => event.target.value && void props.onAddCollection(event.target.value)}>
              <option value="">Add to collection…</option>
              {props.snapshot.collections.filter((item) => !collectionIds.includes(item.id)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </section>
          <section className="inspector-section">
            <div className="inspector-section-title"><span>Tags</span><TagIcon /></div>
            <div className="relation-chips">{tags.map((tag) => <span key={tag.id}><i style={{ backgroundColor: tag.color || '#8a8f94' }} />{tag.name}<button title="Remove tag" onClick={() => void props.onRemoveTag(tag.id)}><X /></button></span>)}</div>
            <div className="inline-add"><input value={tagName} list="paperflow-tags" placeholder="Add tag…" onChange={(event) => setTagName(event.target.value)} onKeyDown={(event) => {
              if (event.key === 'Enter' && tagName.trim()) {
                void props.onAddTag(tagName).then(() => setTagName(''));
              }
            }} /><button title="Add tag" disabled={!tagName.trim()} onClick={() => void props.onAddTag(tagName).then(() => setTagName(''))}><Plus /></button></div>
            <datalist id="paperflow-tags">{props.snapshot.tags.map((tag) => <option value={tag.name} key={tag.id} />)}</datalist>
          </section>
          <section className="inspector-section">
            <div className="inspector-section-title"><span>Research data</span></div>
            <dl className="research-summary">
              <div><dt>PDF versions</dt><dd>{documents.length}</dd></div>
              <div><dt>Annotations</dt><dd>{annotations.length}</dd></div>
              <div><dt>AI memory</dt><dd>{memory?.content ? 'Available' : 'Empty'}</dd></div>
            </dl>
          </section>
          <section className="inspector-section">
            <div className="inspector-section-title"><span>Copy citation</span><Copy /></div>
            <div className="citation-buttons">{(['apa', 'mla', 'chicago', 'ieee', 'bibtex'] as CitationFormat[]).map((format) => <button key={format} onClick={() => void copy(format)}>{copied === format ? <Check /> : null}{format === 'bibtex' ? 'BibTeX' : format.toUpperCase()}</button>)}</div>
          </section>
          <section className="inspector-section">
            <button className="ai-organize-button" onClick={props.onAiOrganize}><Bot /><span><strong>AI organize</strong><small>Review collection and tag suggestions before applying.</small></span></button>
          </section>
        </div>}
  </aside>;
}
