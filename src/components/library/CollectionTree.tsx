import { Check, Folder, FolderPlus, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { Collection } from '../../types';

interface CollectionTreeProps {
  collections: Collection[];
  activeId?: string;
  onSelect: (collectionId: string) => void;
  onCreate: (name: string, parentId?: string) => Promise<void>;
  onUpdate: (collectionId: string, name: string, parentId?: string) => Promise<void>;
  onDelete: (collectionId: string) => Promise<void>;
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
      <span>Collections</span>
      <button title="New collection" aria-label="New collection" onClick={() => setEditor({ name: '' })}><FolderPlus /></button>
    </div>
    {flattened.map(({ item, depth }) => <div className="collection-row-wrap" key={item.id}>
      {editor?.id === item.id
        ? <div className="collection-editor" style={{ paddingLeft: 9 + depth * 14 }}>
            <input value={editor.name} aria-label="Collection name" onChange={(event) => setEditor({ ...editor, name: event.target.value })} />
            <select value={editor.parentId || ''} aria-label="Parent collection" onChange={(event) => setEditor({ ...editor, parentId: event.target.value || undefined })}>
              <option value="">Top level</option>
              {props.collections.filter((candidate) => candidate.id !== item.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </select>
            <button title="Save collection" disabled={saving} onClick={() => void save()}><Check /></button>
            <button title="Cancel" onClick={() => setEditor(null)}><X /></button>
          </div>
        : <div className="collection-row" data-active={props.activeId === item.id} style={{ paddingLeft: 10 + depth * 14 }}>
            <button className="collection-name" onClick={() => props.onSelect(item.id)}><Folder /><span>{item.name}</span></button>
            <div className="collection-actions">
              <button title="New subcollection" onClick={() => setEditor({ name: '', parentId: item.id })}><Plus /></button>
              <button title="Rename or move" onClick={() => setEditor({ id: item.id, name: item.name, parentId: item.parentId })}><Pencil /></button>
              <button title="Delete collection" onClick={() => void props.onDelete(item.id)}><Trash2 /></button>
            </div>
          </div>}
    </div>)}
    {editor && !editor.id && <div className="collection-editor" style={{ paddingLeft: editor.parentId ? 23 : 9 }}>
      <input autoFocus value={editor.name} placeholder="Collection name" aria-label="Collection name" onChange={(event) => setEditor({ ...editor, name: event.target.value })} onKeyDown={(event) => {
        if (event.key === 'Enter') void save();
        if (event.key === 'Escape') setEditor(null);
      }} />
      <button title="Save collection" disabled={saving} onClick={() => void save()}><Check /></button>
      <button title="Cancel" onClick={() => setEditor(null)}><X /></button>
    </div>}
  </div>;
}
