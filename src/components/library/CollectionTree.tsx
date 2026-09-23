import { Check, Folder, FolderPlus, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { text } from '../../i18n';
import { PAPER_DRAG_TYPE, readPaperDragData } from '../../services/library/paperDrag';
import type { Collection, Language } from '../../types';

interface CollectionTreeProps {
  language: Language;
  collections: Collection[];
  activeId?: string;
  onSelect: (collectionId: string) => void;
  onCreate: (name: string, parentId?: string) => Promise<void>;
  onUpdate: (collectionId: string, name: string, parentId?: string) => Promise<void>;
  onDelete: (collectionId: string) => Promise<void>;
  onDropPapers: (collectionId: string, paperIds: string[]) => Promise<void>;
}

interface EditorState {
  id?: string;
  name: string;
  parentId?: string;
}

function descendants(collections: Collection[], parentId?: string, depth = 0): Array<{ item: Collection; depth: number }> {
  return collections
    .filter((item) => item.parentId === parentId)
    .flatMap((item) => [{ item, depth }, ...descendants(collections, item.id, depth + 1)]);
}

export function CollectionTree(props: CollectionTreeProps) {
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const flattened = descendants(props.collections);
  const save = async () => {
    if (!editor?.name.trim()) return;
    setSaving(true);
    try {
      if (editor.id) await props.onUpdate(editor.id, editor.name, editor.parentId);
      else await props.onCreate(editor.name, editor.parentId);
      setEditor(null);
    } finally {
      setSaving(false);
    }
  };
  return <div className="collection-tree">
    <div className="library-section-heading">
      <span>{text(props.language, 'Collections', '集合')}</span>
      <button title={text(props.language, 'New collection', '新建集合')} aria-label={text(props.language, 'New collection', '新建集合')} onClick={() => setEditor({ name: '' })}><FolderPlus /></button>
    </div>
    {flattened.map(({ item, depth }) => <div className="collection-row-wrap" key={item.id}>
      {editor?.id === item.id
        ? <div className="collection-editor" style={{ paddingLeft: 9 + depth * 14 }}>
            <input value={editor.name} aria-label={text(props.language, 'Collection name', '集合名称')} onChange={(event) => setEditor({ ...editor, name: event.target.value })} />
            <select value={editor.parentId || ''} aria-label={text(props.language, 'Parent collection', '上级集合')} onChange={(event) => setEditor({ ...editor, parentId: event.target.value || undefined })}>
              <option value="">{text(props.language, 'Top level', '顶层')}</option>
              {props.collections.filter((candidate) => candidate.id !== item.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </select>
            <button title={text(props.language, 'Save collection', '保存集合')} disabled={saving} onClick={() => void save()}><Check /></button>
            <button title={text(props.language, 'Cancel', '取消')} onClick={() => setEditor(null)}><X /></button>
          </div>
        : <div
            className="collection-row"
            data-active={props.activeId === item.id}
            data-drop-target={dropTarget === item.id}
            style={{ paddingLeft: 10 + depth * 14 }}
            onDragEnter={(event) => {
              if (event.dataTransfer.types.includes(PAPER_DRAG_TYPE)) setDropTarget(item.id);
            }}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes(PAPER_DRAG_TYPE)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
              setDropTarget(item.id);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const paperIds = readPaperDragData(event.dataTransfer);
              setDropTarget(null);
              if (paperIds.length) void props.onDropPapers(item.id, paperIds);
            }}
          >
            <button className="collection-name" onClick={() => props.onSelect(item.id)}><Folder /><span>{item.name}</span></button>
            <div className="collection-actions">
              <button title={text(props.language, 'New subcollection', '新建子集合')} onClick={() => setEditor({ name: '', parentId: item.id })}><Plus /></button>
              <button title={text(props.language, 'Rename or move', '重命名或移动')} onClick={() => setEditor({ id: item.id, name: item.name, parentId: item.parentId })}><Pencil /></button>
              <button title={text(props.language, 'Delete collection', '删除集合')} onClick={() => void props.onDelete(item.id)}><Trash2 /></button>
            </div>
          </div>}
    </div>)}
    {editor && !editor.id && <div className="collection-editor" style={{ paddingLeft: editor.parentId ? 23 : 9 }}>
      <input autoFocus value={editor.name} placeholder={text(props.language, 'Collection name', '集合名称')} aria-label={text(props.language, 'Collection name', '集合名称')} onChange={(event) => setEditor({ ...editor, name: event.target.value })} onKeyDown={(event) => {
        if (event.key === 'Enter') void save();
        if (event.key === 'Escape') setEditor(null);
      }} />
      <button title={text(props.language, 'Save collection', '保存集合')} disabled={saving} onClick={() => void save()}><Check /></button>
      <button title={text(props.language, 'Cancel', '取消')} onClick={() => setEditor(null)}><X /></button>
    </div>}
  </div>;
}
