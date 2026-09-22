import {
  ArchiveRestore,
  BookOpen,
  Copy,
  Database,
  FileDown,
  FolderInput,
  Library,
  Menu,
  Moon,
  LoaderCircle,
  Search,
  Star,
  Sun,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { BrandMark } from '../common/BrandMark';
import { useLibraryQuery } from '../../hooks/useLibraryQuery';
import { useLibraryStore } from '../../store/useLibraryStore';
import {
  addPaperToCollection,
  addTagToPaper,
  createCollection,
  createOrGetTag,
  deleteCollection,
  deleteNote,
  mergeTags,
  movePaperToTrash,
  removePaperFromCollection,
  removeTagFromPaper,
  restorePaper,
  saveNote,
  setPaperReadStatus,
  updateCollection,
  updatePaperMetadata,
  updateTag,
} from '../../repositories/libraryRepository';
import { mergeDuplicatePapers } from '../../services/library/duplicateMerge';
import { refreshPaperMetadata } from '../../services/library/metadata';
import type { CitationFormat } from '../../services/library/citations';
import type { AiOrganizeProposal } from '../../services/library/aiOrganize';
import type { PaperInfo, ReadStatus, Theme } from '../../types';
import { AiOrganizeReview } from './AiOrganizeReview';
import { DuplicateReview } from './DuplicateReview';
import { LibrarySidebar, collectionLabel } from './LibrarySidebar';
import { PaperInspector } from './PaperInspector';
import { PaperTable } from './PaperTable';
import { TagManagerDialog } from './TagManagerDialog';

const ImportExportDialog = lazy(async () => {
  const module = await import('./ImportExportDialog');
  return { default: module.ImportExportDialog };
});

function readerUrl(paper: PaperInfo): string {
  const parameters = new URLSearchParams({ paperId: paper.id });
  if (paper.url) parameters.set('url', paper.url);
  parameters.set('title', paper.title);
  return typeof chrome !== 'undefined' && chrome.runtime?.getURL
    ? chrome.runtime.getURL(`reader.html?${parameters}`)
    : `/reader.html?${parameters}`;
}

function currentTheme(): Theme {
  return (localStorage.getItem('paperflow:theme') as Theme) || 'system';
}

export function LibraryApp() {
  const store = useLibraryStore();
  const {
    snapshot,
    papers,
    loading,
    error: loadError,
    indexStatus,
    rebuildIndex,
    cancelIndexRebuild,
  } = useLibraryQuery();
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 850);
  const [dialog, setDialog] = useState<'import' | 'duplicates' | 'ai' | 'tags' | null>(null);
  const [bulkTag, setBulkTag] = useState('');
  const [bulkCollection, setBulkCollection] = useState('');
  const [error, setError] = useState('');
  const selected = useMemo(
    () => snapshot.papers.filter((paper) => store.selectedPaperIds.includes(paper.id)),
    [snapshot.papers, store.selectedPaperIds],
  );
  const activePaper = snapshot.papers.find((paper) => paper.id === store.activePaperId)
    || selected.at(-1)
    || papers[0];
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);

  const mutate = async (action: () => Promise<void>) => {
    try {
      setError('');
      await action();
      store.requestRefresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The library change could not be saved.');
    }
  };
  const updateActive = async (patch: Partial<PaperInfo>) => {
    if (!activePaper) return;
    await mutate(async () => {
      await updatePaperMetadata(activePaper.id, patch);
    });
  };
  const selectedOrActive = selected.length ? selected : activePaper ? [activePaper] : [];
  const applyToSelected = async (action: (paper: PaperInfo) => Promise<void>) => {
    await mutate(async () => {
      for (const paper of selectedOrActive) await action(paper);
    });
  };
  const setThemeValue = (value: Theme) => {
    localStorage.setItem('paperflow:theme', value);
    setTheme(value);
  };
  const addTag = async (paperIds: string[], name: string) => {
    const tag = await createOrGetTag(name);
    for (const paperId of paperIds) await addTagToPaper(paperId, tag.id);
  };
  const applyAiProposal = async (proposal: AiOrganizeProposal) => {
    if (!activePaper) return;
    await mutate(async () => {
      for (const collectionId of proposal.existingCollectionIds) await addPaperToCollection(activePaper.id, collectionId);
      if (proposal.suggestedCollection) {
        const collection = await createCollection(proposal.suggestedCollection);
        await addPaperToCollection(activePaper.id, collection.id);
      }
      for (const tag of proposal.suggestedTags) await addTag([activePaper.id], tag);
    });
  };

  return <div className="library-shell">
    <header className="library-header">
      <div className="library-brand-area">
        <button className="library-menu-button" title="Toggle navigation" onClick={() => setSidebarOpen((open) => !open)}><Menu /></button>
        <div className="library-brand"><BrandMark /><strong>PaperFlow</strong><span>Library</span></div>
      </div>
      <label className="library-search"><Search /><input value={store.searchQuery} onChange={(event) => store.setSearchQuery(event.target.value)} placeholder="Search papers, author:, tag:, collection:, year:, status:" aria-label="Search library" />{store.searchQuery && <button title="Clear search" onClick={() => store.setSearchQuery('')}><X /></button>}</label>
      <div className="library-header-actions">
        <button title={dark ? 'Use light theme' : 'Use dark theme'} onClick={() => setThemeValue(dark ? 'light' : 'dark')}>{dark ? <Sun /> : <Moon />}</button>
        <button
          title={indexStatus.state === 'building'
            ? `Cancel search indexing (${indexStatus.completed}/${indexStatus.total})`
            : indexStatus.state === 'error'
              ? `Rebuild search index: ${indexStatus.error}`
              : 'Rebuild search index'}
          data-active={indexStatus.state === 'building'}
          onClick={() => indexStatus.state === 'building' ? cancelIndexRebuild() : void rebuildIndex()}
        >{indexStatus.state === 'building' ? <LoaderCircle className="spin" /> : <Database />}</button>
        <button className="header-command" onClick={() => setDialog('import')}><FileDown /><span>Import / Export</span></button>
      </div>
    </header>
    {(error || loadError) && <div className="library-error">{error || loadError}<button title="Dismiss error" onClick={() => setError('')}><X /></button></div>}
    <div className="library-workspace" data-sidebar={sidebarOpen}>
      {sidebarOpen && <LibrarySidebar
        snapshot={snapshot}
        scope={store.scope}
        onScopeChange={store.setScope}
        onCreateCollection={async (name, parentId) => mutate(async () => { await createCollection(name, parentId); })}
        onUpdateCollection={async (id, name, parentId) => mutate(async () => { await updateCollection(id, { name, parentId }); })}
        onDeleteCollection={async (id) => {
          if (!window.confirm(`Delete “${collectionLabel(snapshot.collections, id)}”? Papers will stay in the library.`)) return;
          await mutate(async () => { await deleteCollection(id); });
        }}
        onManageTags={() => setDialog('tags')}
      />}
      <main className="library-main">
        <div className="library-view-bar">
          <div><h1>{store.scope.startsWith('collection:') ? collectionLabel(snapshot.collections, store.scope.slice(11)) : store.scope === 'all' ? 'All papers' : store.scope.replace(/^status:/, '').replace(/^\w/, (value) => value.toUpperCase())}</h1><span>{papers.length} items</span></div>
          {store.scope === 'duplicates' && <button className="secondary-command" onClick={() => setDialog('duplicates')}><Copy /> Review duplicates</button>}
        </div>
        {selected.length > 0 && <div className="bulk-toolbar">
          <span>{selected.length} selected</span>
          <button title="Toggle star" onClick={() => void applyToSelected((paper) => updatePaperMetadata(paper.id, { favorite: !paper.favorite }).then(() => undefined))}><Star /> Star</button>
          <select value="" aria-label="Set reading status" onChange={(event) => event.target.value && void applyToSelected((paper) => setPaperReadStatus(paper.id, event.target.value as ReadStatus).then(() => undefined))}>
            <option value="">Reading status…</option><option value="unread">Unread</option><option value="reading">Reading</option><option value="read">Read</option>
          </select>
          <select value={bulkCollection} aria-label="Add selected papers to collection" onChange={(event) => {
            const value = event.target.value;
            setBulkCollection('');
            if (value) void applyToSelected((paper) => addPaperToCollection(paper.id, value));
          }}>
            <option value="">Add to collection…</option>{snapshot.collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
          </select>
          <div className="bulk-tag"><Tags /><input value={bulkTag} placeholder="Add tag" onChange={(event) => setBulkTag(event.target.value)} onKeyDown={(event) => {
            if (event.key === 'Enter' && bulkTag.trim()) void mutate(async () => {
              await addTag(selectedOrActive.map((paper) => paper.id), bulkTag);
              setBulkTag('');
            });
          }} /></div>
          {store.scope === 'trash'
            ? <button onClick={() => void applyToSelected((paper) => restorePaper(paper.id))}><ArchiveRestore /> Restore</button>
            : <button className="danger-command" onClick={() => void applyToSelected((paper) => movePaperToTrash(paper.id))}><Trash2 /> Trash</button>}
          <button className="clear-selection" title="Clear selection" onClick={store.clearSelection}><X /></button>
        </div>}
        <PaperTable
          papers={papers}
          loading={loading}
          selectedIds={store.selectedPaperIds}
          activeId={activePaper?.id || null}
          sortKey={store.sortKey}
          sortDirection={store.sortDirection}
          onSort={store.setSort}
          onSelect={store.togglePaperSelection}
          onSelectAll={store.selectPapers}
          onOpen={(paper) => window.open(readerUrl(paper), '_blank', 'noopener')}
          onFavorite={async (paper) => mutate(async () => { await updatePaperMetadata(paper.id, { favorite: !paper.favorite }); })}
          onReadStatus={async (paper, status) => mutate(async () => { await setPaperReadStatus(paper.id, status); })}
        />
      </main>
      <PaperInspector
        paper={activePaper}
        mobileOpen={Boolean(store.activePaperId)}
        snapshot={snapshot}
        tab={store.inspectorTab}
        onTabChange={store.setInspectorTab}
        onUpdate={updateActive}
        onAddTag={async (name) => mutate(async () => { if (activePaper) await addTag([activePaper.id], name); })}
        onRemoveTag={async (tagId) => mutate(async () => { if (activePaper) await removeTagFromPaper(activePaper.id, tagId); })}
        onAddCollection={async (collectionId) => mutate(async () => { if (activePaper) await addPaperToCollection(activePaper.id, collectionId); })}
        onRemoveCollection={async (collectionId) => mutate(async () => { if (activePaper) await removePaperFromCollection(activePaper.id, collectionId); })}
        onSaveNote={async (input) => mutate(async () => { if (activePaper) await saveNote(activePaper.id, input); })}
        onDeleteNote={async (noteId) => mutate(async () => { await deleteNote(noteId); })}
        onCopyCitation={async (format: CitationFormat) => {
          if (activePaper) {
            const { formatCitation } = await import('../../services/library/citations');
            await navigator.clipboard.writeText(formatCitation(activePaper, format));
          }
        }}
        onAiOrganize={() => setDialog('ai')}
        onClose={() => store.setActivePaper(null)}
        onRefreshMetadata={async () => {
          if (!activePaper) return;
          await mutate(async () => {
            const patch = await refreshPaperMetadata(activePaper);
            await updatePaperMetadata(activePaper.id, patch);
          });
        }}
      />
    </div>
    {dialog === 'import' && <Suspense fallback={<div className="dialog-backdrop"><div className="dialog-loading">Loading reference tools…</div></div>}><ImportExportDialog papers={snapshot.papers.filter((paper) => paper.libraryState === 'saved')} exportPapers={selected.length ? selected : papers} onClose={() => setDialog(null)} onImported={store.requestRefresh} /></Suspense>}
    {dialog === 'duplicates' && <DuplicateReview papers={snapshot.papers.filter((paper) => paper.libraryState === 'saved')} onClose={() => setDialog(null)} onMerge={async (canonicalId, duplicateId) => mutate(async () => { await mergeDuplicatePapers(canonicalId, duplicateId); })} />}
    {dialog === 'tags' && <TagManagerDialog tags={snapshot.tags} onClose={() => setDialog(null)} onUpdate={async (tagId, patch) => mutate(async () => { await updateTag(tagId, patch); })} onMerge={async (sourceId, targetId) => mutate(async () => { await mergeTags(sourceId, targetId); })} />}
    {dialog === 'ai' && activePaper && <AiOrganizeReview paper={activePaper} snapshot={snapshot} onClose={() => setDialog(null)} onApply={applyAiProposal} />}
  </div>;
}
