import { Save, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { text } from '../../i18n';
import type { Annotation, Language } from '../../types';

const COLORS = ['#f4cf4f', '#67bd77', '#5e9ee8', '#df78a8', '#d85d5d'];

export function AnnotationInspector({
  annotation,
  language,
  onClose,
  onUpdate,
  onDelete,
}: {
  annotation?: Annotation;
  language: Language;
  onClose: () => void;
  onUpdate: (patch: Pick<Annotation, 'comment' | 'color'>) => Promise<unknown>;
  onDelete: () => Promise<void>;
}) {
  const [comment, setComment] = useState('');
  const [color, setColor] = useState('#f4cf4f');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setComment(annotation?.comment || '');
    setColor(annotation?.color || '#f4cf4f');
  }, [annotation]);

  if (!annotation) return null;

  const save = async () => {
    setSaving(true);
    try {
      await onUpdate({ comment: comment.trim(), color });
    } finally {
      setSaving(false);
    }
  };

  return <aside className="annotation-inspector" aria-label={text(language, 'Annotation inspector', '批注详情')}>
    <header>
      <div>
        <strong>{annotation.type || 'highlight'}</strong>
        <span>{text(language, `Page ${annotation.page}`, `第 ${annotation.page} 页`)}</span>
      </div>
      <button title={text(language, 'Close inspector', '关闭批注详情')} aria-label={text(language, 'Close inspector', '关闭批注详情')} onClick={onClose}><X /></button>
    </header>
    {annotation.text && <blockquote>{annotation.text}</blockquote>}
    <div className="annotation-inspector-colors" aria-label={text(language, 'Annotation color', '批注颜色')}>
      {COLORS.map((value) => <button
        key={value}
        title={text(language, `Use ${value}`, `使用 ${value}`)}
        aria-label={text(language, `Use annotation color ${value}`, `使用批注颜色 ${value}`)}
        data-active={color === value}
        style={{ '--annotation-color': value } as React.CSSProperties}
        onClick={() => setColor(value)}
      />)}
    </div>
    <label>
      <span>{text(language, 'Comment', '评论')}</span>
      <textarea
        autoFocus={annotation.type === 'text'}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder={text(language, 'Add a note', '添加笔记')}
      />
    </label>
    <footer>
      <button className="annotation-delete" title={text(language, 'Delete annotation', '删除批注')} onClick={() => void onDelete()}><Trash2 />{text(language, 'Delete', '删除')}</button>
      <button className="annotation-save" disabled={saving} onClick={() => void save()}><Save />{saving ? text(language, 'Saving', '正在保存') : text(language, 'Save', '保存')}</button>
    </footer>
  </aside>;
}
