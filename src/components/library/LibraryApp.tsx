import {
  ArchiveRestore,
  Cloud,
  Copy,
  Database,
  FileDown,
  FolderInput,
  Library,
  Menu,
  Moon,
  LoaderCircle,
  Search,
  Settings2,
  Star,
  Sun,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { BrandMark } from '../common/BrandMark';
import { useAppearance } from '../../hooks/useAppearance';
import { useLibraryQuery } from '../../hooks/useLibraryQuery';
import { text } from '../../i18n';
import { useAppStore } from '../../store/useAppStore';
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
  updateCollection,
  updatePaperMetadata,
  updateTag,
} from '../../repositories/libraryRepository';
import { mergeDuplicatePapers } from '../../services/library/duplicateMerge';
import { refreshPaperMetadata } from '../../services/library/metadata';
import type { CitationFormat } from '../../services/library/citations';
import type { AiOrganizeProposal } from '../../services/library/aiOrganize';
import type { PaperInfo } from '../../types';
import { AiOrganizeReview } from './AiOrganizeReview';
import { DuplicateReview } from './DuplicateReview';
import { LibrarySidebar, collectionLabel } from './LibrarySidebar';
import { LibrarySettingsDialog } from './LibrarySettingsDialog';
import { PaperInspector } from './PaperInspector';
import { PaperTable } from './PaperTable';
import { TagManagerDialog } from './TagManagerDialog';
import { SyncStatus } from '../sync/SyncStatus';
import { VaultSetup } from '../sync/VaultSetup';

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

