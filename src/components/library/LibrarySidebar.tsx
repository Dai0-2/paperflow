import {
  BookOpen,
  Clock3,
  Copy,
  Library,
  Star,
  Tag as TagIcon,
  Trash2,
} from 'lucide-react';
import type { LibrarySnapshot } from '../../hooks/useLibraryQuery';
import { text } from '../../i18n';
import type { Collection, Language } from '../../types';
import { CollectionTree } from './CollectionTree';

interface LibrarySidebarProps {
  language: Language;
  snapshot: LibrarySnapshot;
  scope: string;
  onScopeChange: (scope: string) => void;
  onCreateCollection: (name: string, parentId?: string) => Promise<void>;
  onUpdateCollection: (collectionId: string, name: string, parentId?: string) => Promise<void>;
  onDeleteCollection: (collectionId: string) => Promise<void>;
  onManageTags: () => void;
}

interface ScopeButtonProps {
  icon: typeof Library;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}

function ScopeButton({ icon: Icon, label, count, active, onClick }: ScopeButtonProps) {
  return <button className="library-nav-item" data-active={active} onClick={onClick}>
    <Icon /><span>{label}</span>{count !== undefined && <b>{count}</b>}
  </button>;
}

export function LibrarySidebar(props: LibrarySidebarProps) {
  const saved = props.snapshot.papers.filter((paper) => paper.libraryState === 'saved');
  const trashed = props.snapshot.papers.filter((paper) => paper.libraryState === 'trashed').length;
  const collectionId = props.scope.startsWith('collection:') ? props.scope.slice(11) : undefined;
  return <aside className="library-sidebar">
    <nav className="library-primary-nav" aria-label={text(props.language, 'Library views', '资料库视图')}>
      <ScopeButton icon={Library} label={text(props.language, 'All papers', '全部论文')} count={saved.length} active={props.scope === 'all'} onClick={() => props.onScopeChange('all')} />
      <ScopeButton icon={Clock3} label={text(props.language, 'Recently added', '最近添加')} active={props.scope === 'recent'} onClick={() => props.onScopeChange('recent')} />
      <ScopeButton icon={Star} label={text(props.language, 'Starred', '已加星标')} count={saved.filter((paper) => paper.favorite).length} active={props.scope === 'favorite'} onClick={() => props.onScopeChange('favorite')} />
      <ScopeButton icon={BookOpen} label={text(props.language, 'Unread', '未读')} count={saved.filter((paper) => paper.readStatus === 'unread').length} active={props.scope === 'status:unread'} onClick={() => props.onScopeChange('status:unread')} />
      <ScopeButton icon={BookOpen} label={text(props.language, 'Reading', '阅读中')} count={saved.filter((paper) => paper.readStatus === 'reading').length} active={props.scope === 'status:reading'} onClick={() => props.onScopeChange('status:reading')} />
      <ScopeButton icon={BookOpen} label={text(props.language, 'Read', '已读')} count={saved.filter((paper) => paper.readStatus === 'read').length} active={props.scope === 'status:read'} onClick={() => props.onScopeChange('status:read')} />
      <ScopeButton icon={Copy} label={text(props.language, 'Duplicates', '重复项')} active={props.scope === 'duplicates'} onClick={() => props.onScopeChange('duplicates')} />
      <ScopeButton icon={Trash2} label={text(props.language, 'Trash', '废纸篓')} count={trashed} active={props.scope === 'trash'} onClick={() => props.onScopeChange('trash')} />
    </nav>
    <CollectionTree
      language={props.language}
      collections={props.snapshot.collections}
      activeId={collectionId}
      onSelect={(id) => props.onScopeChange(`collection:${id}`)}
      onCreate={props.onCreateCollection}
      onUpdate={props.onUpdateCollection}
      onDelete={props.onDeleteCollection}
    />
    <div className="tag-list">
      <div className="library-section-heading"><span>{text(props.language, 'Tags', '标签')}</span><button title={text(props.language, 'Manage tags', '管理标签')} onClick={props.onManageTags}><TagIcon /></button></div>
      {props.snapshot.tags.map((tag) => <button key={tag.id} className="library-nav-item" data-active={props.scope === `tag:${tag.id}`} onClick={() => props.onScopeChange(`tag:${tag.id}`)}>
        <i className="tag-swatch" style={{ backgroundColor: tag.color || '#8a8f94' }} />
        <span>{tag.name}</span>
        <b>{[...props.snapshot.paperTags.values()].filter((ids) => ids.includes(tag.id)).length}</b>
      </button>)}
    </div>
  </aside>;
}

export function collectionLabel(collections: Collection[], id: string): string {
  return collections.find((collection) => collection.id === id)?.name || 'Collection';
}
