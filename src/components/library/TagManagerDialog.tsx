import { GitMerge, Save, X } from 'lucide-react';
import { useState } from 'react';
import { text } from '../../i18n';
import type { Language, Tag } from '../../types';

interface TagManagerDialogProps {
  language: Language;
  tags: Tag[];
  onClose: () => void;
  onUpdate: (tagId: string, patch: { name: string; color?: string }) => Promise<void>;
  onMerge: (sourceTagId: string, targetTagId: string) => Promise<void>;
}

export function TagManagerDialog({ language, tags, onClose, onUpdate, onMerge }: TagManagerDialogProps) {
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  return <div className="dialog-backdrop" role="presentation">
    <section className="library-dialog tag-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="tag-manager-title">
      <header><div><h2 id="tag-manager-title">{text(language, 'Manage tags', '管理标签')}</h2><p>{text(language, 'Rename, recolor, or merge tags across the library.', '重命名、调整颜色或合并资料库中的标签。')}</p></div><button title={text(language, 'Close', '关闭')} onClick={onClose}><X /></button></header>
      <div className="tag-manager-content">
        <div className="tag-editor-list">{tags.map((tag) => <TagEditor language={language} key={`${tag.id}:${tag.updatedAt}`} tag={tag} onSave={onUpdate} />)}</div>
        <section className="tag-merge">
          <h3>{text(language, 'Merge tags', '合并标签')}</h3>
          <div><select aria-label={text(language, 'Tag to merge', '要合并的标签')} value={sourceId} onChange={(event) => setSourceId(event.target.value)}><option value="">{text(language, 'Merge from…', '合并来源…')}</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select><span>{text(language, 'into', '到')}</span><select aria-label={text(language, 'Target tag', '目标标签')} value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">{text(language, 'Keep tag…', '保留标签…')}</option>{tags.filter((tag) => tag.id !== sourceId).map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select><button className="primary-button" disabled={busy || !sourceId || !targetId} onClick={() => {
            setBusy(true);
            void onMerge(sourceId, targetId).then(() => {
              setSourceId('');
              setTargetId('');
            }).finally(() => setBusy(false));
          }}><GitMerge /> {text(language, 'Merge', '合并')}</button></div>
        </section>
      </div>
    </section>
  </div>;
}

function TagEditor({ language, tag, onSave }: { language: Language; tag: Tag; onSave: TagManagerDialogProps['onUpdate'] }) {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color || '#6f777d');
  return <div className="tag-editor-row">
    <input type="color" aria-label={text(language, `Color for ${tag.name}`, `${tag.name} 的颜色`)} value={color} onChange={(event) => setColor(event.target.value)} />
    <input aria-label={text(language, `Name for ${tag.name}`, `${tag.name} 的名称`)} value={name} onChange={(event) => setName(event.target.value)} />
    <button title={text(language, `Save ${tag.name}`, `保存 ${tag.name}`)} disabled={!name.trim()} onClick={() => void onSave(tag.id, { name, color })}><Save /></button>
  </div>;
}
