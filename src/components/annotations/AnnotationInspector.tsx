import { Save, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Annotation } from '../../types';

const COLORS = ['#f4cf4f', '#67bd77', '#5e9ee8', '#df78a8', '#d85d5d'];

export function AnnotationInspector({
  annotation,
  onClose,
  onUpdate,
  onDelete,
}: {
  annotation?: Annotation;
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

  return <aside className="annotation-inspector" aria-label="Annotation inspector">
    <header>
      <div>
        <strong>{annotation.type || 'highlight'}</strong>
        <span>Page {annotation.page}</span>
      </div>
      <button title="Close inspector" aria-label="Close inspector" onClick={onClose}><X /></button>
    </header>
    {annotation.text && <blockquote>{annotation.text}</blockquote>}
    <div className="annotation-inspector-colors" aria-label="Annotation color">
      {COLORS.map((value) => <button
        key={value}
        title={`Use ${value}`}
        aria-label={`Use annotation color ${value}`}
        data-active={color === value}
        style={{ '--annotation-color': value } as React.CSSProperties}
        onClick={() => setColor(value)}
      />)}
    </div>
    <label>
      <span>Comment</span>
      <textarea
        autoFocus={annotation.type === 'text'}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Add a note"
      />
    </label>
    <footer>
      <button className="annotation-delete" title="Delete annotation" onClick={() => void onDelete()}><Trash2 />Delete</button>
      <button className="annotation-save" disabled={saving} onClick={() => void save()}><Save />{saving ? 'Saving' : 'Save'}</button>
    </footer>
  </aside>;
}
