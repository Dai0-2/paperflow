import { Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PaperNote } from '../../types';

interface NoteEditorProps {
  notes: PaperNote[];
  onSave: (input: { id?: string; title: string; content: string }) => Promise<void>;
  onDelete: (noteId: string) => Promise<void>;
}

export function NoteEditor({ notes, onSave, onDelete }: NoteEditorProps) {
  const [activeId, setActiveId] = useState<string | null>(notes[0]?.id || null);
  const active = notes.find((note) => note.id === activeId);
  const [title, setTitle] = useState(active?.title || '');
  const [content, setContent] = useState(active?.content || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next = notes.find((note) => note.id === activeId) || notes[0];
    setActiveId(next?.id || null);
    setTitle(next?.title || '');
    setContent(next?.content || '');
  }, [activeId, notes]);

  const save = async () => {
    if (!title.trim() && !content.trim()) return;
    setSaving(true);
    try {
      await onSave({ id: activeId || undefined, title, content });
    } finally {
      setSaving(false);
    }
  };
  return <div className="note-editor">
    <div className="note-list">
      {notes.map((note) => <button key={note.id} data-active={note.id === activeId} onClick={() => setActiveId(note.id)}>
        <strong>{note.title}</strong><span>{new Date(note.updatedAt).toLocaleDateString()}</span>
      </button>)}
      <button className="new-note" onClick={() => {
        setActiveId(null);
        setTitle('');
        setContent('');
      }}><Plus /> New note</button>
    </div>
    <div className="note-fields">
      <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Note title" aria-label="Note title" />
      <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Write in Markdown…" aria-label="Note content" />
      <div>
        {activeId && <button className="danger-text" onClick={() => void onDelete(activeId)}><Trash2 /> Delete</button>}
        <button className="primary-button" disabled={saving || (!title.trim() && !content.trim())} onClick={() => void save()}><Save /> Save note</button>
      </div>
    </div>
  </div>;
}
