import { GitMerge, Save, X } from 'lucide-react';
import { useState } from 'react';
import type { Tag } from '../../types';

interface TagManagerDialogProps {
  tags: Tag[];
  onClose: () => void;
  onUpdate: (tagId: string, patch: { name: string; color?: string }) => Promise<void>;
  onMerge: (sourceTagId: string, targetTagId: string) => Promise<void>;
}

export function TagManagerDialog({ tags, onClose, onUpdate, onMerge }: TagManagerDialogProps) {
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  return <div className="dialog-backdrop" role="presentation">
    <section className="library-dialog tag-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="tag-manager-title">
      <header><div><h2 id="tag-manager-title">Manage tags</h2><p>Rename, recolor, or merge tags across the library.</p></div><button title="Close" onClick={onClose}><X /></button></header>
      <div className="tag-manager-content">
        <div className="tag-editor-list">{tags.map((tag) => <TagEditor key={`${tag.id}:${tag.updatedAt}`} tag={tag} onSave={onUpdate} />)}</div>
        <section className="tag-merge">
          <h3>Merge tags</h3>
          <div><select aria-label="Tag to merge" value={sourceId} onChange={(event) => setSourceId(event.target.value)}><option value="">Merge from…</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select><span>into</span><select aria-label="Target tag" value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">Keep tag…</option>{tags.filter((tag) => tag.id !== sourceId).map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select><button className="primary-button" disabled={busy || !sourceId || !targetId} onClick={() => {
            setBusy(true);
            void onMerge(sourceId, targetId).then(() => {
              setSourceId('');
              setTargetId('');
            }).finally(() => setBusy(false));
          }}><GitMerge /> Merge</button></div>
        </section>
      </div>
    </section>
  </div>;
}

function TagEditor({ tag, onSave }: { tag: Tag; onSave: TagManagerDialogProps['onUpdate'] }) {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color || '#6f777d');
  return <div className="tag-editor-row">
    <input type="color" aria-label={`Color for ${tag.name}`} value={color} onChange={(event) => setColor(event.target.value)} />
    <input aria-label={`Name for ${tag.name}`} value={name} onChange={(event) => setName(event.target.value)} />
    <button title={`Save ${tag.name}`} disabled={!name.trim()} onClick={() => void onSave(tag.id, { name, color })}><Save /></button>
  </div>;
}