export function LibraryApp() {
  const store = useLibraryStore();
  const language = useAppStore((state) => state.uiLanguage);
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const { dark } = useAppearance();
  const {
    snapshot,
    papers,
    loading,
    error: loadError,
    indexStatus,
    rebuildIndex,
    cancelIndexRebuild,
  } = useLibraryQuery();
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 850);
  const [dialog, setDialog] = useState<
    'import' | 'duplicates' | 'ai' | 'tags' | 'cloud' | 'settings' | null
  >(null);
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
  const mutate = async (action: () => Promise<void>) => {
    try {
      setError('');
      await action();
      store.requestRefresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text(language, 'The library change could not be saved.', '无法保存资料库更改。'));
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
  const closeSidebarOnNarrowScreen = () => {
    if (window.innerWidth <= 850) setSidebarOpen(false);
  };
  const changeScope = (scope: Parameters<typeof store.setScope>[0]) => {
    store.setScope(scope);
    closeSidebarOnNarrowScreen();
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
        <button className="library-menu-button" title={text(language, 'Toggle navigation', '切换导航栏')} onClick={() => setSidebarOpen((open) => !open)}><Menu /></button>
        <div className="library-brand"><BrandMark /><strong>PaperFlow</strong><span>{text(language, 'Library', '资料库')}</span></div>
      </div>
      <label className="library-search"><Search /><input value={store.searchQuery} onChange={(event) => store.setSearchQuery(event.target.value)} placeholder={text(language, 'Search papers, author:, tag:, collection:, year:', '搜索论文，支持 author:、tag:、collection:、year:')} aria-label={text(language, 'Search library', '搜索资料库')} />{store.searchQuery && <button title={text(language, 'Clear search', '清除搜索')} onClick={() => store.setSearchQuery('')}><X /></button>}</label>
      <div className="library-header-actions">
        <SyncStatus
          language={language}
          compact
          onNeedsAttention={() => setDialog('cloud')}
        />
        <button
          className="header-command"
          title={text(language, 'Google cloud library', 'Google 云端资料库')}
          onClick={() => setDialog('cloud')}
        ><Cloud /><span>{text(language, 'Google cloud library', 'Google 云端资料库')}</span></button>
        <button
          className="header-command"
          title={text(language, 'Settings', '设置')}
          onClick={() => setDialog('settings')}
        ><Settings2 /><span>{text(language, 'Settings', '设置')}</span></button>
        <button title={dark ? text(language, 'Use white theme', '使用白色主题') : text(language, 'Use dark theme', '使用深色主题')} onClick={() => setTheme(dark ? 'zotero' : 'dark')}>{dark ? <Sun /> : <Moon />}</button>
        <button
          title={indexStatus.state === 'building'
            ? text(language, `Cancel search indexing (${indexStatus.completed}/${indexStatus.total})`, `取消搜索索引（${indexStatus.completed}/${indexStatus.total}）`)
            : indexStatus.state === 'error'
              ? text(language, `Rebuild search index: ${indexStatus.error}`, `重建搜索索引：${indexStatus.error}`)
              : text(language, 'Rebuild search index', '重建搜索索引')}
          data-active={indexStatus.state === 'building'}
          onClick={() => indexStatus.state === 'building' ? cancelIndexRebuild() : void rebuildIndex()}
        >{indexStatus.state === 'building' ? <LoaderCircle className="spin" /> : <Database />}</button>
        <button
          className="header-command"
          title={text(language, 'Import / Export', '导入 / 导出')}
          onClick={() => setDialog('import')}
        ><FileDown /><span>{text(language, 'Import / Export', '导入 / 导出')}</span></button>
      </div>
    </header>
    {(error || loadError) && <div className="library-error">{error || loadError}<button title={text(language, 'Dismiss error', '关闭错误')} onClick={() => setError('')}><X /></button></div>}
    <div className="library-workspace" data-sidebar={sidebarOpen}>
      {sidebarOpen && <button
        type="button"
        className="library-sidebar-backdrop"
        aria-label={text(language, 'Close navigation', '关闭导航栏')}
        onClick={() => setSidebarOpen(false)}
      />}
      {sidebarOpen && <LibrarySidebar
        language={language}
        snapshot={snapshot}
        scope={store.scope}
        onScopeChange={changeScope}
        onCreateCollection={async (name, parentId) => mutate(async () => { await createCollection(name, parentId); })}
        onUpdateCollection={async (id, name, parentId) => mutate(async () => { await updateCollection(id, { name, parentId }); })}
        onDeleteCollection={async (id) => {
          if (!window.confirm(text(language, `Delete “${collectionLabel(snapshot.collections, id)}”? Papers will stay in the library.`, `删除“${collectionLabel(snapshot.collections, id)}”？论文仍会保留在资料库中。`))) return;
          await mutate(async () => { await deleteCollection(id); });
        }}
        onDropPapers={async (collectionId, paperIds) => mutate(async () => {
          for (const paperId of paperIds) await addPaperToCollection(paperId, collectionId);
        })}
        onManageTags={() => {
          closeSidebarOnNarrowScreen();
          setDialog('tags');
        }}
      />}
      <main className="library-main">
        <div className="library-view-bar">
          <div><h1>{store.scope.startsWith('collection:') ? collectionLabel(snapshot.collections, store.scope.slice(11)) : store.scope === 'all' ? text(language, 'All papers', '全部论文') : text(language, ({ recent: 'Recently read', favorite: 'Starred', duplicates: 'Duplicates', trash: 'Trash' } as Record<string, string>)[store.scope] || store.scope, ({ recent: '最近阅读', favorite: '已加星标', duplicates: '重复项', trash: '废纸篓' } as Record<string, string>)[store.scope] || store.scope)}</h1><span>{text(language, `${papers.length} items`, `${papers.length} 项`)}</span></div>
          {store.scope === 'duplicates' && <button className="secondary-command" onClick={() => setDialog('duplicates')}><Copy /> {text(language, 'Review duplicates', '检查重复项')}</button>}
        </div>
        {selected.length > 0 && <div className="bulk-toolbar">
          <span>{text(language, `${selected.length} selected`, `已选择 ${selected.length} 项`)}</span>
          <button title={text(language, 'Toggle star', '切换星标')} onClick={() => void applyToSelected((paper) => updatePaperMetadata(paper.id, { favorite: !paper.favorite }).then(() => undefined))}><Star /> {text(language, 'Star', '星标')}</button>
          <select value={bulkCollection} aria-label={text(language, 'Add selected papers to collection', '将所选论文添加到集合')} onChange={(event) => {
            const value = event.target.value;
            setBulkCollection('');
            if (value) void applyToSelected((paper) => addPaperToCollection(paper.id, value));
          }}>
            <option value="">{text(language, 'Add to collection…', '添加到集合…')}</option>{snapshot.collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
          </select>
          <div className="bulk-tag"><Tags /><input value={bulkTag} placeholder={text(language, 'Add tag', '添加标签')} onChange={(event) => setBulkTag(event.target.value)} onKeyDown={(event) => {
            if (event.key === 'Enter' && bulkTag.trim()) void mutate(async () => {
              await addTag(selectedOrActive.map((paper) => paper.id), bulkTag);
              setBulkTag('');
            });
          }} /></div>
          {store.scope === 'trash'
            ? <button onClick={() => void applyToSelected((paper) => restorePaper(paper.id))}><ArchiveRestore /> {text(language, 'Restore', '恢复')}</button>
            : <button className="danger-command" onClick={() => void applyToSelected((paper) => movePaperToTrash(paper.id))}><Trash2 /> {text(language, 'Trash', '移入废纸篓')}</button>}
          <button className="clear-selection" title={text(language, 'Clear selection', '清除选择')} onClick={store.clearSelection}><X /></button>
        </div>}
        <PaperTable
          language={language}
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
        />
      </main>
      <PaperInspector
        language={language}
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
            await updatePaperMetadata(activePaper.id, patch, 'automatic');
          });
        }}
      />
    </div>
    {dialog === 'import' && <Suspense fallback={<div className="dialog-backdrop"><div className="dialog-loading">{text(language, 'Loading reference tools…', '正在加载文献工具…')}</div></div>}><ImportExportDialog language={language} papers={snapshot.papers.filter((paper) => paper.libraryState === 'saved')} exportPapers={selected.length ? selected : papers} onClose={() => setDialog(null)} onImported={store.requestRefresh} /></Suspense>}
    {dialog === 'duplicates' && <DuplicateReview language={language} papers={snapshot.papers.filter((paper) => paper.libraryState === 'saved')} onClose={() => setDialog(null)} onMerge={async (canonicalId, duplicateId) => mutate(async () => { await mergeDuplicatePapers(canonicalId, duplicateId); })} />}
    {dialog === 'tags' && <TagManagerDialog language={language} tags={snapshot.tags} onClose={() => setDialog(null)} onUpdate={async (tagId, patch) => mutate(async () => { await updateTag(tagId, patch); })} onMerge={async (sourceId, targetId) => mutate(async () => { await mergeTags(sourceId, targetId); })} />}
    {dialog === 'ai' && activePaper && <AiOrganizeReview language={language} paper={activePaper} snapshot={snapshot} onClose={() => setDialog(null)} onApply={applyAiProposal} />}
    {dialog === 'settings' && <LibrarySettingsDialog
      language={language}
      theme={theme}
      onClose={() => setDialog(null)}
      onThemeChange={setTheme}
    />}
    {dialog === 'cloud' && <div className="dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setDialog(null);
    }}>
      <section className="library-dialog cloud-library-dialog" role="dialog" aria-modal="true" aria-labelledby="cloud-library-title">
        <header>
          <div>
            <h2 id="cloud-library-title">{text(language, 'Google cloud library', 'Google 云端资料库')}</h2>
            <p>{text(
              language,
              'Sync this library across your devices with the same Google account.',
              '使用同一 Google 账号在多台设备间同步这份资料库。',
            )}</p>
          </div>
          <button title={text(language, 'Close', '关闭')} onClick={() => setDialog(null)}><X /></button>
        </header>
        <div className="cloud-library-content">
          <VaultSetup language={language} />
          <p>{text(
            language,
            'Library records are encrypted before upload. This is a private account library; it does not create a public Drive sharing link.',
            '资料库记录会在上传前加密。这是账号私有资料库，不会生成公开的 Drive 分享链接。',
          )}</p>
        </div>
      </section>
    </div>}
  </div>;
}
